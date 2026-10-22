/**
 * 下载工具模块 - 优化版
 * 
 * 功能：
 * 1. 并行分块下载 - 大文件分块并发下载提速（类似 IDM）
 * 2. 完善的断点续传 - 支持暂停/恢复/取消
 * 3. 智能重试 - 指数退避、错误分类（404不重试、5xx重试）
 * 4. 并发池控制 - 限制同时下载数避免资源耗尽
 * 5. 停滞检测 - 自动检测并恢复停滞的下载
 */

import * as https from 'https'
import * as http from 'http'
import * as fs from 'fs'
import { getProxyAgent } from './proxy'
import { createHash } from 'crypto'
import { mt } from './locale'

// ============ 配置常量 ============
const DOWNLOAD_UA = 'ZNCL-Launcher/1.0.0 (Minecraft Launcher)'
// Modrinth 在部分国内网络下被限速到几十 KB/s，单连接下一个 10MB 的整合包
// 要几分钟。阈值必须放低，多连接是唯一有效的提速手段。
const PARALLEL_MIN_SIZE = 2 * 1024 * 1024   // 2MB 以上就尝试分块并发
const PARALLEL_CHUNKS = 8                   // 默认分块数（兜底）
const MAX_CONCURRENT_DOWNLOADS = 32         // 最大并发下载数
// 超时按"链路空闲"判定而非总时长。慢速网络下一个分块可能几十秒才有新数据，
  // 30s 空闲阈值会让分块反复超时 → 整文件回退单流重头再下，反而更慢且更容易缺文件
const STALL_TIMEOUT_MS = 60000              // 停滞超时 60s
const REQUEST_TIMEOUT_MS = 60000            // 请求超时 60s
const GLOBAL_TIMEOUT_MS = 180000            // 全局超时 180s

// 全局强制取消标记（与旧版 index.ts 中的 forceCancelAllDownloads 对应）
let forceCancelAllDownloads = false

export function setForceCancelAllDownloads(value: boolean): void {
  forceCancelAllDownloads = value
}

export function getForceCancelAllDownloads(): boolean {
  return forceCancelAllDownloads
}

// ============ 类型定义 ============
export interface DownloadOptions {
  url: string
  dest: string
  onProgress?: (progress: number, speed?: number, threads?: number, totalBytes?: number) => void
  onCancel?: () => boolean
  onPauseCheck?: () => boolean
  onRequestCreated?: (req: http.ClientRequest) => void
  maxRetries?: number
  enableParallel?: boolean
  followRedirects?: boolean
  knownTotalSize?: number
  /** 期望的 SHA-1（Modrinth API 会给出）。下载完成后校验，不符则失败。 */
  expectedSha1?: string
  /** 备用链路：分块会轮流分配（如 Modrinth 的官方 CDN），摊开单源并发。 */
  altUrls?: string[]
}

export interface DownloadResult {
  success: boolean
  error?: string
  cancelled?: boolean
  paused?: boolean
}

// ============ 并发池管理 ============
class DownloadPool {
  private running = 0
  private queue: Array<() => void> = []

  constructor(private maxConcurrent: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise<void>(resolve => this.queue.push(resolve))
    }
    this.running++
    try {
      return await fn()
    } finally {
      this.running--
      if (this.queue.length > 0) {
        this.queue.shift()!()
      }
    }
  }
}

export const downloadPool = new DownloadPool(MAX_CONCURRENT_DOWNLOADS)

// ============ 全局连接预算（可在设置中调整） ============
// 并行分块会放大连接数（worker 数 × 分块数），CDN 会因此限速甚至直接掐断，
// 表现为"越下越慢"。这里给所有数据传输（单流文件 / 单个分块）设置统一上限。
// 慢速线路下单连接常只有几十 KB/s，"连接数≈带宽"，上限过低会让大文件也快不起来。
// 默认 96：镜像与官方两条链路各分一半（见 index.ts 的候选链路轮转），
// 单源并发因此和旧的 48 相当，但总吞吐翻倍；用户可在 8~128 之间调整。
let downloadThreads = 96

// ===== 分块数控制参数 =====
// 实测（Modrinth 官方 CDN 与 MCIM 镜像都一样）这类源是**按单条连接限速**：
// 每连接约 16~20 KB/s，总吞吐随连接数近似线性增长（1→64 连接：27→1461 KB/s）。
// 所以"并发连接数"是唯一有效的提速杆：线程数设多少，单个大文件就切多少块。
//   ① 不超过全局连接预算 downloadThreads
//   ② 每块至少 1MB（小文件不切太碎，也避免 TLS 握手开销吃掉收益）
//   ③ 绝对上限 128（官方 CDN 吃到 128 连接仍正常；但 MCIM 镜像超过约 64 连接
//      会被封 IP——实测 128 连接后全部失败，因此并行分块会把块轮流铺到
//      镜像 + 官方两条链路，单源并发天然压在半数，既提速又不会把源打爆）
const CHUNK_MIN = 4
const CHUNK_MAX = 128
const MIN_BYTES_PER_CHUNK = 1024 * 1024

/** 设置全局并发线程数，返回生效值。 */
export function setDownloadThreads(n: number): number {
  const v = Math.round(Number(n))
  if (Number.isFinite(v) && v >= 8 && v <= 128) {
    downloadThreads = v
    globalConnLimit.setLimit(v)
    console.log(`[Download] 并发线程数 = ${v}`)
  }
  return downloadThreads
}

export function getDownloadThreads(): number {
  return downloadThreads
}

// ============ 连接预算（全局 + 单源）============
// 这类 CDN（Modrinth 官方 / MCIM 镜像 / BMCLAPI）都是**按单条连接限速**的：
// 单连接常常只有几十 KB/s，"连接数 ≈ 带宽"。所以提速的唯一有效手段是把并发连接摊开。
//
// 但单一来源有它的脾气：MCIM 镜像在约 64 条并发后会把 IP 拉黑（实测 128 条全挂）。
// 之前所有连接共享同一个全局预算、且单流文件都从同一个地址起步，
// 结果用户把线程调高时会把**全部**连接压到镜像上：既容易被限速/封禁，
// 官方 CDN 又完全空闲。
//
// 现在拆成两层预算：
//   - 全局预算 downloadThreads：所有数据传输的并发上限（设置里的"下载并发线程数"）
//   - 单源预算：任一 host 的并发上限。国内镜像给得更保守（易封 IP），
//     官方 / 通用源放宽，让"镜像 + 官方"两条链路各自跑满
// 配合调用方在多条候选链路间轮转（见 index.ts 的 candidateUrls），
// 就能把总并发放心拉高，而每个源都不越界。
const MIRROR_CONN_LIMIT = 48   // 已知易封禁的国内镜像（MCIM / BMCLAPI 等）
const DEFAULT_CONN_LIMIT = 96  // 其它来源（Modrinth 官方 CDN、GitHub、MediaFire 等）
const CAPPED_MIRROR_HOSTS = ['mcimirror.top', 'bangbang93.com', 'mcbbs.net']

function hostConnLimit(host: string): number {
  const h = (host || '').toLowerCase()
  return CAPPED_MIRROR_HOSTS.some(s => h === s || h.endsWith('.' + s))
    ? MIRROR_CONN_LIMIT
    : DEFAULT_CONN_LIMIT
}

class Semaphore {
  private active = 0
  private waiters: (() => void)[] = []
  constructor(private limit: number) {}

  setLimit(n: number): void {
    this.limit = Math.max(1, Math.round(n))
  }

  async acquire(): Promise<void> {
    // 每次 release 只唤醒一个等待者，被唤醒者重新判断条件，避免超发
    while (this.active >= this.limit) {
      await new Promise<void>(resolve => this.waiters.push(resolve))
    }
    this.active++
  }

  release(): void {
    this.active = Math.max(0, this.active - 1)
    const next = this.waiters.shift()
    if (next) next()
  }

  get count(): number {
    return this.active
  }
}

const globalConnLimit = new Semaphore(downloadThreads)
const perHostLimits = new Map<string, Semaphore>()

function hostKey(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

function hostSemaphore(host: string): Semaphore {
  let s = perHostLimits.get(host)
  if (!s) {
    s = new Semaphore(hostConnLimit(host))
    perHostLimits.set(host, s)
  }
  return s
}

/**
 * 占用一个连接额度：先占该 host 的单源额度、再占全局额度。
 * 调用方必须在结束后用「同一个 url」调用 releaseConnection，两处必须配对，
 * 否则额度会泄漏（最终所有下载都卡在等待额度上）。
 */
async function acquireConnection(url: string): Promise<void> {
  const host = hostKey(url)
  const hostSem = hostSemaphore(host)
  await hostSem.acquire()
  try {
    await globalConnLimit.acquire()
  } catch (e) {
    hostSem.release()
    throw e
  }
}

function releaseConnection(url: string): void {
  globalConnLimit.release()
  hostSemaphore(hostKey(url)).release()
}

function getActiveConnections(): number {
  return globalConnLimit.count
}

// ============ Modrinth 国内镜像（MCIM） ============
// 官方 cdn.modrinth.com / api.modrinth.com 在国内常被限速到几十 KB/s。
// MCIM 提供与官方同结构的国内镜像，可直接替换域名：
//   https://cdn.modrinth.com/...      -> https://mod.mcimirror.top/...
//   https://api.modrinth.com/v2/...   -> https://mod.mcimirror.top/modrinth/v2/...
export const MODRINTH_MIRROR_HOST = 'https://mod.mcimirror.top'
let modrinthMirrorEnabled = false

export function setModrinthMirrorEnabled(v: boolean): boolean {
  modrinthMirrorEnabled = !!v
  console.log(`[Download] Modrinth 镜像源: ${modrinthMirrorEnabled ? '开启' : '关闭'}`)
  return modrinthMirrorEnabled
}

export function isModrinthMirrorEnabled(): boolean {
  return modrinthMirrorEnabled
}

/**
 * 返回一个 Modrinth 资源的候选下载地址列表：
 *  - 镜像开启时：镜像地址在前、官方地址兜底（镜像抽风也能自动回退）
 *  - 镜像关闭或非 Modrinth 地址：原样返回
 */
export function modrinthCandidates(url: string): string[] {
  if (!url || (!url.includes('cdn.modrinth.com') && !url.includes('api.modrinth.com'))) {
    return [url]
  }
  if (!modrinthMirrorEnabled) return [url]
  const mirror = url
    .replace(/^https?:\/\/cdn\.modrinth\.com/i, MODRINTH_MIRROR_HOST)
    .replace(/^https?:\/\/api\.modrinth\.com/i, MODRINTH_MIRROR_HOST + '/modrinth')
  if (mirror === url) return [url]
  return [mirror, url]
}

// ============ 工具函数 ============

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(k))
  return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 取该 URL 应使用的代理 agent（未启用代理 / 命中直连白名单时返回 undefined，即直连）。
 * 所有出网请求都要带上它，代理设置才会对下载真正生效。
 */
function proxyAgentFor(u: string): http.Agent | https.Agent | undefined {
  try {
    const p = new URL(u)
    return getProxyAgent(p.protocol, p.hostname)
  } catch {
    return getProxyAgent(u.startsWith('https') ? 'https:' : 'http:')
  }
}

// ============ 并行分块下载 ============
async function probeRangeUrl(url: string): Promise<{ finalUrl: string; total: number; supportsRange: boolean } | null> {
  let current = url
  for (let i = 0; i < 10; i++) {
    try {
      const result = await new Promise<any>((resolve) => {
        const protocol = current.startsWith('https') ? https : http
        const req = protocol.get(current, { 
          headers: { 
            'User-Agent': DOWNLOAD_UA, 
            'Range': 'bytes=0-0' 
          },
          agent: proxyAgentFor(current)
        }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || 
              res.statusCode === 307 || res.statusCode === 308) {
            const loc = res.headers.location
            res.resume()
            if (loc) {
              let next = loc
              try { next = new URL(loc, current).toString() } catch {}
              resolve({ redirect: next })
            } else {
              resolve({ finalUrl: current, total: 0, supportsRange: false })
            }
            return
          }
          if (res.statusCode === 206) {
            const cr = res.headers['content-range'] || ''
            const m = cr.match(/\/(\d+)$/)
            const total = m ? parseInt(m[1]) : 0
            res.resume()
            resolve({ finalUrl: current, total, supportsRange: total > 0 })
            return
          }
          res.resume()
          resolve({ finalUrl: current, total: parseInt(res.headers['content-length'] || '0'), supportsRange: false })
        })
        req.on('error', () => resolve({ finalUrl: current, total: 0, supportsRange: false }))
        req.setTimeout(15000, () => { req.destroy(); resolve({ finalUrl: current, total: 0, supportsRange: false }) })
      })
      if (result.redirect) {
        current = result.redirect
        continue
      }
      return result
    } catch {
      return null
    }
  }
  return null
}

async function tryParallelDownload(
  url: string, 
  dest: string, 
  onProgress?: (progress: number, speed?: number, threads?: number, totalBytes?: number) => void, 
  onCancel?: () => boolean, 
  onPauseCheck?: () => boolean,
  onRequestCreated?: (req: http.ClientRequest) => void,
  knownTotalSize: number = 0,
  // 必须显式接收：之前直接引用未定义的变量，遇到 307 重定向会抛 ReferenceError，
  // 导致分块下载对 Modrinth（永远 307）全部失败
  followRedirects: boolean = true,
  // 备用链路（如 Modrinth 的官方 CDN）：分块会轮流分配到这些地址上，
  // 把单一源的并发压力摊开，同时绕开单源限流
  altUrls?: string[]
): Promise<'completed' | 'failed' | 'unsupported'> {
  // 等待暂停恢复
  const waitIfPaused = async (): Promise<boolean> => {
    if (!onPauseCheck) return false
    while (onPauseCheck()) {
      await new Promise(resolve => setTimeout(resolve, 200))
      if (onCancel && onCancel()) return true
    }
    return false
  }
  
  if (await waitIfPaused()) return 'unsupported'
  if (fs.existsSync(dest)) {
    try {
      if (fs.statSync(dest).size > 0) return 'unsupported'
    } catch {}
  }

  let finalUrl = url
  let total = knownTotalSize

  // 如果没有已知大小，做 Range 探测
  if (total <= 0) {
    try {
      const probe = await probeRangeUrl(url)
      if (!probe || !probe.supportsRange || probe.total < PARALLEL_MIN_SIZE) return 'unsupported'
      finalUrl = probe.finalUrl
      total = probe.total
    } catch {
      return 'unsupported'
    }
  }

  // 分块在多条链路上轮流分配：单源并发上限不同（MCIM 镜像超 ~64 连接会封 IP，
  // 官方 CDN 能吃到 128+），把块铺到两条链路上既能拉高总并发、又不会打爆单一源。
  const chunkUrls: string[] = [finalUrl]
  for (const u of altUrls || []) {
    if (u && !chunkUrls.includes(u)) chunkUrls.push(u)
  }

  // 用户线程数就是单文件的并发目标：这类源按连接限速，连接数 = 带宽。
  // 每块至少 1MB，小文件不切太碎；上限 128。
  const byteCap = Math.max(CHUNK_MIN, Math.floor(total / MIN_BYTES_PER_CHUNK))
  const chunkCount = Math.max(1, Math.min(downloadThreads, CHUNK_MAX, byteCap))
  if (chunkCount > 1) {
    console.log(`[Download] ${Math.round(total / 1048576)}MB 文件分 ${chunkCount} 块（${downloadThreads} 线程${chunkUrls.length > 1 ? `，${chunkUrls.length} 条链路` : ''}）`)
  }
  
  const partFiles: string[] = []
  for (let i = 0; i < chunkCount; i++) partFiles.push(`${dest}.part${i}`)
  for (const p of partFiles) { try { fs.unlinkSync(p) } catch {} }
  if (fs.existsSync(dest)) { try { fs.unlinkSync(dest) } catch {} }

  const requests: http.ClientRequest[] = []
  if (onRequestCreated) {
    onRequestCreated({ destroy: () => { requests.forEach(r => { try { r.destroy() } catch {} }) } } as any)
  }

  let received = 0
  let lastReport = Date.now()
  let lastBytes = 0
  let speedEwma = 0
  let aborted = false

  const report = () => {
    if (!onProgress || total <= 0) return
    const now = Date.now()
    const dt = now - lastReport
    // 被限速的 CDN 常常是"憋一大段再突发"的 trickle 模式。
    // 用 400ms 窗口算瞬时速度会几乎每次都落在两次突发之间，显示成 0.0 KB/s，
    // 用户就以为卡死了。窗口拉长到 700ms 并做 EWMA 平滑。
    if (dt >= 700) {
      // 单位必须是 字节/秒：UI 的 formatSpeed / 预计剩余时间都按 bytes/s 计算。
      // 之前这里多除了 1024（按 KB/s 上报），导致界面显示速度缩小约 1024 倍、
      // 预计剩余时间放大约 1024 倍（几十 KB/s 被显示成几十 B/s、几分钟显示成几十小时）。
      const instant = dt > 0 ? (received - lastBytes) / (dt / 1000) : 0
      speedEwma = speedEwma === 0 ? instant : speedEwma * 0.65 + instant * 0.35
      onProgress(Math.min(99, Math.round((received / total) * 100)), Math.round(speedEwma), chunkCount, total)
      lastReport = now
      lastBytes = received
    }
  }

  try {
    const chunkSize = Math.ceil(total / chunkCount)

    const downloadChunk = async (i: number): Promise<void> => {
      const start = i * chunkSize
      const end = Math.min(total - 1, start + chunkSize - 1)
      if (start > end) return

      let urlForChunk = chunkUrls[i % chunkUrls.length]
      for (let attempt = 0; attempt < 3; attempt++) {
        // 重试时换到下一条链路：单源被限流/封禁时能自动绕开
        urlForChunk = chunkUrls[(i + attempt) % chunkUrls.length]
        if (await waitIfPaused()) {
          aborted = true
          throw new Error('下载已取消')
        }
        if (aborted || (onCancel && onCancel())) {
          aborted = true
          throw new Error('下载已取消')
        }
        let redirected = 0
        // 该分块占用一个连接额度（全局 + 单源），避免 worker × 分块把连接数打爆
        await acquireConnection(urlForChunk)
        let connectionHeld = true
        const releaseChunkConnection = () => {
          if (!connectionHeld) return
          connectionHeld = false
          releaseConnection(urlForChunk)
        }
        try {
          const ok = await new Promise<boolean>((resolveC, rejectC) => {
            const follow = (targetUrl: string) => {
              const protocol = targetUrl.startsWith('https') ? https : http
              const req = protocol.get(targetUrl, { 
                headers: { 
                  'User-Agent': DOWNLOAD_UA, 
                  'Range': `bytes=${start}-${end}` 
                },
                agent: proxyAgentFor(targetUrl)
              }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || 
                    res.statusCode === 307 || res.statusCode === 308) {
                  const loc = res.headers.location
                  res.resume()
                  if (!followRedirects || !loc || redirected >= 5) { rejectC(new Error(mt('mu.redirectFailed'))); return }
                  redirected++
                  let next = loc
                  try { next = new URL(loc, targetUrl).toString() } catch {}
                  follow(next)
                  return
                }
                if (res.statusCode !== 206) {
                  res.resume()
                  rejectC(new Error(`状态码: ${res.statusCode}`))
                  return
                }
                // 必须校验服务器真的按请求的区间返回。
                // 有些服务器/代理会忽略 Range 直接从头发 200 或给错区间，
                // 这种情况字节数可能完全正确但内容整体错位，
                // 只比对长度发现不了，必须看 Content-Range
                const crHeader = String(res.headers['content-range'] || '')
                const crMatch = /bytes\s+(\d+)\s*-\s*(\d+)\s*\//i.exec(crHeader)
                if (!crMatch || Number(crMatch[1]) !== start || Number(crMatch[2]) !== end) {
                  res.resume()
                  rejectC(new Error(mt('mu.chunkRangeMismatch', { start, end, cr: crHeader || '无 Content-Range' })))
                  return
                }
                const ws = fs.createWriteStream(partFiles[i])
                // 记录本分块实际收到的字节数：服务器忽略/截断 Range 时
                // 合并后会得到长度错误的文件，必须在分块层面就判定失败
                let chunkGot = 0
                const expectedForChunk = end - start + 1
                let chunkStalled: ReturnType<typeof setTimeout> | null = null
                const resetChunkStall = () => {
                  if (chunkStalled) clearTimeout(chunkStalled)
                  chunkStalled = setTimeout(() => {
                    req.destroy()
                    ws.destroy()
                    rejectC(new Error(mt('mu.chunkStalled')))
                  }, STALL_TIMEOUT_MS)
                }
                resetChunkStall()
                res.on('data', (c) => {
                  resetChunkStall()
                  if (aborted) return
                  received += c.length
                  chunkGot += c.length
                  if (chunkGot > expectedForChunk) {
                    req.destroy()
                    ws.destroy()
                    rejectC(new Error(mt('mu.chunkOverflow', { got: chunkGot, expected: expectedForChunk })))
                    return
                  }
                  if (onCancel && onCancel()) {
                    aborted = true
                    req.destroy()
                    ws.destroy()
                    rejectC(new Error('下载已取消'))
                  } else {
                    report()
                  }
                })
                res.on('error', (e) => { ws.destroy(); rejectC(e) })
                ws.on('error', (e) => { res.destroy(); rejectC(e) })
                ws.on('close', () => {
                  if (chunkStalled) clearTimeout(chunkStalled)
                  // 收到字节数必须精确等于请求区间长度，否则整文件必然损坏
                  if (chunkGot !== expectedForChunk) {
                    rejectC(new Error(mt('mu.chunkLengthMismatch', { got: chunkGot, expected: expectedForChunk })))
                    return
                  }
                  resolveC(true)
                })
                res.pipe(ws)
              })
              req.on('error', (e) => rejectC(e))
              req.setTimeout(REQUEST_TIMEOUT_MS, () => { req.destroy(); rejectC(new Error(mt('mu.chunkTimeout'))) })
              requests.push(req)
            }
            follow(urlForChunk)
          })
          if (ok) return
        } catch (e: any) {
          if (e && e.message === '下载已取消') throw e
          console.warn(`[Download] 分块 ${i} 下载失败(尝试 ${attempt + 1}/3): ${e?.message || e}`)
          try { if (fs.existsSync(partFiles[i])) fs.unlinkSync(partFiles[i]) } catch {}
        } finally {
          releaseChunkConnection()
        }
      }
      throw new Error(mt('mu.chunkRetryFailed', { i }))
    }

    await Promise.all(Array.from({ length: chunkCount }, (_, i) => downloadChunk(i)))

    if (aborted) return 'failed'

    // 合并分块文件（用流式管道，避免把整块读进内存并阻塞主进程）
    const out = fs.createWriteStream(dest)
    await new Promise<void>((resolveM, rejectM) => {
      out.on('error', rejectM)
      let idx = 0
      const appendNext = () => {
        if (idx >= partFiles.length) {
          out.end(() => resolveM())
          return
        }
        const reader = fs.createReadStream(partFiles[idx], { highWaterMark: 1024 * 1024 })
        idx++
        reader.on('error', (e) => { reader.destroy(); out.destroy(); rejectM(e) })
        reader.on('end', () => appendNext())
        reader.pipe(out, { end: false })
      }
      appendNext()
    })

    for (const p of partFiles) { try { fs.unlinkSync(p) } catch {} }

    // 合并后必须精确等于 total：这是分块路径的最后一道完整性闸门
    let mergedSize = -1
    try { mergedSize = fs.statSync(dest).size } catch {}
    if (mergedSize !== total) {
      console.warn(`[Download] 分块合并大小不符: ${mergedSize}/${total}`)
      try { fs.unlinkSync(dest) } catch {}
      if (onProgress) onProgress(100, 0)
      return 'failed'
    }

    if (onProgress) onProgress(100, 0)
    return 'completed'
  } catch (e: any) {
    for (const p of partFiles) { try { fs.unlinkSync(p) } catch {} }
    try { if (fs.existsSync(dest)) fs.unlinkSync(dest) } catch {}
    if (e && e.message === '下载已取消') {
      try { if (fs.existsSync(dest)) fs.unlinkSync(dest) } catch {}
    }
    return 'failed'
  }
}

// ============ 单流下载（支持断点续传） ============

async function downloadFileSingle(
  url: string, 
  dest: string, 
  onProgress?: (progress: number, speed?: number, threads?: number, totalBytes?: number) => void, 
  onCancel?: () => boolean, 
  onPauseCheck?: () => boolean,
  onRequestCreated?: (req: http.ClientRequest) => void,
  followRedirects: boolean = true
): Promise<void> {
  // 该文件的单流下载占用一个连接额度（全局 + 单源），拿到后无论成败都会归还
  await acquireConnection(url)
  // 包裹 resolve/reject，保证无论成功、失败还是取消都会归还连接额度
  return new Promise<void>((resolveOuter, rejectOuter) => {
    let settled = false
    const resolve = () => {
      if (settled) return
      settled = true
      releaseConnection(url)
      resolveOuter()
    }
    const reject = (err: any) => {
      if (settled) return
      settled = true
      releaseConnection(url)
      rejectOuter(err)
    }
    let cancelled = false
    let downloadedSize = 0
    let lastUpdateTime = Date.now()
    let lastDownloadedSize = 0
    let singleSpeedEwma = 0
    let stalledTimeout: ReturnType<typeof setTimeout> | null = null
    let globalTimeout: ReturnType<typeof setTimeout> | null = null
    let currentResponse: http.IncomingMessage | null = null
    let currentFile: fs.WriteStream | null = null
    let currentReq: http.ClientRequest | null = null
    let responseReceived = false
    
    const cleanup = (shouldDeleteFile?: boolean) => {
      if (stalledTimeout) {
        clearTimeout(stalledTimeout)
        stalledTimeout = null
      }
      if (globalTimeout) {
        clearTimeout(globalTimeout)
        globalTimeout = null
      }
      if (currentFile) {
        try { currentFile.destroy() } catch {}
        currentFile = null
      }
      if (shouldDeleteFile) {
        const deleteWithRetry = (attemptLeft: number) => {
          if (!fs.existsSync(dest)) return
          try {
            fs.unlinkSync(dest)
          } catch {
            if (attemptLeft > 0) {
              setTimeout(() => deleteWithRetry(attemptLeft - 1), 300)
            }
          }
        }
        deleteWithRetry(3)
      }
    }
    
    const waitForResume = async (): Promise<boolean> => {
      if (!onPauseCheck) return false
      while (onPauseCheck()) {
        await new Promise(resolve => setTimeout(resolve, 200))
        if (onCancel && onCancel()) {
          return true
        }
      }
      return false
    }
    
    const protocol = url.startsWith('https') ? https : http

    let existingSize = 0
    if (fs.existsSync(dest)) {
      try {
        existingSize = fs.statSync(dest).size
      } catch {}
    }
    
    const headers: Record<string, string> = {
      'User-Agent': DOWNLOAD_UA
    }
    if (existingSize > 0) {
      headers['Range'] = `bytes=${existingSize}-`
    }
    
    globalTimeout = setTimeout(() => {
      if (!responseReceived) {
        console.warn(`[Download] 全局超时: 请求发出后${GLOBAL_TIMEOUT_MS/1000}秒内未收到响应: ${url}`)
        cancelled = true
        if (currentReq) currentReq.destroy()
        cleanup(existingSize === 0)
        reject(new Error(mt('mu.requestTimeout')))
      }
    }, GLOBAL_TIMEOUT_MS)
    
    const req = protocol.get(url, { timeout: REQUEST_TIMEOUT_MS, headers, agent: proxyAgentFor(url) }, async (response) => {
      if (forceCancelAllDownloads) {
        cancelled = true
        response.destroy()
        cleanup(true)
        reject(new Error(mt('mu.forceCancelAll')))
        return
      }
      
      responseReceived = true
      if (globalTimeout) {
        clearTimeout(globalTimeout)
        globalTimeout = null
      }
      currentResponse = response
      
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || 
          response.statusCode === 307 || response.statusCode === 308) {
        if (response.headers.location) {
          if (!followRedirects) {
            response.resume()
            reject(new Error(mt('mu.redirectDisabled', { status: response.statusCode })))
            return
          }
          if (onCancel && onCancel()) {
            cleanup(true)
            reject(new Error('下载已取消'))
            return
          }
          if (onPauseCheck && onPauseCheck()) {
            const shouldCancel = await waitForResume()
            if (shouldCancel) {
              cleanup(true)
              reject(new Error('下载已取消'))
              return
            }
          }
          let newUrl = response.headers.location
          try {
            newUrl = new URL(response.headers.location, url).toString()
          } catch {}
          console.log(`[Download] 跟随重定向 (${response.statusCode}): ${newUrl}`)
          downloadFileSingle(newUrl, dest, onProgress, onCancel, onPauseCheck, onRequestCreated, followRedirects).then(resolve).catch(reject)
          return
        }
      }
      
      // 处理 Range Not Satisfiable
      if (response.statusCode === 416) {
        if (existingSize > 0) {
          console.warn(`[Download] Range 请求失败(416)，删除已有文件重新下载: ${dest}`)
          try { fs.unlinkSync(dest) } catch {}
          cleanup()
          downloadFileSingle(url, dest, onProgress, onCancel, onPauseCheck, onRequestCreated).then(resolve).catch(reject)
          return
        }
        cleanup()
        resolve()
        return
      }
      
      // 处理其他错误状态码
      if (response.statusCode !== 200 && response.statusCode !== 206) {
        cleanup(existingSize === 0)
        reject(new Error(`${mt('mu.downloadFailedPrefix')}状态码: ${response.statusCode}`))
        return
      }

      // 服务器不支持断点续传，重新下载
      if (existingSize > 0 && response.statusCode === 200) {
        console.warn(`[Download] 服务器未支持断点续传，删除部分文件重新下载: ${dest}`)
        try { fs.unlinkSync(dest) } catch {}
        existingSize = 0
      }
      
      const contentRange = response.headers['content-range']
      let totalSize = parseInt(response.headers['content-length'] || '0')
      
      if (contentRange && existingSize > 0) {
        const match = contentRange.match(/\/(\d+)$/)
        if (match) {
          totalSize = parseInt(match[1])
        }
      }
      
      downloadedSize = existingSize
      
      const file = existingSize > 0 ? fs.createWriteStream(dest, { flags: 'a' }) : fs.createWriteStream(dest)
      currentFile = file
      
      const resetStallTimer = () => {
        if (stalledTimeout) {
          clearTimeout(stalledTimeout)
        }
        stalledTimeout = setTimeout(() => {
          console.warn(`[Download] 下载停滞超过${STALL_TIMEOUT_MS/1000}秒，主动中断: ${url}`)
          cancelled = true
          if (currentResponse) currentResponse.destroy()
          if (currentFile) currentFile.destroy()
          cleanup(existingSize === 0)
          reject(new Error(mt('mu.downloadStalled')))
        }, STALL_TIMEOUT_MS)
      }
      
      resetStallTimer()
      
      response.on('data', async (chunk) => {
        if (cancelled) {
          response.destroy()
          return
        }
        
        if (onPauseCheck && onPauseCheck()) {
          response.pause()
          file.cork()

          // 暂停期间不会再有 data 事件，停滞计时器无法被 resetStallTimer() 重置，
          // 60 秒后会被误判为"下载停滞"并强行中断（挂机下载/锁屏必现）。
          // 暂停前先清掉计时器，恢复后由下面的 resetStallTimer() 重新武装。
          if (stalledTimeout) {
            clearTimeout(stalledTimeout)
            stalledTimeout = null
          }

          const shouldCancel = await waitForResume()
          if (shouldCancel) {
            cancelled = true
            response.destroy()
            file.destroy()
            cleanup(true)
            reject(new Error('下载已取消'))
            return
          }
          
          response.resume()
          file.uncork()
          resetStallTimer()
        }
        
        downloadedSize += chunk.length
        const now = Date.now()
        const timeDiff = now - lastUpdateTime
        if (timeDiff >= 500 && onProgress) {
          // 单位：字节/秒（与并行分块一致，不能除以 1024）
          const instant = timeDiff > 0 ? (downloadedSize - lastDownloadedSize) / (timeDiff / 1000) : 0
          // 同样做 EWMA 平滑：限速源的突发 trickle 会让瞬时速度显示成 0
          singleSpeedEwma = singleSpeedEwma === 0 ? instant : singleSpeedEwma * 0.65 + instant * 0.35
          const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
          onProgress(progress, Math.round(singleSpeedEwma), 1, totalSize)
          lastUpdateTime = now
          lastDownloadedSize = downloadedSize
        }
        
        if (onCancel && onCancel()) {
          cancelled = true
          response.destroy()
          file.destroy()
          cleanup(true)
          reject(new Error('下载已取消'))
          return
        }
        
        if (forceCancelAllDownloads) {
          cancelled = true
          response.destroy()
          file.destroy()
          cleanup(true)
          reject(new Error(mt('mu.forceCancelAll')))
          return
        }
        
        resetStallTimer()
      })
      
      response.pipe(file)
      
      response.on('end', () => {
        file.close((closeErr) => {
          if (stalledTimeout) clearTimeout(stalledTimeout)
          if (closeErr) {
            cleanup(existingSize === 0)
            reject(closeErr)
          } else if (!cancelled) {
            cleanup()
            resolve()
          }
        })
      })
      
      file.on('finish', () => {
        if (stalledTimeout) clearTimeout(stalledTimeout)
      })
      
      file.on('error', (err) => {
        if (stalledTimeout) clearTimeout(stalledTimeout)
        cleanup(existingSize === 0)
        if (currentResponse) currentResponse.destroy()
        reject(err)
      })
    }).on('error', (err) => {
      cleanup(existingSize === 0)
      reject(err)
    })
    
    currentReq = req
  })
}

// ============ 主下载函数 ============

export async function optimizedDownload(options: DownloadOptions): Promise<DownloadResult> {
  const {
    url,
    dest,
    onProgress,
    onCancel,
    onPauseCheck,
    onRequestCreated,
    maxRetries = 3,
    enableParallel = true,
    followRedirects = true,
    knownTotalSize = 0,
    expectedSha1,
    altUrls
  } = options

  // 校验下载产物：整合包 zip 被截断后直接解压会得到缺文件的坏包，
  // 必须用 API 给出的哈希挡住，否则用户只会看到"某些 mod 没加载"。
  const verifyDest = async (): Promise<string | null> => {
    if (!expectedSha1) return null
    const actual = await new Promise<string | null>((resolve) => {
      const hash = createHash('sha1')
      const s = fs.createReadStream(dest)
      s.on('data', (c) => hash.update(c))
      s.on('end', () => resolve(hash.digest('hex')))
      s.on('error', () => resolve(null))
    })
    if (!actual || actual.toLowerCase() !== expectedSha1.toLowerCase()) {
      return mt('mu.sha1Mismatch', { expected: expectedSha1, actual: actual || mt('mu.readFailed') })
    }
    console.log(`[Download] SHA-1 校验通过: ${dest}`)
    return null
  }

  let attempt = 0
  let lastError: Error | null = null

  // 尝试并行下载（大文件）
  if (enableParallel && !onPauseCheck) {
    const pResult = await tryParallelDownload(url, dest, onProgress, onCancel, onPauseCheck, onRequestCreated, knownTotalSize, followRedirects, altUrls)
    if (pResult === 'completed') {
      const vErr = await verifyDest()
      if (vErr) {
        try { fs.unlinkSync(dest) } catch {}
        return { success: false, error: vErr }
      }
      return { success: true }
    }
    if (pResult === 'failed') {
      // 并行失败回退单流
    }
  }
  
  // 单流下载（带重试）
  while (attempt < maxRetries) {
    attempt++
    
    try {
      await downloadFileSingle(url, dest, onProgress, onCancel, onPauseCheck, onRequestCreated, followRedirects)
      const vErr = await verifyDest()
      if (vErr) {
        try { fs.unlinkSync(dest) } catch {}
        return { success: false, error: vErr }
      }
      return { success: true }
    } catch (error: any) {
      lastError = error
      console.warn(`[Download] 下载尝试 ${attempt}/${maxRetries} 失败: ${error.message}`)
      
      if (onCancel && onCancel()) {
        return { success: false, cancelled: true, error: '下载已取消' }
      }
      
      if (error.message === '下载暂停') {
        return { success: false, paused: true, error: mt('mu.downloadPaused') }
      }
      
      // 404错误：资源不存在，直接失败不重试
      if (error.message && error.message.includes('状态码: 404')) {
        console.warn(`[Download] 资源不存在(404)，跳过重试: ${url}`)
        return { success: false, error: error.message }
      }
      
      // 5xx服务器错误：短暂等待后重试
      if (error.message && /状态码: 5\d{2}/.test(error.message)) {
        console.warn(`[Download] 服务器错误(5xx)，稍后重试: ${url}`)
        if (attempt >= maxRetries) return { success: false, error: error.message }
        await new Promise(resolve => setTimeout(resolve, Math.min(1000, attempt * 500)))
        continue
      }
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000, attempt * 500)
        console.log(`[Download] ${delay}ms 后重试下载...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  return { success: false, error: lastError?.message || mt('mu.downloadFailed') }
}

// ============ 批量下载（带并发控制） ============

export interface BatchDownloadItem {
  id: string
  url: string
  dest: string
  onProgress?: (progress: number, speed?: number, threads?: number, totalBytes?: number) => void
}

export async function batchDownload(
  items: BatchDownloadItem[],
  onCancel?: () => boolean,
  onAllComplete?: (results: Map<string, DownloadResult>) => void
): Promise<Map<string, DownloadResult>> {
  const results = new Map<string, DownloadResult>()
  
  const downloadItem = async (item: BatchDownloadItem) => {
    const result = await optimizedDownload({
      url: item.url,
      dest: item.dest,
      onProgress: item.onProgress,
      onCancel,
      maxRetries: 2,
      enableParallel: false  // 批量下载时禁用并行，避免连接数过多
    })
    results.set(item.id, result)
  }

  // 使用并发池执行所有下载
  await Promise.all(items.map(item => downloadPool.run(() => downloadItem(item))))
  
  onAllComplete?.(results)
  return results
}

// ============ 兼容层 - 与旧版 downloadFile 签名一致 ============

/**
 * 与旧版 downloadFile 签名兼容的函数，内部使用 optimizedDownload
 * 保持原有调用方式不变：downloadFile(url, dest, onProgress, onCancel, maxRetries, onPauseCheck, onRequestCreated)
 *
 * 并行分块下载只在同时满足以下条件时启用：
 *   - 没有 onPauseCheck（暂停回调说明是大文件下载场景，如版本 jar）
 *   - maxRetries >= 5（调用方明确表示这是大文件下载，整合包/版本 jar 传 5）
 *   小文件（mod/资源文件）走单流下载，避免 Range 探测 + 分块合并的开销
 */
export async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (progress: number, speed?: number, threads?: number, totalBytes?: number) => void,
  onCancel?: () => boolean,
  maxRetries: number = 3,
  onPauseCheck?: () => boolean,
  onRequestCreated?: (req: http.ClientRequest) => void,
  followRedirects: boolean = true,
  knownTotalSize: number = 0,
  expectedSha1?: string,
  /** 备用链路（如 Modrinth 官方 CDN）：分块轮流分配，摊开单源并发。 */
  altUrls?: string[]
): Promise<void> {
  // 并行分块只对大文件有意义：需要同时满足无暂停回调 + maxRetries>=5（大文件标记）
  const enableParallel = !onPauseCheck && maxRetries >= 5

  const result = await optimizedDownload({
    url,
    dest,
    onProgress,
    onCancel,
    onPauseCheck,
    onRequestCreated,
    maxRetries,
    followRedirects,
    enableParallel,
    knownTotalSize,
    expectedSha1,
    altUrls
  })
  
  if (!result.success) {
    if (result.cancelled) throw new Error('下载已取消')
    if (result.paused) throw new Error('下载暂停')
    throw new Error(result.error || mt('mu.downloadFailed'))
  }
}

// ============ 重定向 URL 预解析 ============

// 缓存已解析的最终 URL，避免同一 URL 重复解析
const resolvedUrlCache = new Map<string, string>()

/**
 * 预解析重定向链，返回最终 URL
 * Modrinth CDN 通常有2-3层307重定向，每次重定向都是一次网络往返
 * 预解析后缓存，后续下载直接用最终 URL，省去重定向开销
 */
export async function resolveRedirectUrl(url: string, maxRedirects: number = 10): Promise<string> {
  // 已缓存直接返回
  const cached = resolvedUrlCache.get(url)
  if (cached) return cached

  let current = url
  for (let i = 0; i < maxRedirects; i++) {
    try {
      const result = await new Promise<{ redirect?: string; finalUrl: string }>((resolve) => {
        const protocol = current.startsWith('https') ? https : http
        const req = protocol.get(current, {
          headers: { 'User-Agent': DOWNLOAD_UA },
          timeout: 10000,
          agent: proxyAgentFor(current)
        }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 ||
              res.statusCode === 307 || res.statusCode === 308) {
            const loc = res.headers.location
            res.resume()
            if (loc) {
              let next = loc
              try { next = new URL(loc, current).toString() } catch {}
              resolve({ redirect: next })
            } else {
              resolve({ finalUrl: current })
            }
          } else {
            res.resume()
            resolve({ finalUrl: current })
          }
        })
        req.on('error', () => resolve({ finalUrl: current }))
        req.setTimeout(10000, () => { req.destroy(); resolve({ finalUrl: current }) })
      })

      if (result.redirect) {
        current = result.redirect
      } else {
        resolvedUrlCache.set(url, current)
        return current
      }
    } catch {
      break
    }
  }

  resolvedUrlCache.set(url, current)
  return current
}

// 清理过期缓存（避免内存泄漏，保留最近1000条）
const MAX_CACHE_SIZE = 1000
setInterval(() => {
  if (resolvedUrlCache.size > MAX_CACHE_SIZE) {
    const keys = Array.from(resolvedUrlCache.keys())
    for (let i = 0; i < keys.length - MAX_CACHE_SIZE / 2; i++) {
      resolvedUrlCache.delete(keys[i])
    }
  }
}, 60000)

// ============ 导出工具函数 ============

export { formatSpeed }

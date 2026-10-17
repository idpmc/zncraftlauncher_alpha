/**
 * 启动器下载代理（HTTP / SOCKS5）—— 零依赖自实现。
 *
 * 合规设计原则：
 *  - 只接管「启动器自身」发起的资源下载与元数据请求；
 *  - 代理地址 / 账号 / 密码全部由用户自行填写，启动器**不内置、不分发**任何代理或 VPN 节点；
 *  - 支持 HTTP 代理（CONNECT 隧道）与 SOCKS5（含用户名密码认证）；
 *  - 国内镜像（BMCLAPI / MCIM 等）与本机 / 局域网地址自动直连，不走代理。
 *
 * 这里不引入任何第三方代理库（https-proxy-agent / socks-proxy-agent 等），
 * 避免额外依赖与打包体积，也便于审计。
 */
import * as http from 'http'
import * as https from 'https'
import * as net from 'net'
import * as tls from 'tls'
import * as fs from 'fs'
import * as path from 'path'

const DOWNLOAD_UA = 'ZNCL-Launcher/1.0.0 (Minecraft Launcher)'
const PROXY_TIMEOUT_MS = 15000

export type ProxyType = 'http' | 'socks5'

export interface ProxyConfig {
  /** 是否启用代理 */
  enabled: boolean
  /** 代理类型：http（含 https 代理）或 socks5 */
  type: ProxyType
  host: string
  port: number
  username: string
  password: string
  /** 是否把 Minecraft 游戏进程也纳入代理（默认关闭；只影响 Java 标准网络栈） */
  forGame: boolean
}

const DEFAULT_PROXY: ProxyConfig = {
  enabled: false,
  type: 'http',
  host: '127.0.0.1',
  port: 7890,
  username: '',
  password: '',
  forGame: false
}

let cfg: ProxyConfig = { ...DEFAULT_PROXY }

// ============ 直连白名单 ============
// 国内镜像与本机 / 内网地址走代理反而更慢甚至不通，一律直连。
const BYPASS_SUFFIXES = [
  'bangbang93.com',   // BMCLAPI
  'mcbbs.net',        // MCBBS 下载镜像
  'mcimirror.top',    // MCIM（Modrinth 国内镜像）
  'npmmirror.com',
  'cnpmjs.org'
]

export function shouldBypassHost(host: string): boolean {
  if (!host) return true
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true
  if (/^127\./.test(h)) return true
  if (/^10\./.test(h)) return true
  if (/^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  return BYPASS_SUFFIXES.some(s => h === s || h.endsWith('.' + s))
}

// ============ 配置读写 ============

let httpAgent: http.Agent | null = null
let httpsAgent: https.Agent | null = null

export function setProxyConfig(input: Partial<ProxyConfig>): ProxyConfig {
  const merged: ProxyConfig = { ...cfg, ...input }
  merged.enabled = !!merged.enabled
  merged.type = merged.type === 'socks5' ? 'socks5' : 'http'
  merged.host = String(merged.host || '').trim()
  const p = Math.round(Number(merged.port))
  merged.port = Number.isFinite(p) && p > 0 && p <= 65535 ? p : 7890
  merged.username = String(merged.username || '')
  merged.password = String(merged.password || '')
  merged.forGame = !!merged.forGame
  cfg = merged
  // 配置变化后丢弃缓存的 agent（含已有 keep-alive 隧道），下次请求按新配置重建
  if (httpAgent) { try { httpAgent.destroy() } catch {} }
  if (httpsAgent) { try { httpsAgent.destroy() } catch {} }
  httpAgent = null
  httpsAgent = null
  console.log(`[Proxy] ${cfg.enabled ? `已启用 ${cfg.type}://${cfg.host}:${cfg.port}` : '已关闭'}`)
  return { ...cfg }
}

export function getProxyConfig(): ProxyConfig {
  return { ...cfg }
}

/** 该请求是否真的需要走代理（已启用 + 非白名单地址）。 */
export function isProxyActiveFor(host: string): boolean {
  return cfg.enabled && !!cfg.host && !shouldBypassHost(host)
}

// ============ 隧道建立 ============

/** 读取恰好 n 个字节的辅助器（用于 SOCKS5 握手）。 */
function makeByteReader(sock: net.Socket) {
  let buf = Buffer.alloc(0)
  let waiter: (() => void) | null = null
  let failure: Error | null = null
  let closed = false

  const wake = () => { if (waiter) { const w = waiter; waiter = null; w() } }
  const onData = (d: Buffer) => { buf = Buffer.concat([buf, d]); wake() }
  const onError = (e: Error) => { failure = failure || e; wake() }
  const onClose = () => { closed = true; wake() }

  sock.on('data', onData)
  sock.on('error', onError)
  sock.on('close', onClose)

  return {
    async read(n: number): Promise<Buffer> {
      while (buf.length < n) {
        if (failure) throw failure
        if (closed) throw new Error('代理连接被关闭')
        await new Promise<void>(r => { waiter = r })
      }
      const out = buf.subarray(0, n)
      buf = buf.subarray(n)
      return out
    },
    detach(): Buffer {
      sock.removeListener('data', onData)
      sock.removeListener('error', onError)
      sock.removeListener('close', onClose)
      const left = buf
      buf = Buffer.alloc(0)
      return left
    }
  }
}

async function socks5Connect(
  sock: net.Socket, host: string, port: number, username: string, password: string
): Promise<Buffer> {
  const reader = makeByteReader(sock)
  const hasAuth = !!(username || password)

  // 1) 问候：版本 5，方法数 1，方法 = 0x02(用户密码) 或 0x00(无需认证)
  sock.write(Buffer.from([0x05, 0x01, hasAuth ? 0x02 : 0x00]))
  const greeting = await reader.read(2)
  if (greeting[0] !== 0x05) throw new Error('SOCKS5 版本不匹配（对方可能不是 SOCKS5 代理）')
  if (greeting[1] === 0xff) throw new Error('SOCKS5 代理拒绝了我们提供的认证方式')
  if (greeting[1] === 0x02) {
    const u = Buffer.from(username, 'utf8')
    const pw = Buffer.from(password, 'utf8')
    sock.write(Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([pw.length]), pw]))
    const authResp = await reader.read(2)
    if (authResp[1] !== 0x00) throw new Error('SOCKS5 用户名或密码错误')
  }

  // 2) 连接请求：优先用域名（ATYP=0x03），让代理侧解析，避免本地 DNS 污染
  const ipVersion = net.isIP(host)
  let addrBuf: Buffer
  if (ipVersion === 4) {
    addrBuf = Buffer.concat([Buffer.from([0x01]), Buffer.from(host.split('.').map(Number))])
  } else if (ipVersion === 6) {
    addrBuf = Buffer.concat([Buffer.from([0x04]), ipv6ToBuffer(host)])
  } else {
    const h = Buffer.from(host, 'utf8')
    if (h.length > 255) throw new Error('SOCKS5 域名过长')
    addrBuf = Buffer.concat([Buffer.from([0x03, h.length]), h])
  }
  const portBuf = Buffer.from([(port >> 8) & 0xff, port & 0xff])
  sock.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), addrBuf, portBuf]))

  const reply = await reader.read(4) // VER REP RSV ATYP
  if (reply[1] !== 0x00) {
    const REASONS: Record<number, string> = {
      1: '一般性失败', 2: '规则不允许', 3: '网络不可达', 4: '主机不可达',
      5: '连接被拒绝', 6: 'TTL 超时', 7: '命令不支持', 8: '地址类型不支持'
    }
    throw new Error(`SOCKS5 连接失败：${REASONS[reply[1]] || ('代码 ' + reply[1])}`)
  }
  // 消费掉绑定地址 + 端口（不重要但必须读走）
  const atyp = reply[3]
  if (atyp === 0x01) await reader.read(4)
  else if (atyp === 0x04) await reader.read(16)
  else if (atyp === 0x03) { const l = await reader.read(1); await reader.read(l[0]) }
  else throw new Error('SOCKS5 返回了未知的地址类型')
  await reader.read(2)

  // 剩下的字节属于目标服务器，交还 socket
  return reader.detach()
}

function ipv6ToBuffer(host: string): Buffer {
  const buf = Buffer.alloc(16)
  const parts = host.split('::')
  const head = parts[0] ? parts[0].split(':') : []
  const tail = parts[1] ? parts[1].split(':') : []
  const fill = 8 - head.length - tail.length
  const groups = [...head, ...Array(Math.max(0, fill)).fill('0'), ...tail]
  groups.forEach((g, i) => buf.writeUInt16BE(parseInt(g || '0', 16) & 0xffff, i * 2))
  return buf
}

/** 通过 HTTP 代理做 CONNECT 隧道。 */
function httpConnectHandshake(
  sock: net.Socket, host: string, port: number, fail: (e: Error) => void, done: (leftover: Buffer) => void
): void {
  let buf = Buffer.alloc(0)
  const onData = (d: Buffer) => {
    buf = Buffer.concat([buf, d])
    const idx = buf.indexOf('\r\n\r\n')
    if (idx === -1) {
      if (buf.length > 64 * 1024) {
        sock.removeListener('data', onData)
        fail(new Error('HTTP 代理返回异常（响应头过大）'))
      }
      return
    }
    sock.removeListener('data', onData)
    const head = buf.subarray(0, idx).toString('latin1')
    const statusLine = head.split('\r\n')[0] || ''
    const m = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(statusLine)
    const code = m ? Number(m[1]) : 0
    if (code !== 200) {
      fail(new Error(`HTTP 代理拒绝建立隧道：${statusLine.trim() || '无响应'}`))
      return
    }
    done(buf.subarray(idx + 4))
  }
  sock.on('data', onData)

  const auth = cfg.username
    ? `Proxy-Authorization: Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}\r\n`
    : ''
  sock.write(
    `CONNECT ${host}:${port} HTTP/1.1\r\n` +
    `Host: ${host}:${port}\r\n` +
    auth +
    `Proxy-Connection: keep-alive\r\n\r\n`
  )
}

/** 与代理建立一条到 targetHost:targetPort 的裸隧道。 */
function openProxyTunnel(targetHost: string, targetPort: number, cb: (err: Error | null, sock?: net.Socket) => void): void {
  const raw = net.connect({ host: cfg.host, port: cfg.port })
  let settled = false
  const fail = (e: Error) => {
    if (settled) return
    settled = true
    raw.setTimeout(0)
    try { raw.destroy() } catch {}
    cb(e)
  }
  raw.setTimeout(PROXY_TIMEOUT_MS, () => fail(new Error(`连接代理超时（${cfg.host}:${cfg.port}）`)))
  raw.once('error', fail)
  raw.once('connect', () => {
    const finish = (leftover: Buffer) => {
      if (settled) return
      settled = true
      raw.setTimeout(0)
      if (leftover.length) raw.unshift(leftover)
      cb(null, raw)
    }
    if (cfg.type === 'http') {
      httpConnectHandshake(raw, targetHost, targetPort, fail, finish)
    } else {
      socks5Connect(raw, targetHost, targetPort, cfg.username, cfg.password).then(finish, fail)
    }
  })
}

/** 在隧道之上完成 TLS 握手（仅 https 目标）。 */
function tlsOverTunnel(raw: net.Socket, options: any, cb: (err: Error | null, sock?: tls.TLSSocket) => void): void {
  const host: string = options.servername || options.host || ''
  const tlsOpts: tls.ConnectionOptions = { socket: raw }
  // SNI 不能是 IP 字面量
  if (host && !net.isIP(host)) tlsOpts.servername = host
  if (options.rejectUnauthorized === false) tlsOpts.rejectUnauthorized = false
  if (options.ca) tlsOpts.ca = options.ca
  if (options.cert) tlsOpts.cert = options.cert
  if (options.key) tlsOpts.key = options.key
  if (options.passphrase) tlsOpts.passphrase = options.passphrase
  if (options.minVersion) tlsOpts.minVersion = options.minVersion
  if (options.maxVersion) tlsOpts.maxVersion = options.maxVersion
  if (options.ciphers) tlsOpts.ciphers = options.ciphers
  if (options.ALPNProtocols) tlsOpts.ALPNProtocols = options.ALPNProtocols

  let settled = false
  const sock = tls.connect(tlsOpts, () => {
    if (settled) return
    settled = true
    cb(null, sock)
  })
  sock.once('error', (e) => {
    if (settled) return
    settled = true
    cb(e)
  })
}

// ============ Agent ============

function buildProxiedAgent(isHttps: boolean): any {
  const base: any = isHttps
    ? new https.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 64 })
    : new http.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 64 })

  // 覆盖 createConnection：先把 TCP 接到代理并打通隧道，https 再在其上做 TLS。
  base.createConnection = function (options: any, callback: (err: Error | null, sock?: net.Socket) => void) {
    const defaultPort = isHttps ? 443 : 80
    const host = options.host || options.hostname
    const port = Number(options.port) || defaultPort
    openProxyTunnel(host, port, (err, sock) => {
      if (err) { callback(err); return }
      if (!isHttps) { callback(null, sock); return }
      tlsOverTunnel(sock as net.Socket, options, (e, s) => callback(e, s as any))
    })
  }
  return base
}

/**
 * 取得该请求应使用的 agent。返回 undefined 表示直连。
 * @param protocol 'http:' / 'https:'（也接受不带冒号的写法）
 * @param host 目标主机名，用于白名单判断
 */
export function getProxyAgent(protocol: string, host?: string): http.Agent | https.Agent | undefined {
  if (!cfg.enabled || !cfg.host) return undefined
  if (host && shouldBypassHost(host)) return undefined
  const isHttps = protocol.startsWith('https')
  if (isHttps) {
    if (!httpsAgent) httpsAgent = buildProxiedAgent(true)
    return httpsAgent
  }
  if (!httpAgent) httpAgent = buildProxiedAgent(false)
  return httpAgent
}

// ============ 供 Chromium（渲染进程 / 图片等）使用的代理规则 ============

export function proxyRulesString(): string {
  const scheme = cfg.type === 'socks5' ? 'socks5' : 'http'
  const auth = cfg.username ? `${encodeURIComponent(cfg.username)}:${encodeURIComponent(cfg.password)}@` : ''
  return `${scheme}://${auth}${cfg.host}:${cfg.port}`
}

export function proxyBypassString(): string {
  const rules = ['<local>', 'localhost', '127.0.0.1']
  for (const s of BYPASS_SUFFIXES) rules.push('*.' + s)
  return rules.join(',')
}

// Java 的 http.nonProxyHosts 用 '|' 分隔、'*' 作通配符，语义与 Chromium 那套不同，
// 这里单独生成一份（Java 不支持 CIDR/正则，只能按网段前缀列）。
export function nonProxyHostsString(): string {
  const rules = ['localhost', '127.*', '10.*', '192.168.*']
  for (const s of BYPASS_SUFFIXES) rules.push('*.' + s)
  return rules.join('|')
}

/**
 * 生成注入给 Minecraft 游戏进程的 JVM 代理参数（仅当 forGame 打开时）。
 *
 * 说明与边界：这里设置的是 Java 标准系统属性，只影响使用 Java 标准网络栈的代码
 * （Mojang 账号/皮肤/Realms 等 API 调用、以及用 URLConnection / java.net.http 的模组）。
 * 游戏与服务器之间的原始 socket（Netty）不受影响，也不会被强制塞进代理。
 */
export function gameProxyJvmArgs(): string[] {
  const c = getProxyConfig()
  if (!c.enabled || !c.host || !c.forGame) return []
  const args: string[] = []
  if (c.type === 'socks5') {
    args.push(`-DsocksProxyHost=${c.host}`, `-DsocksProxyPort=${c.port}`)
    if (c.username) {
      args.push(`-Djava.net.socks.username=${c.username}`, `-Djava.net.socks.password=${c.password}`)
    }
  } else {
    args.push(
      `-Dhttp.proxyHost=${c.host}`,
      `-Dhttp.proxyPort=${c.port}`,
      `-Dhttps.proxyHost=${c.host}`,
      `-Dhttps.proxyPort=${c.port}`
    )
    if (c.username) {
      args.push(
        `-Dhttp.proxyUser=${c.username}`,
        `-Dhttp.proxyPassword=${c.password}`,
        `-Dhttps.proxyUser=${c.username}`,
        `-Dhttps.proxyPassword=${c.password}`
      )
    }
  }
  // 国内镜像 / 本机地址在游戏内也直连
  args.push(`-Dhttp.nonProxyHosts=${nonProxyHostsString()}`)
  args.push('-Djava.net.useSystemProxies=false')
  console.log(`[Proxy] 已为游戏进程注入代理参数（${c.type}://${c.host}:${c.port}）`)
  return args
}

// ============ 配置持久化（供启动早期即生效，如自动更新） ============

export function loadProxyConfigFromFile(filePath: string): ProxyConfig {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return setProxyConfig(parsed)
  } catch {
    return getProxyConfig()
  }
}

export function saveProxyConfigToFile(filePath: string, c?: ProxyConfig): void {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(c || getProxyConfig(), null, 2), 'utf8')
  } catch (e: any) {
    console.warn('[Proxy] 保存代理配置失败:', e?.message || e)
  }
}

// ============ 主进程用的极简 fetch（走代理 + 真实超时） ============

export interface SimpleResponse {
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<any>
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}

/**
 * 替代 Node 原生 fetch。原生 fetch(undici) 不支持 http.Agent，无法走自建代理，
 * 且会忽略 { timeout } 选项；这里用 http/https + 代理 agent 实现，超时真实生效。
 */
export function httpFetch(
  url: string,
  opts: { timeout?: number; headers?: Record<string, string>; redirect?: boolean } = {}
): Promise<SimpleResponse> {
  const timeout = opts.timeout ?? 15000
  const maxRedirects = opts.redirect === false ? 0 : 5
  return new Promise((resolve, reject) => {
    const go = (target: string, depth: number) => {
      let parsed: URL
      try { parsed = new URL(target) } catch (e) { reject(e as Error); return }
      const isHttps = parsed.protocol === 'https:'
      const mod = isHttps ? https : http
      const agent = getProxyAgent(parsed.protocol, parsed.hostname)
      const req = mod.get(target, {
        headers: { 'User-Agent': DOWNLOAD_UA, 'Accept': '*/*', ...(opts.headers || {}) },
        agent,
        timeout
      }, (res) => {
        const sc = res.statusCode || 0
        if (sc >= 300 && sc < 400 && res.headers.location && depth < maxRedirects) {
          res.resume()
          let next = res.headers.location
          try { next = new URL(res.headers.location, target).toString() } catch {}
          go(next, depth + 1)
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks)
          resolve({
            ok: sc >= 200 && sc < 300,
            status: sc,
            headers: { get: (n: string) => (res.headers[n.toLowerCase()] as string) ?? null },
            json: async () => JSON.parse(body.toString('utf8')),
            text: async () => body.toString('utf8'),
            arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
          })
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(new Error('请求超时')) })
    }
    go(url, 0)
  })
}

/** 代理连通性 + 速度自检：抓 Modrinth CDN 上的一小段数据。 */
export async function testProxyConnection(): Promise<{ ok: boolean; ms: number; kbs: number; error?: string }> {
  const probeUrl = 'https://cdn.modrinth.com/data/4BV47HRn/versions/IGwlsu0n/Better%20MC%20%5BFORGE%5D%20-%20BMC4%20v28.mrpack'
  const t0 = Date.now()
  try {
    const resp = await httpFetch(probeUrl, { timeout: 20000, headers: { Range: 'bytes=0-262143' } })
    const ms = Date.now() - t0
    if (!resp.ok && resp.status !== 206) return { ok: false, ms, kbs: 0, error: `HTTP ${resp.status}` }
    const buf = await resp.arrayBuffer()
    const kbs = buf.byteLength / 1024 / (ms / 1000)
    return { ok: true, ms, kbs }
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, kbs: 0, error: e?.message || String(e) }
  }
}

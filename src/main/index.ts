import { app, BrowserWindow, ipcMain, dialog, screen, shell, session, WebContents, WebContentsView } from 'electron'
import { release, totalmem, freemem, tmpdir, cpus } from 'os'
import { createHash } from 'crypto'
import { join } from 'path'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import * as net from 'net'
import { autoUpdater } from 'electron-updater'
import { downloadFile, downloadPool, formatSpeed, setForceCancelAllDownloads, getForceCancelAllDownloads, resolveRedirectUrl, setDownloadThreads, getDownloadThreads, setModrinthMirrorEnabled, modrinthCandidates } from './download-utils'
import { initFileLogger, getLogFilePath, getLogDir, readLogsForCopy } from './file-logger'
import { mt, setMainLocale } from './locale'
import { setProxyConfig, getProxyConfig, httpFetch, testProxyConnection, proxyRulesString, proxyBypassString, gameProxyJvmArgs, loadProxyConfigFromFile, saveProxyConfigToFile } from './proxy'
import { classifyGameStderr, detectGameErrorHint, nativeExitCodeHintKey, createGameLogDecoder, splitLogLines } from '../shared/game-log'

// 尽早接管控制台输出：打包后没有终端，日志必须落盘才能排查失败原因
initFileLogger()

// 展示版本：0.3.39-alpha -> Alpha 0.3.39（package.json 是唯一来源）
const APP_RAW_VERSION = app.getVersion()
const APP_LABEL = APP_RAW_VERSION.includes('-')
  ? `Alpha ${APP_RAW_VERSION.split('-')[0]}`
  : APP_RAW_VERSION

console.log(`[Main] ZNCL 启动 v${APP_RAW_VERSION} 平台=${process.platform} arch=${process.arch}`)
console.log(`[Main] 日志文件: ${getLogFilePath()}`)

process.env.DIST_ELECTRON = join(__dirname, '../')
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist')
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

// ========== 平台工具 ==========
// 平台 key（与 Minecraft 版本 json 的 natives/os 命名一致）
function osKey(): 'windows' | 'osx' | 'linux' {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'osx'
  return 'linux'
}
// Java 可执行文件名
function javaExeName(): string {
  return process.platform === 'win32' ? 'java.exe' : 'java'
}
// 工具二进制名（win 加 .exe，POSIX 无扩展名）
function toolExe(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name
}
// frp/easytier 等工具包平台段名
function toolPlatform(): 'windows' | 'linux' | 'darwin' {
  return osKey() === 'osx' ? 'darwin' : osKey()
}
// 架构段名（用于工具包/Java 下载 URL）
function toolArch(): 'amd64' | 'arm64' {
  return process.arch === 'arm64' ? 'arm64' : 'amd64'
}

// ========== 跨平台解压 ==========
// zip: 用 adm-zip（纯 JS，三平台通用）；tar.gz: 用系统 tar（Linux/macOS 原生，Windows 10+ 自带）
function unzipFile(zipPath: string, destDir: string): void {
  const AdmZip = require('adm-zip')
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(destDir, true)
}

function extractArchive(archivePath: string, destDir: string): void {
  if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
    const { execSync } = require('child_process')
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { timeout: 300000 })
  } else {
    unzipFile(archivePath, destDir)
  }
}

// 清除 Windows 的「来自互联网」标记（Mark-of-the-Web / Zone.Identifier）
// 未清除时 Windows 安全中心（SmartScreen / 应用控制）会拦截 java.exe 等文件，
// 表现为下载过程中被拦下、或安装后启动游戏提示「Windows 已保护你的电脑」
function unblockMarkOfTheWeb(target: string, deep = false): void {
  if (process.platform !== 'win32') return
  try {
    if (!fs.existsSync(target)) return
    const { execFileSync } = require('child_process')
    const quoted = target.replace(/'/g, "''")
    const script = deep
      ? `Get-ChildItem -LiteralPath '${quoted}' -Recurse -Force -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue; Unblock-File -LiteralPath '${quoted}' -ErrorAction SilentlyContinue; exit 0`
      : `Unblock-File -LiteralPath '${quoted}' -ErrorAction SilentlyContinue; exit 0`
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 120000,
      stdio: 'ignore',
      windowsHide: true
    })
  } catch {
    // 清除失败不阻断流程，Windows 安全策略可能本就禁止修改
  }
}

// 带重试的解压：Windows 安全中心实时扫描会短暂锁定文件（EBUSY / EPERM / 拒绝访问），
// 直接判定失败会让用户看到「解压失败」，等待重试通常即可正常完成
function extractArchiveWithRetry(archivePath: string, destDir: string, maxAttempts = 4): void {
  let lastError: any = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      extractArchive(archivePath, destDir)
      return
    } catch (err: any) {
      lastError = err
      const msg = String(err?.message || err)
      const locked = /EBUSY|EPERM|EACCES|resource busy|being used|另一个程序|拒绝访问|正被/i.test(msg)
      if (!locked || attempt === maxAttempts) break
      console.warn(`[Main] 解压时文件被占用（可能是安全软件扫描），第 ${attempt} 次重试...`)
      // 同步等待，避免占用事件循环
      try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800 * attempt)
      } catch {}
    }
  }
  throw lastError
}

// 校验压缩包是否完整可读（而非只看文件大小）
// 被安全软件拦截/隔离后残留的半截文件大小也很大，但无法解压，必须重新下载
function isArchiveReadable(archivePath: string): boolean {
  try {
    const size = fs.statSync(archivePath).size
    if (size < 1000) return false
    if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
      // tar.gz 用 gzip 头判断即可（1f 8b）
      const fd = fs.openSync(archivePath, 'r')
      const head = Buffer.alloc(2)
      fs.readSync(fd, head, 0, 2, 0)
      fs.closeSync(fd)
      return head[0] === 0x1f && head[1] === 0x8b
    }
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(archivePath)
    return zip.getEntries().length > 0
  } catch {
    return false
  }
}

// 硬件加速：默认开启以提升界面/内置浏览器渲染流畅度
// 显卡异常时可加启动参数 --disable-hardware-acceleration 关闭
if (process.argv.includes('--disable-hardware-acceleration')) {
  app.disableHardwareAcceleration()
}

if (process.platform === 'win32') app.setAppUserModelId(app.getName())

// 全局错误处理，防止崩溃
process.on('uncaughtException', (error) => {
  console.error('[Main] 未捕获的异常:', error.message)
  if (error.message.includes('EPERM') || error.message.includes('operation not permitted')) {
    console.error('[Main] 文件权限错误，尝试继续运行...')
    return
  }
})

process.on('unhandledRejection', (reason) => {
  console.error('[Main] 未处理的 Promise 拒绝:', reason)
})

let win: BrowserWindow | null = null
const preload = join(__dirname, '../preload/index.js')

// 游戏启动状态
let gameProcess: any = null

// Java 下载状态
let currentJavaDownload: { abort: () => void; cancelled: boolean } | null = null

// ============ Java 下载日志（含 fallback 的界面监听） ============
// 这三个函数此前被大量引用却没有定义（回归 bug）：
// 渲染进程在 downloadJava 里 await getJavaDownloadLogs 抛 ReferenceError，
// 位于 try/finally 之外 → downloadingJava 永远卡在「准备下载...」。
// 这里补齐实现：内存环形列表 + 推送给渲染进程。
const javaDownloadLogsMap = new Map<string, string[]>()

function pushJavaDownloadLog(version: string, line: string, event?: any): void {
  try {
    const list = javaDownloadLogsMap.get(version) || []
    list.push(line)
    if (list.length > 2000) list.splice(0, list.length - 1000)
    javaDownloadLogsMap.set(version, list)
  } catch {}
  console.log(`[JavaLog][${version}] ${line}`)
  try {
    event?.sender?.send('java-download-log', { version, line })
  } catch {}
}

function getJavaDownloadLogs(version: string): string[] {
  const list = javaDownloadLogsMap.get(version)
  return Array.isArray(list) ? [...list] : []
}

function clearJavaDownloadLogs(version: string): void {
  javaDownloadLogsMap.delete(version)
}

// 版本下载状态 - 支持并发下载，使用 Map 存储
interface VersionDownloadState {
  versionId: string
  paused: boolean
  abortController: { abort: () => void } | null
  currentRequest: http.ClientRequest | null
}
const activeVersionDownloads = new Map<string, VersionDownloadState>()

// 模组下载状态 - 支持并发下载
interface ModDownloadState {
  modId: string
  currentRequest: http.ClientRequest | null
  cancelled?: boolean
}
const activeModDownloads = new Map<string, ModDownloadState>()

// 整合包下载状态 - 支持并发下载
interface ModpackDownloadState {
  modId: string
  currentRequest: http.ClientRequest | null
  zipPath: string
  startedAt: number
  lastActivity: number
  cancelled?: boolean
}
const activeModpackDownloads = new Map<string, ModpackDownloadState>()

// 全局下载取消标志 - 由 download-utils.ts 管理（通过 setForceCancelAllDownloads / getForceCancelAllDownloads）

// Java 下载：按平台生成华为云 openjdk 包 URL
// Windows/Linux 用 .zip/.tar.gz，macOS 需区分 x64/arm64
function javaDownloadUrls(version: string): { urls: string[]; filename: string; size: string } {
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
  const arch = process.arch === 'arm64' && platform === 'macos' ? 'aarch64' : 'x64'
  const ext = platform === 'windows' ? 'zip' : 'tar.gz'
  const filename = `openjdk-${version}_${platform}-${arch}_bin.${ext}`

  const base = (v: string) => `https://mirrors.huaweicloud.com/openjdk/${v}/${filename}`

  // 8 特殊：华为云无 8，走 Adoptium
  if (version === '8') {
    const osName = platform === 'windows' ? 'windows' : platform === 'macos' ? 'mac' : 'linux'
    const jreName = platform === 'macos' ? `OpenJDK8U-jre_x64_mac_hotspot_8u432b06` : `OpenJDK8U64-jre_x64_${osName}_hotspot_8u432b06`
    return {
      urls: orderByDownloadSource([
        `https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u432-b06/${jreName}.${ext}`,
        `https://mirrors.aliyun.com/Adoptium/8/jdk8u432-b06/x64/${osName}/`
      ]),
      filename: `temurin-jdk-8.${ext}`,
      size: mt('mc.javaSizeApprox', { mb: 100 })
    }
  }

  const urls = [base(version)]
  // 21/17/11 有 0.x 补丁版本可作备选
  if (version === '21' || version === '17' || version === '11') {
    const patchVersion = version + '.0.2'
    urls.push(`https://mirrors.huaweicloud.com/openjdk/${patchVersion}/${filename}`)
  }

  return {
    urls,
    filename: `jdk-${version}.${ext}`,
    size: version === '25' ? mt('mc.javaSizeApprox', { mb: 220 }) : version === '24' ? mt('mc.javaSizeApprox', { mb: 210 }) : version === '23' ? mt('mc.javaSizeApprox', { mb: 200 }) : version === '22' ? mt('mc.javaSizeApprox', { mb: 195 }) : version === '21' ? mt('mc.javaSizeApprox', { mb: 180 }) : version === '17' ? mt('mc.javaSizeApprox', { mb: 170 }) : mt('mc.javaSizeApprox', { mb: 150 })
  }
}

// 内部函数：下载并安装Java（可被launch-game调用）
async function downloadJavaInternal(javaVersion: string, event?: any): Promise<{ success: boolean; error?: string }> {
  pushJavaDownloadLog(javaVersion, mt('mc.javaStartInternal', { version: javaVersion }), event)
  const downloadInfo = javaDownloadUrls(javaVersion)
  if (!downloadInfo) {
    const msg = mt('mc.javaUnsupported', { version: javaVersion })
    pushJavaDownloadLog(javaVersion, msg, event)
    return { success: false, error: msg }
  }

  // 使用时间戳创建新的下载目录，避免文件被占用问题
  const timestamp = Date.now()
  const downloadDir = path.join(getMinecraftDir(), 'java-downloads', `jdk-${javaVersion}-${timestamp}`)
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true })
  }

  // 清理旧的下载目录
  try {
    const javaDownloadsParent = path.join(getMinecraftDir(), 'java-downloads')
    if (fs.existsSync(javaDownloadsParent)) {
      const oldDirs = fs.readdirSync(javaDownloadsParent).filter(d => d.startsWith(`jdk-${javaVersion}-`) && d !== path.basename(downloadDir))
      for (const oldDir of oldDirs) {
        try {
          const oldDirPath = path.join(javaDownloadsParent, oldDir)
          fs.rmSync(oldDirPath, { recursive: true, force: true })
          console.log(`[Main] 已清理旧目录: ${oldDir}`)
        } catch {}
      }
    }
  } catch {}

  const zipPath = path.join(downloadDir, downloadInfo.filename)
  const tempZipPath = path.join(downloadDir, `temp_${downloadInfo.filename}`)
  let skipDownload = false

  // 检查是否已有有效的压缩包（必须真正可解压，仅看大小会被残留的坏文件骗过）
  if (fs.existsSync(zipPath)) {
    try {
      const stats = fs.statSync(zipPath)
      if (isArchiveReadable(zipPath)) {
        console.log(`[Main] 发现已存在的 Java 压缩包，大小: ${stats.size} bytes，跳过下载`)
        skipDownload = true
      } else {
        console.warn(`[Main] 已存在的 Java 压缩包已损坏或被安全软件拦截，重新下载`)
        try { fs.unlinkSync(zipPath) } catch {}
      }
    } catch {
      try { fs.unlinkSync(zipPath) } catch {}
    }
  }

  if (!skipDownload) {
    event?.sender?.send('java-download-progress', { version: javaVersion, progress: 0, status: 'downloading', speed: 0 })

    let cancelled = false
    currentJavaDownload = { abort: () => { cancelled = true }, cancelled: false }

    let downloadSuccess = false
    let lastError = ''

    for (let i = 0; i < downloadInfo.urls.length; i++) {
      if (cancelled || currentJavaDownload?.cancelled) {
        return { success: false, error: mt('mc.downloadCancelled') }
      }

      const url = downloadInfo.urls[i]
      console.log(`[Main] 尝试下载源 ${i + 1}/${downloadInfo.urls.length}: ${url}`)

      try {
        await downloadFile(url, tempZipPath, (progress, speed) => {
          if (!cancelled) {
            event?.sender?.send('java-download-progress', { version: javaVersion, progress, speed: speed || 0, status: 'downloading' })
          }
        }, () => cancelled)

        if (cancelled) {
          return { success: false, error: mt('mc.downloadCancelled') }
        }

        // 下载成功后移动到目标位置
        if (fs.existsSync(zipPath)) {
          try {
            setTimeout(() => {
              try { fs.unlinkSync(zipPath) } catch {}
            }, 100)
          } catch {}
        }

        try {
          fs.copyFileSync(tempZipPath, zipPath)
          try { fs.unlinkSync(tempZipPath) } catch {}
        } catch (copyError: any) {
          try { fs.renameSync(tempZipPath, zipPath) } catch (renameError: any) {
            if (renameError.code === 'EXDEV' || renameError.code === 'EPERM') {
              const readStream = fs.createReadStream(tempZipPath)
              const writeStream = fs.createWriteStream(zipPath)
              await new Promise<void>((resolve, reject) => {
                readStream.pipe(writeStream)
                writeStream.on('finish', () => {
                  try { fs.unlinkSync(tempZipPath) } catch {}
                  resolve()
                })
                writeStream.on('error', reject)
                readStream.on('error', reject)
              })
            } else {
              throw renameError
            }
          }
        }

        downloadSuccess = true
        console.log(`[Main] 下载成功，使用源: ${url}`)
        break
      } catch (downloadError: any) {
        console.error(`[Main] 源 ${i + 1} 下载失败:`, downloadError.message)
        lastError = downloadError.message
        pushJavaDownloadLog(javaVersion, mt('mc.javaSourceFailed', { index: i + 1, err: downloadError.message }), event)
      }
    }

    if (!downloadSuccess) {
      const msg = mt('mc.downloadFailed', { err: lastError })
      pushJavaDownloadLog(javaVersion, msg, event)
      event?.sender?.send('java-download-progress', { version: javaVersion, progress: 0, status: 'failed', error: lastError })
      return { success: false, error: msg }
    }
  }

  // 解压 zip 文件
  event?.sender?.send('java-download-progress', { version: javaVersion, progress: 100, status: 'extracting', speed: 0 })

  const extractDir = path.join(getMinecraftDir(), 'java', `jdk-${javaVersion}`)

  // 删除旧目录
  if (fs.existsSync(extractDir)) {
    try {
      fs.rmSync(extractDir, { recursive: true, force: true })
    } catch (err) {
      try {
        setTimeout(() => {
          try {
            fs.rmSync(extractDir, { recursive: true, force: true })
          } catch {}
        }, 100)
      } catch {}
    }
  }

  fs.mkdirSync(extractDir, { recursive: true })

  try {
    // 跨平台解压（zip 用 adm-zip，tar.gz 用系统 tar），文件被安全软件占用时自动重试
    // 解压前先清除「来自互联网」标记，否则 Windows 安全中心可能拦截其中的可执行文件
    unblockMarkOfTheWeb(zipPath)
    extractArchiveWithRetry(zipPath, extractDir)

    // 移动内容到正确位置
    const entries = fs.readdirSync(extractDir)
    if (entries.length === 1) {
      const subDir = path.join(extractDir, entries[0])
      const subStats = fs.statSync(subDir)
      if (subStats.isDirectory()) {
        const nestedEntries = fs.readdirSync(subDir)
        if (nestedEntries.some(e => e === 'bin')) {
          const newExtractDir = path.join(extractDir, 'jdk')
          fs.renameSync(subDir, newExtractDir)
          for (const entry of nestedEntries) {
            fs.renameSync(path.join(newExtractDir, entry), path.join(extractDir, entry))
          }
          fs.rmdirSync(newExtractDir)
        }
      }
    }

    console.log(`[Main] Java ${javaVersion} 安装完成`)
    pushJavaDownloadLog(javaVersion, mt('mc.javaInstallComplete', { version: javaVersion }), event)
    // 递归清除解压产物上的「来自互联网」标记，避免 Windows 安全中心拦截 java.exe
    unblockMarkOfTheWeb(extractDir, true)
    invalidateJavaCache()
    event?.sender?.send('java-download-progress', { version: javaVersion, progress: 100, status: 'completed' })
    return { success: true }
  } catch (extractError: any) {
    console.error('[Main] 解压失败:', extractError)
    const detail = extractError.message || String(extractError)
    const hint = /EBUSY|EPERM|EACCES|resource busy|being used|另一个程序|拒绝访问|正被/i.test(detail)
      ? mt('mc.extractBlockedHint')
      : ''
    const errMsg = mt('mc.extractFailed', { detail, hint })
    pushJavaDownloadLog(javaVersion, errMsg, event)
    event?.sender?.send('java-download-progress', { version: javaVersion, progress: 0, status: 'failed', error: errMsg })
    return { success: false, error: mt('mc.extractFailed', { detail, hint }) }
  }
}

// 发送游戏日志到渲染进程
function sendGameLog(level: string, message: string) {
  if (win) {
    win.webContents.send('game-log', {
      level,
      message,
      timestamp: new Date().toISOString()
    })
  }
}

// ========== 启动流程中文日志 ==========
// 把「预检测 → 选 Java → 收集参数 → 组装启动命令」的关键信息用中文逐条打印。
// 一方面经 console 写入启动器日志文件，另一方面推送到界面的游戏日志面板，
// 让启动过程对用户可见、出问题时能直接看到是哪一步不对。
function launchLog(message: string, level: 'info' | 'warn' = 'info') {
  const line = `[启动] ${message}`
  if (level === 'warn') console.warn(line)
  else console.log(line)
  sendGameLog(level, line)
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workArea
  const windowWidth = Math.min(1400, workArea.width - 80)
  const windowHeight = Math.min(850, workArea.height - 80)
  // 居中于 workArea（排除任务栏），避免任务栏在顶部时窗口偏移
  const x = Math.round(workArea.x + (workArea.width - windowWidth) / 2)
  const y = Math.round(workArea.y + (workArea.height - windowHeight) / 2)
  
  win = new BrowserWindow({
    title: `ZNCraftLauncher ${APP_LABEL}`,
    x,
    y,
    width: windowWidth,
    height: windowHeight,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    resizable: true,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: false,
      spellcheck: false,
      backgroundThrottling: false
    },
    show: false,
    paintWhenInitiallyHidden: true,
    autoHideMenuBar: true,
    useContentSize: true
  })

  win.webContents.on('did-finish-load', () => {
    if (win) {
      if (!win.isVisible()) {
        win.show()
        win.focus()
      }
      if (win.isMinimized()) {
        win.restore()
      }
    }
  })

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  win.webContents.on('console-message', (event, level, message) => {
    console.log('Renderer:', message)
  })

  win.on('maximize', () => {
    win?.webContents.send('window-maximized', true)
  })
  
  win.on('unmaximize', () => {
    win?.webContents.send('window-maximized', false)
  })

  const devServerUrl = 'http://localhost:5174'
  
  win.loadURL(devServerUrl)
  .then(() => {
    // 开发时打开开发者工具，生产环境注释掉
    // win?.webContents.openDevTools()
    win?.show()
    win?.focus()
  })
  .catch((error) => {
    console.error('Failed to load dev server:', error)
    const indexHtml = join(process.env.DIST || '', 'index.html')
    console.log('Loading file:', indexHtml)
    win?.loadFile(indexHtml)
    win?.show()
    win?.focus()
  })

  win.on('close', () => {
    closeBrowserView()
    win = null
  })

  win.on('resize', () => {
    updateBrowserBounds()
  })
}

// ============ 内置浏览器 (WebContentsView) ============
let browserView: WebContentsView | null = null
let browserFullscreen = false
const BROWSER_TOOLBAR_HEIGHT = 48

function updateBrowserBounds() {
  if (!browserView || !win || win.isDestroyed()) return
  const [width, height] = win.getContentSize()
  if (browserFullscreen) {
    browserView.setBounds({ x: 0, y: 0, width, height })
  } else {
    browserView.setBounds({
      x: 4,
      y: 4,
      width: Math.max(0, width - 8),
      height: Math.max(0, height - 8 - BROWSER_TOOLBAR_HEIGHT)
    })
  }
}

function sendBrowserState() {
  if (!win || win.isDestroyed() || !browserView) return
  const wc = browserView.webContents
  const state = {
    url: wc.getURL(),
    title: wc.getTitle(),
    canGoBack: wc.canGoBack(),
    canGoForward: wc.canGoForward(),
    isLoading: wc.isLoading(),
    error: browserError,
    fullscreen: browserFullscreen,
    closed: false
  }
  win.webContents.send('browser-state', state)
}

function toggleBrowserFullscreen() {
  if (!browserView || !win || win.isDestroyed()) return
  browserFullscreen = !browserFullscreen
  updateBrowserBounds()
  sendBrowserState()
}

let browserError = ''

function openBrowserView(url: string) {
  if (!win || win.isDestroyed()) return
  if (!browserView) {
    browserError = ''
    browserView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        sandbox: true,
        spellcheck: true,
        backgroundThrottling: false
      }
    })
    win.contentView.addChildView(browserView)
    browserView.setBackgroundColor('#0d0d0d')
    const wc = browserView.webContents
    // 新窗口链接在同视图内打开（http/https），其他协议走系统浏览器
    wc.setWindowOpenHandler(({ url: targetUrl }) => {
      if (/^https?:\/\//i.test(targetUrl)) {
        wc.loadURL(targetUrl)
      } else if (!targetUrl.startsWith('about:') && !targetUrl.startsWith('javascript:')) {
        shell.openExternal(targetUrl)
      }
      return { action: 'deny' }
    })
    // 导航守卫：仅允许 http/https 导航
    wc.on('will-navigate', (event, targetUrl) => {
      if (!/^https?:\/\//i.test(targetUrl)) {
        event.preventDefault()
        if (!targetUrl.startsWith('about:')) shell.openExternal(targetUrl)
      }
    })
    // 键盘快捷键：Alt+左右 / F5 / Ctrl+R / Esc / Ctrl+W / F11 全屏
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const alt = input.alt
      const ctrl = input.control || input.meta
      if (alt && input.key === 'ArrowLeft' && wc.canGoBack()) { wc.goBack(); event.preventDefault() }
      else if (alt && input.key === 'ArrowRight' && wc.canGoForward()) { wc.goForward(); event.preventDefault() }
      else if (input.key === 'F5' || (ctrl && input.key.toLowerCase() === 'r')) { wc.reload(); event.preventDefault() }
      else if (input.key === 'F11') { toggleBrowserFullscreen(); event.preventDefault() }
      else if (ctrl && input.key.toLowerCase() === 'w') { closeBrowserView(); event.preventDefault() }
      else if (input.key === 'Escape') {
        if (browserFullscreen) { toggleBrowserFullscreen() } else { closeBrowserView() }
        event.preventDefault()
      }
    })
    // 下载处理：进度与完成事件
    wc.session.on('will-download', (event, item) => {
      const totalBytes = item.getTotalBytes()
      const sendProgress = () => {
        if (!win || win.isDestroyed()) return
        win.webContents.send('browser-download', {
          filename: item.getFilename(),
          receivedBytes: item.getReceivedBytes(),
          totalBytes,
          state: item.getState()
        })
      }
      item.on('updated', () => sendProgress())
      item.on('done', (_e, state, savePath) => {
        sendProgress()
        if (state === 'completed' && win && !win.isDestroyed()) {
          win.webContents.send('browser-download-done', { savePath, filename: item.getFilename() })
        }
      })
    })
    wc.on('did-fail-load', (_e, code, desc, validatedUrl, isMainFrame) => {
      if (isMainFrame && code !== -3) {
        browserError = desc || mt('mc.browserLoadFailed', { code })
      }
      sendBrowserState()
    })
    wc.on('did-navigate', () => { browserError = ''; sendBrowserState() })
    wc.on('did-navigate-in-page', () => sendBrowserState())
    wc.on('did-start-loading', () => { browserError = ''; sendBrowserState() })
    wc.on('did-stop-loading', () => sendBrowserState())
    wc.on('page-title-updated', () => sendBrowserState())
  }
  updateBrowserBounds()
  if (browserView.webContents.getURL() !== url) {
    browserView.webContents.loadURL(url)
  }
  sendBrowserState()
}

function closeBrowserView() {
  if (!browserView) return
  const wc = browserView.webContents
  if (win && !win.isDestroyed()) {
    win.contentView.removeChildView(browserView)
    win.webContents.send('browser-state', { url: '', title: '', canGoBack: false, canGoForward: false, isLoading: false, error: '', fullscreen: false, closed: true })
  }
  wc.close()
  browserView = null
  browserFullscreen = false
}

ipcMain.handle('open-browser', async (event, url: string) => {
  if (!/^https?:\/\//i.test(url)) return { success: false }
  openBrowserView(url)
  return { success: true }
})

ipcMain.handle('close-browser', async () => {
  closeBrowserView()
})

ipcMain.handle('browser-action', async (event, action: string, url?: string) => {
  if (!browserView) return
  const wc = browserView.webContents
  switch (action) {
    case 'back': if (wc.canGoBack()) wc.goBack(); break
    case 'forward': if (wc.canGoForward()) wc.goForward(); break
    case 'reload': wc.reload(); break
    case 'stop': wc.stop(); break
    case 'fullscreen': toggleBrowserFullscreen(); break
    case 'load': if (url && /^https?:\/\//i.test(url)) wc.loadURL(url); break
  }
})

ipcMain.handle('show-item-in-folder', async (event, filePath: string) => {
  if (filePath) shell.showItemInFolder(filePath)
})

// 安装内置浏览器下载的本地文件到游戏目录（支持版本隔离）
ipcMain.handle('install-local-file', async (event, filePath: string, target: string, targetGameVersion?: string) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { success: false, error: mt('mc.fileNotExist') }
    const targetDir = target === 'resourcepacks' ? 'resourcepacks' :
                      target === 'shaderpacks' ? 'shaderpacks' :
                      target === 'modpack-downloads' ? 'modpack-downloads' : 'mods'
    const destDir = targetGameVersion
      ? path.join(getMinecraftDir(), 'versions', targetGameVersion, targetDir)
      : path.join(getMinecraftDir(), targetDir)
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
    const fileName = path.basename(filePath)
    // 同一文件重复安装时跳过复制：否则会生成 -1/-2 副本，游戏会同时加载多个重复文件
    const srcHash = await sha1FileAsync(filePath)
    if (srcHash) {
      const existingPath = path.join(destDir, fileName)
      if (fs.existsSync(existingPath) && (await sha1FileAsync(existingPath)) === srcHash) {
        return { success: true, skipped: true, message: mt('mc.installedToGameDir', { target: targetDir }), filePath: existingPath, fileName }
      }
    }
    let destPath = path.join(destDir, fileName)
    let i = 1
    while (fs.existsSync(destPath)) {
      const ext = path.extname(fileName)
      const base = path.basename(fileName, ext)
      destPath = path.join(destDir, `${base}-${i}${ext}`)
      i++
    }
    fs.copyFileSync(filePath, destPath)
    return { success: true, message: mt('mc.installedToGameDir', { target: targetDir }), filePath: destPath, fileName: path.basename(destPath) }
  } catch (error: any) {
    return { success: false, error: error.message || mt('mc.installFailed') }
  }
})

// ==================== 下载源策略 ====================
// official: 官方源优先；mirror: 国内镜像优先；auto: 启动时测速自动选择
type DownloadSourceMode = 'auto' | 'official' | 'mirror'
let downloadSourceMode: DownloadSourceMode = 'mirror'
let autoPrefersMirror: boolean | null = null
let autoProbeAt = 0
const AUTO_PROBE_TTL = 10 * 60 * 1000

// 出现这些主机即视为国内镜像源
const MIRROR_HOSTS = [
  'bmclapi2.bangbang93.com',
  'bmclapi.bangbang93.com',
  'download.mcbbs.net',
  'maven.aliyun.com',
  'mirrors.aliyun.com',
  'mirrors.huaweicloud.com'
]

function isMirrorUrl(url: string): boolean {
  return MIRROR_HOSTS.some(h => url.includes(h))
}

function setDownloadSourceMode(mode: string): void {
  if (mode === 'official' || mode === 'mirror' || mode === 'auto') {
    downloadSourceMode = mode
    console.log(`[Main] 下载源策略已设置为: ${mode}`)
  }
}

// auto 模式：并发探测官方 / 镜像清单，谁快用谁，结果缓存 10 分钟
async function probeMirrorPreference(): Promise<boolean> {
  const now = Date.now()
  if (autoPrefersMirror !== null && now - autoProbeAt < AUTO_PROBE_TTL) {
    return autoPrefersMirror
  }
  const official = 'https://launchermeta.mojang.com/mc/game/version_manifest.json'
  const mirror = 'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json'
  const measure = async (url: string): Promise<number> => {
    const t0 = Date.now()
    try {
      const resp = await httpFetch(url, { timeout: 5000 })
      if (!resp.ok) return Number.POSITIVE_INFINITY
      await resp.arrayBuffer()
      return Date.now() - t0
    } catch {
      return Number.POSITIVE_INFINITY
    }
  }
  const [tOfficial, tMirror] = await Promise.all([measure(official), measure(mirror)])
  autoPrefersMirror = tMirror < tOfficial
  autoProbeAt = now
  const fmt = (t: number) => (t === Number.POSITIVE_INFINITY ? 'X' : `${t}ms`)
  console.log(`[Main] 下载源自动测速: 官方 ${fmt(tOfficial)} / 镜像 ${fmt(tMirror)} → ${autoPrefersMirror ? '镜像优先' : '官方优先'}`)
  return autoPrefersMirror
}

// auto 模式下在下载开始前预热一次测速结果（非 auto 直接返回）
async function ensureAutoProbe(): Promise<void> {
  if (downloadSourceMode === 'auto') {
    try { await probeMirrorPreference() } catch {}
  }
}

function preferMirror(): boolean {
  if (downloadSourceMode === 'mirror') return true
  if (downloadSourceMode === 'official') return false
  // auto：尚未测速完成时默认镜像优先（对国内网络更友好）
  return autoPrefersMirror === null ? true : autoPrefersMirror
}

// 把「官方在前、镜像在后」的候选列表按当前策略重排
function orderByDownloadSource<T extends string>(urls: T[]): T[] {
  if (!urls || urls.length <= 1) return urls
  if (!preferMirror()) return urls
  const mirrors = urls.filter(isMirrorUrl)
  const others = urls.filter(u => !isMirrorUrl(u))
  return [...mirrors, ...others]
}

// 获取 Minecraft 目录 - 使用独立文件夹避免与其他启动器冲突
let customGameDir: string | null = null

function getMinecraftDir(): string {
  let dir: string
  if (customGameDir) {
    dir = customGameDir
  } else {
    // 按平台选择数据目录：Windows 沿用 %APPDATA%，macOS/Linux 用 home 下的 .zncl
    // 避免直接依赖 process.env.APPDATA（macOS/Linux 没有）
    let base: string
    if (process.platform === 'win32') {
      base = process.env.APPDATA || app.getPath('appData')
    } else {
      base = process.env.HOME || app.getPath('home')
    }
    if (!base) {
      throw new Error(mt('mc.appDataDirNotFound'))
    }
    dir = path.join(base, '.zncl')
  }
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      console.log(`[Main] 创建 Minecraft 目录: ${dir}`)
    } catch (e: any) {
      console.warn(`[Main] 创建 Minecraft 目录失败: ${dir}`, e?.message || e)
    }
  }
  return dir
}

// 当前平台对应的 Minecraft 规则 os.name（windows/osx/linux）
const CURRENT_OS_NAME = osKey()
// 附加兼容：osx 在部分旧规则中写作 macos
function matchesOsName(name: string): boolean {
  if (name === CURRENT_OS_NAME) return true
  if (CURRENT_OS_NAME === 'osx' && (name === 'macos' || name === 'mac')) return true
  return false
}

function isLibAllowed(lib: any): boolean {
  if (!lib.rules || lib.rules.length === 0) return true

  let allowed = false
  for (const rule of lib.rules) {
    if (rule.action === 'allow') {
      if (!rule.os || matchesOsName(rule.os.name)) {
        allowed = true
      }
    } else if (rule.action === 'disallow') {
      if (rule.os && matchesOsName(rule.os.name)) {
        allowed = false
      }
    }
  }
  return allowed
}

// ========== Java 检测（带缓存，避免每次启动重复扫描和 spawn java -version） ==========
interface JavaCandidate {
  path: string
  version: number
}

// 路径 -> 版本 缓存，避免对同一 java.exe 重复执行 `-version`（每次约 300-500ms）
const javaVersionCache = new Map<string, number | null>()
// 全量扫描结果缓存，安装/删除 Java 后调用 invalidateJavaCache() 失效
let javaScanCache: { at: number; list: JavaCandidate[] } | null = null
const JAVA_SCAN_TTL = 60_000

function invalidateJavaCache() {
  javaVersionCache.clear()
  javaScanCache = null
}

function detectJavaVersion(javaPath: string): Promise<number | null> {
  if (javaVersionCache.has(javaPath)) {
    return Promise.resolve(javaVersionCache.get(javaPath) || null)
  }
  return new Promise((resolve) => {
    let proc: any
    try {
      proc = spawn(javaPath, ['-version'], { shell: false })
    } catch {
      javaVersionCache.set(javaPath, null)
      resolve(null)
      return
    }
    let output = ''
    let settled = false
    const done = (version: number | null) => {
      if (settled) return
      settled = true
      javaVersionCache.set(javaPath, version)
      resolve(version)
    }
    proc.stderr?.on('data', (data: Buffer) => { output += data.toString() })
    proc.on('error', () => done(null))
    proc.on('close', () => {
      const match = output.match(/version "?(\d+)(?:\.(\d+))?/i)
      if (!match) return done(null)
      const major = parseInt(match[1])
      done(major === 1 ? parseInt(match[2] || '0') : major)
    })
    // 防御：5 秒内没拿到版本则放弃，避免卡住启动流程
    setTimeout(() => {
      try { proc.kill() } catch {}
      done(null)
    }, 5000)
  })
}

async function scanJavaCandidates(force = false): Promise<JavaCandidate[]> {
  const now = Date.now()
  if (!force && javaScanCache && now - javaScanCache.at < JAVA_SCAN_TTL) {
    return javaScanCache.list
  }

  const foundPaths = new Set<string>()
  const launcherJavaDir = path.join(getMinecraftDir(), 'java')
  const javaExe = javaExeName()

  // 按平台提供常见 Java 安装目录
  const possiblePaths: string[] = [launcherJavaDir]
  if (process.platform === 'win32') {
    possiblePaths.push(
      path.join(process.env.LOCALAPPDATA || '', 'Packages', 'Microsoft.OpenJDK.21', 'LocalCache', 'Local', 'Microsoft', 'OpenJDK', 'jdk-21', 'bin'),
      'C:\\Program Files\\Java',
      'C:\\Program Files (x86)\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Eclipse Adoptium'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Java'),
    )
  } else if (process.platform === 'darwin') {
    possiblePaths.push(
      '/Library/Java/JavaVirtualMachines',
      '/Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home',
    )
  } else {
    possiblePaths.push(
      '/usr/lib/jvm',
      '/usr/local/openjdk',
      '/opt/java',
      '/opt/jdk',
      '/usr/java',
    )
  }

  const scanPath = (basePath: string) => {
    if (!basePath || !fs.existsSync(basePath)) return

    if (path.basename(basePath) === 'bin') {
      const javaBin = path.join(basePath, javaExe)
      if (fs.existsSync(javaBin)) foundPaths.add(javaBin)
      return
    }

    try {
      const entries = fs.readdirSync(basePath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const javaBin = path.join(basePath, entry.name, 'bin', javaExe)
          if (fs.existsSync(javaBin)) {
            foundPaths.add(javaBin)
          } else {
            scanPath(path.join(basePath, entry.name))
          }
        }
      }
    } catch {}
  }

  for (const basePath of possiblePaths) {
    scanPath(basePath)
  }

  // macOS 的 Contents/Home 结构（JDK 目录下套 Home/bin/java）
  if (process.platform === 'darwin') {
    try {
      const jvmDir = '/Library/Java/JavaVirtualMachines'
      if (fs.existsSync(jvmDir)) {
        for (const entry of fs.readdirSync(jvmDir)) {
          const homeBin = path.join(jvmDir, entry, 'Contents', 'Home', 'bin', javaExe)
          if (fs.existsSync(homeBin)) foundPaths.add(homeBin)
        }
      }
    } catch {}
  }

  try {
    const whereCmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const checkJava = spawn(whereCmd, ['java'], { shell: false })
      let stdout = ''
      checkJava.stdout.on('data', (data) => { stdout += data.toString() })
      checkJava.on('close', (code) => {
        if (code === 0 && stdout) resolve({ stdout: stdout.trim().split('\n')[0], stderr: '' })
        else reject(new Error('Java not found in PATH'))
      })
    })
    if (stdout) foundPaths.add(stdout)
  } catch {}

  // 并行检测所有候选路径的版本，大幅缩短首次检测耗时
  const results = await Promise.all(
    [...foundPaths].map(async (p) => {
      const version = await detectJavaVersion(p)
      return version !== null ? { path: p, version } : null
    })
  )
  const candidates: JavaCandidate[] = []
  for (const r of results) {
    if (r) candidates.push(r)
  }
  candidates.sort((a, b) => a.version - b.version)

  javaScanCache = { at: now, list: candidates }
  console.log(`[Main] 找到的 Java 版本:`, candidates.map(c => `${c.version} (${c.path})`))
  return candidates
}

// Minecraft 1.20.5+ 官方支持的 Java 版本。
// 注意不是 22 —— Mojang 从未认证过 Java 22，原代码把上限写成 22 是错的，
// 导致「只有 23+ 可用」时 23 会被优先选中而 25 被跳过。
const OFFICIAL_JAVA = 21

// 依据 Minecraft 版本号推断所需的 Java 版本与类型。
//
// 旧实现直接用 /^(?:1\.)?(\d+)\.(\d+)/ 取「major/minor」，随后却按 major 判断，
// 导致不同位数版本号的语义完全不一致：
//   "1.21"   -> major=1,  minor=21  -> 落不进 major>=21 分支 -> 默认 Java 17（错误！）
//   "1.21.4" -> major=21, minor=4   -> 命中 Java 21（正确）
// 于是「1.21」这种两段式整合包（如 Fabric 1.21）会被错误地用 Java 17 启动，
// Fabric API 等 mod 便会报「需要 Java 21」。
//
// 这里统一做法：先剥掉发行号前缀 "1."，再取「次版本.补丁」，语义对
// "1.21" / "1.21.4" / "1.20.6" / "26.1" 全部一致。
function requiredJavaForMcVersion(mcVersion: string): { version: number; type: 'legacy' | 'modern' | 'latest' } | null {
  const normalized = String(mcVersion || '').trim().replace(/^1\./, '')
  const m = normalized.match(/^(\d+)(?:\.(\d+))?/)
  if (!m) return null
  const minor = parseInt(m[1], 10)
  const patch = m[2] ? parseInt(m[2], 10) : 0
  if (Number.isNaN(minor)) return null

  // Java 25：Minecraft 1.25+ / 26+
  if (minor >= 25) return { version: 25, type: 'latest' }
  // Java 21：Minecraft 1.21+，以及 1.20.5–1.20.6
  if (minor >= 21) return { version: 21, type: 'latest' }
  if (minor === 20 && patch >= 5) return { version: 21, type: 'latest' }
  // Java 17：Minecraft 1.18–1.20.4
  if (minor >= 18) return { version: 17, type: 'modern' }
  // Java 16：Minecraft 1.17
  if (minor === 17) return { version: 16, type: 'modern' }
  // Java 8：Minecraft 1.16.5 及以下
  return { version: 8, type: 'modern' }
}

// 取满足 lowerBound 的最高版本
function newestAtLeast(candidates: JavaCandidate[], lowerBound: number): JavaCandidate | undefined {
  return candidates
    .filter(j => j.version >= lowerBound)
    .sort((a, b) => b.version - a.version)[0]
}

// 取满足 lowerBound 的最低版本。
// 默认策略用这个而不是 highest：版本越靠近官方推荐值越保险，
// 只装了 23 和 25 时选 23 更安全，不会无缘无故跳到最新的 25。
function oldestAtLeast(candidates: JavaCandidate[], lowerBound: number): JavaCandidate | undefined {
  return candidates
    .filter(j => j.version >= lowerBound)
    .sort((a, b) => a.version - b.version)[0]
}

function pickJava(
  candidates: JavaCandidate[],
  version?: 'legacy' | 'modern' | 'latest',
  minVersion?: number,
  allowNewerJava = false
): JavaCandidate | null {
  const requiredMin = minVersion || 17

  if (version === 'legacy') {
    const legacyJava = candidates.find(j => j.version === 8 || j.version === 17)
    if (legacyJava) return legacyJava
    const oldJava = candidates.find(j => j.version < 18)
    if (oldJava) return oldJava
  } else {
    // 用户在设置里勾选了「允许使用不推荐的 Java 版本」：先试满足要求的最新版。
    // 注意这里不能写成 else if —— 万一没有任何版本满足要求，必须继续往下走默认逻辑，
    // 让调用方拿回 null 从而触发自动下载；否则会掉进下面的兜底分支，
    // 返回一个版本过低的 Java，自动下载被跳过，用户只看到「Java 版本不兼容」。
    if (allowNewerJava) {
      const newest = newestAtLeast(candidates, requiredMin)
      if (newest) {
        console.log(`[Main] 已允许不推荐版本，选择满足要求的最新版 Java ${newest.version}: ${newest.path}`)
        return newest
      }
      console.warn(`[Main] 已允许不推荐版本，但没有任何 Java >= ${requiredMin}，回退到默认策略`)
    }

    if (version === 'latest' || requiredMin >= OFFICIAL_JAVA) {
      // 默认：优先官方推荐的 Java 21。
      // 必须加 requiredMin <= OFFICIAL_JAVA 这个前提 —— 否则玩需要 Java 25 的版本时，
      // 即使 Java 25 已经装好也会先命中 21，然后被后面的版本检查拦下报「Java 版本不兼容」，
      // 而且因为候选非空，自动下载也不会触发。
      const official = requiredMin <= OFFICIAL_JAVA ? candidates.find(j => j.version === OFFICIAL_JAVA) : undefined
      if (official) {
        console.log(`[Main] 优先选择 Java ${OFFICIAL_JAVA}（官方推荐）: ${official.path}`)
        return official
      }
      // 其次：满足要求且不高于官方版本
      const safeJava = candidates.find(j => j.version >= requiredMin && j.version <= OFFICIAL_JAVA)
      if (safeJava) {
        console.log(`[Main] 选择安全范围内的 Java ${safeJava.version}: ${safeJava.path}`)
        return safeJava
      }
      // 没有官方版本可用：取满足要求的最低版本（尽量靠近官方推荐值）
      const anyJava = oldestAtLeast(candidates, requiredMin)
      if (anyJava) {
        console.warn(`[Main] 警告: 未找到 Java ${OFFICIAL_JAVA}，使用 Java ${anyJava.version}（部分 mod 可能不兼容，可勾选「允许使用不推荐的 Java 版本」改用最新版）: ${anyJava.path}`)
        return anyJava
      }
    } else {
      const idealJava = candidates.find(j => j.version === OFFICIAL_JAVA || (j.version >= requiredMin && j.version <= OFFICIAL_JAVA))
      if (idealJava) return idealJava
      const modernJava = oldestAtLeast(candidates, requiredMin)
      if (modernJava) return modernJava
    }
  }

  // 兜底：在所有版本中选最接近官方推荐的
  if (candidates.length > 0) {
    const fallbackSorted = [...candidates].sort((a, b) => Math.abs(a.version - OFFICIAL_JAVA) - Math.abs(b.version - OFFICIAL_JAVA))
    console.warn(`[Main] 使用兜底选择 Java ${fallbackSorted[0].version}: ${fallbackSorted[0].path}`)
    return fallbackSorted[0]
  }

  return null
}

// 带版本的 Java 查找（供 launch-game 使用，避免二次 spawn -version）
async function findJava(
  version?: 'legacy' | 'modern' | 'latest',
  minVersion?: number,
  forceRescan = false,
  allowNewerJava = false
): Promise<JavaCandidate | null> {
  const candidates = await scanJavaCandidates(forceRescan)
  return pickJava(candidates, version, minVersion, allowNewerJava)
}

// 解析基础 Minecraft 版本号（用于整合包：从 modrinth.index.json 读取）
// 兼容两种格式：新格式 gameVersions[0]；旧格式 dependencies.minecraft
function resolveBaseMcVersion(versionId: string, targetDirName: string): string {
  const minecraftDir = getMinecraftDir()
  const versionsDir = path.join(minecraftDir, 'versions', targetDirName)
  const idxPath = path.join(versionsDir, 'modrinth.index.json')
  if (fs.existsSync(idxPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(idxPath, 'utf-8'))
      if (json.gameVersions && json.gameVersions.length > 0) {
        return json.gameVersions[0] as string
      }
      if (json.dependencies && json.dependencies.minecraft) {
        return json.dependencies.minecraft as string
      }
    } catch (e) {}
  }
  return versionId
}

// 启动前确保基础游戏文件存在（整合包缺 client jar 时自动下载）
async function ensureBaseGameFiles(versionId: string, targetDirName: string, onStatus?: (msg: string) => void): Promise<{ ok: boolean; error?: string; baseMcVersion?: string }> {
  const minecraftDir = getMinecraftDir()
  const versionsDir = path.join(minecraftDir, 'versions', targetDirName)
  const jarFile = path.join(versionsDir, `${targetDirName}.jar`)
  const versionJsonPath = path.join(versionsDir, `${targetDirName}.json`)

  if (fs.existsSync(jarFile) && fs.statSync(jarFile).size >= 50 * 1024) {
    // jar 已存在：若整合包还需加载器合并，则继续处理（不提前返回）
    const loaderInfo = resolveModpackLoader(targetDirName)
    const needLoader = loaderInfo && (loaderInfo.loader === 'fabric-loader' || loaderInfo.loader === 'quilt-loader' || loaderInfo.loader === 'neoforge' || loaderInfo.loader === 'forge')
    const versionJson = (() => {
      try {
        if (fs.existsSync(versionJsonPath)) return JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
      } catch {}
      return null
    })()
    const alreadyMerged = !!versionJson?.inheritsFrom
    if (!needLoader) {
      return { ok: true }
    }
    if (alreadyMerged) {
      // 加载器已合并但 processors 制品缺失时仍需补全（例如首次安装时尚未安装 Java）
      const ld = loaderInfo.loader
      const isInstallerLoader = ld === 'neoforge' || ld === 'forge'
      const baseMc = resolveBaseMcVersion(versionId, targetDirName)
      const libsDir = path.join(getMinecraftDir(), 'libraries')
      if (isInstallerLoader && needsInstallerArtifacts(ld, loaderInfo.version, baseMc, libsDir)) {
        onStatus?.(mt('mc.completingClientFiles', { loader: ld }))
        await installInstallerBasedLoader(ld, targetDirName, baseMc, loaderInfo.version, onStatus)
      }
      return { ok: true }
    }
  }

  const baseMcVersion = resolveBaseMcVersion(versionId, targetDirName)

  // 下载源策略：auto 模式先测速，再决定官方/镜像优先
  await ensureAutoProbe()

  const manifestUrls = orderByDownloadSource([
    'https://launchermeta.mojang.com/mc/game/version_manifest.json',
    'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json',
    'https://download.mcbbs.net/mc/game/version_manifest.json'
  ])

  onStatus?.(mt('mc.fetchingGameFiles', { version: baseMcVersion }))
  let versionMetaUrl: string | null = null
  for (const manifestUrl of manifestUrls) {
    try {
      const manifestResp = await httpFetch(manifestUrl, { timeout: 10000 })
      if (!manifestResp.ok) continue
      const manifestData: any = await manifestResp.json()
      const found = manifestData.versions?.find((v: any) => v.id === baseMcVersion)
      if (found?.url) {
        versionMetaUrl = found.url as string
        break
      }
    } catch (e) {
      console.warn(`[Main] 获取版本清单失败:`, (e as any).message)
    }
  }

  if (!versionMetaUrl) {
    return { ok: false, error: mt('mc.mcDownloadInfoNotFound', { version: baseMcVersion }), baseMcVersion }
  }

  try {
    onStatus?.(mt('mc.downloadingMcClient', { version: baseMcVersion }))
    await installBaseVersion(baseMcVersion, versionMetaUrl, targetDirName, () => false, (type, progress) => {
      onStatus?.(mt('mc.downloadingComponent', { type: type === 'json' ? mt('mc.componentVersionConfig') : type === 'jar' ? mt('mc.componentClient') : type === 'libraries' ? mt('mc.componentLibraries') : mt('mc.componentAssets'), progress }))
    })

    // 整合包需要对应的加载器（Fabric/NeoForge 等）才能真正加载 mod
    const loaderInfo = resolveModpackLoader(targetDirName)
    if (loaderInfo && (loaderInfo.loader === 'fabric-loader' || loaderInfo.loader === 'quilt-loader')) {
      onStatus?.(mt('mc.installingLoader', { loader: loaderInfo.loader, version: loaderInfo.version }))
      const fabricResult = await installFabricLoader(targetDirName, baseMcVersion, loaderInfo.version, onStatus)
      if (!fabricResult.ok) {
        console.warn(`[Main] ${loaderInfo.loader} 安装失败:`, fabricResult.error)
      }
    } else if (loaderInfo && (loaderInfo.loader === 'neoforge' || loaderInfo.loader === 'forge')) {
      onStatus?.(mt('mc.installingLoader', { loader: loaderInfo.loader, version: loaderInfo.version }))
      const loaderResult = await installInstallerBasedLoader(loaderInfo.loader, targetDirName, baseMcVersion, loaderInfo.version, onStatus)
      if (!loaderResult.ok) {
        console.warn(`[Main] ${loaderInfo.loader} 安装失败:`, loaderResult.error)
      }
    }

    // 补全 modrinth.index.json 中缺失的整合包文件（mods/config/shaderpacks 等）
    if (fs.existsSync(path.join(getMinecraftDir(), 'versions', targetDirName, 'modrinth.index.json'))) {
      onStatus?.(mt('mc.checkingModpackIntegrity'))
      const filesResult = await downloadModpackFiles(
        path.join(getMinecraftDir(), 'versions', targetDirName),
        (done, total, name, speed, bytesDone, bytesTotal, threads) => {
          const speedStr = speed > 0 ? ` ${formatSpeed(speed)}` : ''
          const pctStr = bytesTotal > 0 ? ` (${Math.round(bytesDone / bytesTotal * 100)}%)` : ''
          onStatus?.(mt('mc.downloadingModpackFiles', { done, total, pct: pctStr, speed: speedStr, threads, name }))
        }
      )
      if (!filesResult.ok) {
        console.warn(`[Main] 整合包文件补全完成但部分失败: 下载 ${filesResult.downloaded}，失败 ${filesResult.failed}`)
      } else {
        console.log(`[Main] 整合包文件补全: 下载 ${filesResult.downloaded}，复用 ${filesResult.skipped}`)
      }
    }

    return { ok: true, baseMcVersion }
  } catch (e: any) {
    return { ok: false, error: mt('mc.downloadGameFilesFailed', { err: e?.message || e }), baseMcVersion }
  }
}

// 兼容旧调用：仅返回路径
async function findJavaPath(version?: 'legacy' | 'modern' | 'latest', minVersion?: number, allowNewerJava = false): Promise<string | null> {
  const found = await findJava(version, minVersion, false, allowNewerJava)
  return found?.path || null
}

// 读取整合包的加载器信息（fabric-loader / forge / quilt-loader）
// Modrinth 的 dependencies 可能是精确版本（"0.16.5"）或版本范围（">=0.16.5"、"^0.16.5"）
// 版本范围时传 * 给 Fabric API，让它返回最新兼容版本
function resolveModpackLoader(targetDirName: string): { loader: string; version: string } | null {
  const minecraftDir = getMinecraftDir()
  const versionsDir = path.join(minecraftDir, 'versions', targetDirName)
  const idxPath = findModrinthIndex(versionsDir)
  if (!idxPath) return null
  try {
    const json = JSON.parse(fs.readFileSync(idxPath, 'utf-8'))
    const deps = json.dependencies || {}
    for (const key of ['fabric-loader', 'forge', 'quilt-loader', 'neoforge']) {
      if (deps[key]) {
        const raw = String(deps[key]).trim()
        const isRange = /^[><~^[\(]/.test(raw) || raw.includes('||') || raw.includes(' - ')
        const version = isRange ? '*' : raw
        return { loader: key, version }
      }
    }
  } catch (e) {}
  return null
}

// maven 坐标转换为本地库路径（group:artifact:version[:classifier]）
function mavenCoordsToPath(name: string): string {
  const parts = name.split(':')
  if (parts.length < 3) return name
  const [group, artifact, version, classifier] = parts
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? '-' + classifier : ''}.jar`
}

// 启动前校验并补齐版本 json 声明的所有库文件。
// 关键场景：NeoForge/Forge 的模块路径(-p)引用 cpw/mods/bootstraplauncher、securejarhandler
// 以及 asm/JarJarFileSystems 等库。这些库若因安装被跳过或下载失败而缺失，
// JVM 会报 “Unknown module: cpw.mods.securejarhandler” 与
// “ClassNotFoundException: cpw.mods.bootstraplauncher.BootstrapLauncher”。
// 这里在启动前把所有缺失（或 0 字节损坏）的库按官方源 + 镜像补齐。
async function ensureVersionLibraries(
  versionJson: any,
  onStatus?: (msg: string) => void
): Promise<{ downloaded: number; failed: number }> {
  const minecraftDir = getMinecraftDir()
  const librariesDir = path.join(minecraftDir, 'libraries')
  if (!fs.existsSync(librariesDir)) {
    fs.mkdirSync(librariesDir, { recursive: true })
  }

  await ensureAutoProbe()

  type LibTask = { libPath: string; urlBases: string[]; label: string }
  const tasks: LibTask[] = []
  const seenPaths = new Set<string>()

  const isValidJar = (p: string): boolean => {
    try { return fs.existsSync(p) && fs.statSync(p).size > 0 } catch { return false }
  }

  const pushTask = (libPath: string, urlBases: string[], label: string) => {
    if (seenPaths.has(libPath)) return
    seenPaths.add(libPath)
    if (isValidJar(libPath)) return
    tasks.push({ libPath, urlBases: [...new Set(urlBases)], label })
  }

  // 组装候选下载源：库自带 url 优先，再补公共镜像
  const buildUrlBases = (relPath: string, artifactUrl?: string, libUrl?: string): string[] => {
    const bases: string[] = []
    if (artifactUrl) bases.push(artifactUrl)
    if (libUrl) bases.push(`${libUrl.replace(/\/$/, '')}/${relPath}`)
    bases.push(`https://libraries.minecraft.net/${relPath}`)
    bases.push(`https://bmclapi2.bangbang93.com/maven/${relPath}`)
    bases.push(`https://maven.aliyun.com/repository/public/${relPath}`)
    bases.push(`https://maven.minecraftforge.net/${relPath}`)
    bases.push(`https://maven.neoforged.net/releases/${relPath}`)
    return orderByDownloadSource(bases)
  }

  // 1) 版本 json 的 libraries（artifact + natives）
  if (Array.isArray(versionJson?.libraries)) {
    for (const lib of versionJson.libraries) {
      if (!isLibAllowed(lib)) continue
      if (lib.downloads?.artifact?.path) {
        const rel = lib.downloads.artifact.path
        pushTask(path.join(librariesDir, rel), buildUrlBases(rel, lib.downloads.artifact.url, lib.url), lib.name || rel)
      } else if (lib.name) {
        const rel = mavenCoordsToPath(lib.name)
        if (rel.endsWith('.jar')) {
          pushTask(path.join(librariesDir, rel), buildUrlBases(rel, undefined, lib.url), lib.name)
        }
      }

      // natives 原生库（.dll/.so/.dylib）
      if (lib.natives && lib.downloads?.classifiers) {
        const nativesKey = lib.natives
        const nativeKey = nativesKey[CURRENT_OS_NAME]
          || nativesKey[`${CURRENT_OS_NAME}-64`]
          || nativesKey[`${CURRENT_OS_NAME}-32`]
          || (CURRENT_OS_NAME === 'osx' ? (nativesKey.mac || nativesKey['mac-64'] || nativesKey['mac-32']) : null)
        if (nativeKey) {
          const arch = process.arch === 'x64' ? '64' : '32'
          const nativeArtifact = lib.downloads.classifiers[nativeKey.replace('${arch}', arch)]
          if (nativeArtifact?.path) {
            pushTask(
              path.join(librariesDir, nativeArtifact.path),
              buildUrlBases(nativeArtifact.path, nativeArtifact.url),
              `${lib.name || 'native'}:native`
            )
          }
        }
      }
    }
  }

  // 2) 模块路径(-p)兜底：加载器模块 jar 未必登记在 libraries 中，直接按路径补缺
  const jvmArgs: any[] = Array.isArray(versionJson?.arguments?.jvm) ? versionJson.arguments.jvm : []
  for (let i = 0; i < jvmArgs.length; i++) {
    const arg = jvmArgs[i]
    if ((arg === '-p' || arg === '--module-path') && typeof jvmArgs[i + 1] === 'string') {
      const modulePath = jvmArgs[i + 1]
        .replace(/\$\{library_directory\}/g, librariesDir)
        .replace(/\$\{classpath_separator\}/g, path.delimiter)
      for (const entry of modulePath.split(path.delimiter)) {
        const raw = entry.trim()
        if (!raw) continue
        const abs = path.isAbsolute(raw) ? raw : path.join(librariesDir, raw)
        const rel = path.relative(librariesDir, abs).split(path.sep).join('/')
        if (rel.startsWith('..')) continue
        pushTask(abs, buildUrlBases(rel), rel)
      }
    }
  }

  if (tasks.length === 0) return { downloaded: 0, failed: 0 }

  console.log(`[Main] 启动前检测到 ${tasks.length} 个缺失库文件，开始补全`)

  let downloaded = 0
  let failed = 0
  const MAX_CONCURRENT = 8
  let cursor = 0
  const worker = async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]
      if (!task) break
      const dir = path.dirname(task.libPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

      let ok = false
      for (const base of task.urlBases) {
        try {
          onStatus?.(mt('mc.completingLibrary', { label: task.label }))
          await downloadFile(base, task.libPath, undefined, undefined, 2)
          if (isValidJar(task.libPath)) { ok = true; break }
        } catch {
          // 单个源失败继续尝试下一个源
        }
      }
      if (ok) {
        downloaded++
      } else {
        failed++
        console.warn(`[Main] 库文件补全失败(所有源): ${task.label}`)
      }
    }
  }
  await Promise.all(Array(Math.min(MAX_CONCURRENT, tasks.length)).fill(null).map(worker))
  return { downloaded, failed }
}

// 下载 Fabric 加载器并合并到版本 json，使整合包能真正以加载器启动
async function installFabricLoader(targetDirName: string, baseMcVersion: string, loaderVersion: string, onStatus?: (msg: string) => void): Promise<{ ok: boolean; error?: string }> {
  const minecraftDir = getMinecraftDir()
  const versionsDir = path.join(minecraftDir, 'versions', targetDirName)
  const versionJsonPath = path.join(versionsDir, `${targetDirName}.json`)
  const librariesDir = path.join(minecraftDir, 'libraries')

  await ensureAutoProbe()

  // 如果版本是 *（范围），查询实际版本号
  if (loaderVersion === '*' || !loaderVersion) {
    try {
      const listResp = await httpFetch(`https://meta.fabricmc.net/v2/versions/loader/${baseMcVersion}`, { timeout: 10000 })
      if (listResp.ok) {
        const list: any[] = await listResp.json()
        if (list.length > 0) {
          loaderVersion = list[0].version || list[0].loader?.version || '*'
          console.log(`[Main] Fabric 版本范围 → 解析为 ${loaderVersion}`)
        }
      }
    } catch (e) {
      console.warn(`[Main] 查询 Fabric 版本失败:`, (e as any).message)
    }
  }

  // 获取 Fabric 加载器 profile（含 mainClass 与依赖库），带镜像 fallback
  const profileUrls = orderByDownloadSource([
    `https://meta.fabricmc.net/v2/versions/loader/${baseMcVersion}/${loaderVersion}/profile/json`,
    `https://bmclapi2.bangbang93.com/fabric-meta/v2/versions/loader/${baseMcVersion}/${loaderVersion}/profile/json`
  ])
  let profile: any = null
  for (const profileUrl of profileUrls) {
    try {
      const resp = await httpFetch(profileUrl, { timeout: 15000 })
      if (!resp.ok) continue
      profile = await resp.json()
      if (profile?.libraries?.length) break
    } catch (e) {
      console.warn(`[Main] 获取 Fabric profile 失败: ${profileUrl}`, (e as any).message)
    }
  }

  if (!profile || !profile.libraries || profile.libraries.length === 0) {
    return { ok: false, error: mt('mc.fabricInfoFailed', { version: loaderVersion }) }
  }

  // 从 profile 中提取实际安装的 Fabric Loader 版本（日志用）
  const actualFabricVersion = (() => {
    const loaderLib = profile.libraries?.find((l: any) => l.name?.includes('net.fabricmc:fabric-loader:'))
    if (loaderLib?.name) {
      const parts = loaderLib.name.split(':')
      return parts[2] || loaderVersion
    }
    return loaderVersion
  })()
  console.log(`[Main] Fabric Loader 实际版本: ${actualFabricVersion}（请求: ${loaderVersion}）`)

  if (!fs.existsSync(librariesDir)) {
    fs.mkdirSync(librariesDir, { recursive: true })
  }

  // 并发下载 Fabric 依赖库（intermediary、fabric-loader、asm 等）
  let downloaded = 0
  const fabricLibs = profile.libraries.filter((lib: any) => isLibAllowed(lib))
  const fabricUrlBases = orderByDownloadSource([
    'https://maven.fabricmc.net/',
    'https://bmclapi2.bangbang93.com/maven/'
  ])

  const fabricTasks = fabricLibs.map((lib: any) => {
    const libName = lib.name
    if (!libName) return null
    const libUrlBase = lib.url || 'https://maven.fabricmc.net/'
    const libRelPath = mavenCoordsToPath(libName)
    const libPath = path.join(librariesDir, libRelPath)
    return { libName, libUrlBase, libRelPath, libPath }
  }).filter((t: any) => t !== null)

  const FABRIC_LIB_MAX_CONCURRENT = 8
  let fabricCursor = 0
  const fabricLibWorker = async () => {
    while (fabricCursor < fabricTasks.length) {
      const task = fabricTasks[fabricCursor++]
      if (!task) break

      const { libName, libUrlBase, libRelPath, libPath } = task

      if (fs.existsSync(libPath) && fs.statSync(libPath).size > 0) {
        downloaded++
        continue
      }

      const libDir = path.dirname(libPath)
      if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true })
      }

      let ok = false
      for (const base of [...new Set([libUrlBase, ...fabricUrlBases])]) {
        try {
          onStatus?.(mt('mc.downloadingFabricDep', { name: libName }))
          await downloadFile(`${base}${libRelPath}`, libPath, undefined, undefined, 2)
          ok = true
          break
        } catch (e: any) {
          console.warn(`[Main] Fabric 库下载失败: ${base}${libRelPath}`, e?.message || e)
        }
      }
      if (ok) {
        downloaded++
      } else {
        console.warn(`[Main] Fabric 库下载失败(所有源): ${libName}`)
      }
    }
  }
  await Promise.all(Array(Math.min(FABRIC_LIB_MAX_CONCURRENT, fabricTasks.length)).fill(null).map(fabricLibWorker))
  console.log(`[Main] Fabric 依赖库下载完成: ${downloaded}/${fabricTasks.length}`)

  // 合并版本 json：以 fabric profile 的 mainClass + libraries 覆盖 vanilla json
  try {
    const vanillaJson = fs.existsSync(versionJsonPath)
      ? JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
      : {}
    // Fabric profile 的库是 {name, url} 格式，需转换为启动器可识别的 downloads.artifact 格式
    const convertedFabricLibs = (fabricLibs || []).map((lib: any) => {
      const libRelPath = mavenCoordsToPath(lib.name)
      const libUrlBase = lib.url || 'https://maven.fabricmc.net/'
      return {
        ...lib,
        downloads: {
          artifact: {
            path: libRelPath,
            url: `${libUrlBase}${libRelPath}`,
            sha1: lib.sha1 || '',
            size: lib.size || 0
          }
        }
      }
    })
    const mergedJson: any = {
      ...vanillaJson,
      id: baseMcVersion,
      inheritsFrom: baseMcVersion,
      mainClass: profile.mainClass || vanillaJson.mainClass || 'net.fabricmc.loader.impl.launch.knot.KnotClient',
      libraries: [...(convertedFabricLibs || []), ...(vanillaJson.libraries || [])]
    }
    if (!mergedJson.assetIndex && vanillaJson.assetIndex) mergedJson.assetIndex = vanillaJson.assetIndex
    if (!mergedJson.downloads && vanillaJson.downloads) mergedJson.downloads = vanillaJson.downloads
    fs.writeFileSync(versionJsonPath, JSON.stringify(mergedJson, null, 2), 'utf-8')
    console.log(`[Main] Fabric 加载器 ${loaderVersion} 已合并到版本 json`)

    // Fabric Loader 的 MinecraftGameProvider 会通过 inheritsFrom 查找
    // versions/{inheritsFrom}/{inheritsFrom}.jar，必须确保该文件存在
    const baseVersionDir = path.join(minecraftDir, 'versions', baseMcVersion)
    const baseVersionJsonPath = path.join(baseVersionDir, `${baseMcVersion}.json`)
    const baseVersionJarPath = path.join(baseVersionDir, `${baseMcVersion}.jar`)

    // 确保基础版本目录存在
    if (!fs.existsSync(baseVersionDir)) {
      fs.mkdirSync(baseVersionDir, { recursive: true })
    }

    // 创建基础版本 JSON（Fabric 需要读取它来解析游戏文件路径）
    if (!fs.existsSync(baseVersionJsonPath)) {
      try {
        const baseVanillaJson: any = {
          id: baseMcVersion,
          downloads: vanillaJson.downloads || {},
          assetIndex: vanillaJson.assetIndex || {},
          assets: vanillaJson.assets || '',
          libraries: vanillaJson.libraries || []
        }
        fs.writeFileSync(baseVersionJsonPath, JSON.stringify(baseVanillaJson, null, 2), 'utf-8')
        console.log(`[Main] 已创建基础版本 json: ${baseVersionJsonPath}`)
      } catch (e: any) {
        console.warn(`[Main] 创建基础版本 json 失败:`, e?.message || e)
      }
    }

    // 将客户端 jar 复制到基础版本目录（Fabric 通过 inheritsFrom 查找时需要它）
    if (!fs.existsSync(baseVersionJarPath) || fs.statSync(baseVersionJarPath).size < 1024 * 1024) {
      const sourceJarCandidates = [
        path.join(versionsDir, `${targetDirName}.jar`),
        path.join(versionsDir, `${baseMcVersion}.jar`)
      ]
      let sourceJar: string | null = null
      for (const candidate of sourceJarCandidates) {
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).size >= 1024 * 1024) {
            sourceJar = candidate
            break
          }
        } catch {}
      }
      if (sourceJar) {
        try {
          fs.copyFileSync(sourceJar, baseVersionJarPath)
          console.log(`[Main] 已复制客户端 jar 到基础版本目录: ${sourceJar} -> ${baseVersionJarPath}`)
        } catch (e: any) {
          console.warn(`[Main] 复制客户端 jar 失败:`, e?.message || e)
        }
      } else {
        console.warn(`[Main] 未找到客户端 jar，无法复制到基础版本目录`)
      }
    }
  } catch (e: any) {
    console.warn('[Main] 合并 Fabric 版本 json 失败:', e?.message || e)
  }

  return { ok: true }
}

// 检查 installer 处理器生成的关键制品（net/minecraft/client 的 srg jar）是否已存在。
// 这些文件只由官方安装程序的 processors 生成，无法从任何 maven 镜像直接下载。
// 判断某个基础 MC 版本是否已生成 srg 制品。
// 注意：必须按版本判断。之前不区分版本，只要任意版本（如已安装的 NeoForge 1.21.1）
// 存在 srg jar，就会让另一个版本（如 Forge 1.19.2）被误判为“已安装”，
// 从而跳过加载器依赖库下载，导致模块路径(-p)引用不到库、启动即 ClassNotFoundException。
function hasGeneratedClientSrgJar(librariesDir: string, baseMcVersion?: string): boolean {
  const clientDir = path.join(librariesDir, 'net', 'minecraft', 'client')
  if (!fs.existsSync(clientDir)) return false
  try {
    for (const ver of fs.readdirSync(clientDir)) {
      if (baseMcVersion && ver !== baseMcVersion && !ver.startsWith(`${baseMcVersion}-`)) continue
      const verDir = path.join(clientDir, ver)
      if (!fs.statSync(verDir).isDirectory()) continue
      for (const f of fs.readdirSync(verDir)) {
        if (/^client-.*-srg\.jar$/.test(f)) return true
      }
    }
  } catch {}
  return false
}

// 递归复制目录，目标已存在的文件跳过（仅补缺）
function copyMissingRecursive(srcDir: string, destDir: string): number {
  let copied = 0
  if (!fs.existsSync(srcDir)) return 0
  try {
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const s = path.join(srcDir, entry.name)
      const d = path.join(destDir, entry.name)
      if (entry.isDirectory()) {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
        copied += copyMissingRecursive(s, d)
      } else if (!fs.existsSync(d)) {
        fs.mkdirSync(path.dirname(d), { recursive: true })
        fs.copyFileSync(s, d)
        copied++
      }
    }
  } catch (e: any) {
    console.warn('[Main] 复制文件失败:', e?.message || e)
  }
  return copied
}

// 运行官方 installer（--install-client）生成 NeoForge/Forge 关键制品：
// libraries/net/minecraft/client/<ver>/client-*-srg.jar / -extra.jar 与加载器 client jar。
// 这些文件是 ProductionClientProvider / PathBasedLocator 的硬性要求，不运行 processors 启动必然崩溃。
async function runInstallerProcessors(
  loader: 'neoforge' | 'forge',
  loaderVersion: string,
  baseMcVersion: string,
  installerPath: string,
  onStatus?: (msg: string) => void
): Promise<{ ok: boolean; error?: string }> {
  const java = await findJava('modern', 21)
  if (!java) {
    return { ok: false, error: mt('mc.installerJavaMissing') }
  }
  const minecraftDir = getMinecraftDir()
  const librariesDir = path.join(minecraftDir, 'libraries')
  const tempInstall = path.join(tmpdir(), `zncl-${loader}-install-${Date.now()}`)
  fs.mkdirSync(tempInstall, { recursive: true })
  try {
    // 官方 installer 要求 launcher_profiles.json 存在，否则报 "There is no minecraft launcher profile"
    fs.writeFileSync(
      path.join(tempInstall, 'launcher_profiles.json'),
      JSON.stringify({
        profiles: { default: { name: 'default', lastVersionId: baseMcVersion, type: 'latestRelease' } },
        selectedProfile: 'default',
        clientToken: `zncl-${Date.now()}`
      }),
      'utf-8'
    )
    onStatus?.(mt('mc.runningInstaller', { loader: loader === 'neoforge' ? 'NeoForge' : 'Forge' }))
    const runResult = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const proc = spawn(java.path, ['-jar', installerPath, '--install-client', tempInstall], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let output = ''
      proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
      proc.stderr.on('data', (d: Buffer) => { output += d.toString() })
      proc.on('error', (e: Error) => resolve({ code: -1, output: e.message }))
      // 超时保护（下载 + 处理，最多 10 分钟）
      const timer = setTimeout(() => { try { proc.kill() } catch {} }, 600000)
      proc.on('close', (code) => { clearTimeout(timer); resolve({ code, output }) })
    })
    if (runResult.code !== 0) {
      console.warn(`[Main] ${loader} 安装程序运行失败:\n${runResult.output}`)
      return { ok: false, error: mt('mc.installerRunFailed', { loader, code: runResult.code }) }
    }
    // 将生成的制品（srg/extra/client jar 等）补全到真实 libraries 目录
    const copied = copyMissingRecursive(path.join(tempInstall, 'libraries'), librariesDir)
    console.log(`[Main] ${loader} 安装程序生成完成，补全 ${copied} 个文件`)
    return { ok: true }
  } finally {
    try { fs.rmSync(tempInstall, { recursive: true, force: true }) } catch {}
  }
}

// 判断是否缺少 installer 生成的制品（仅 NeoForge/Forge 使用）
function needsInstallerArtifacts(
  loader: 'neoforge' | 'forge',
  loaderVersion: string,
  baseMcVersion: string,
  librariesDir: string
): boolean {
  if (hasGeneratedClientSrgJar(librariesDir, baseMcVersion)) return false
  if (loader === 'neoforge') {
    return !fs.existsSync(path.join(librariesDir, 'net', 'neoforged', 'neoforge', loaderVersion, `neoforge-${loaderVersion}-client.jar`))
  }
  return !fs.existsSync(
    path.join(librariesDir, 'net', 'minecraftforge', 'forge', `${baseMcVersion}-${loaderVersion}`, `forge-${baseMcVersion}-${loaderVersion}-client.jar`)
  )
}

// 从 NeoForge/Forge 官方 installer jar 中提取客户端版本信息并安装
// NeoForge: 读 jar 内 version.json（标准 Mojang 版本格式，含 inheritsFrom/mainClass/libraries/arguments）
// Forge: 读 jar 内 install_profile.json 的 versionInfo
async function installInstallerBasedLoader(
  loader: 'neoforge' | 'forge',
  targetDirName: string,
  baseMcVersion: string,
  loaderVersion: string,
  onStatus?: (msg: string) => void
): Promise<{ ok: boolean; error?: string }> {
  const minecraftDir = getMinecraftDir()
  const versionsDir = path.join(minecraftDir, 'versions', targetDirName)
  const versionJsonPath = path.join(versionsDir, `${targetDirName}.json`)
  const librariesDir = path.join(minecraftDir, 'libraries')

  await ensureAutoProbe()

  // profile 提前声明：installer 下载失败时的兜底分支也需要对它赋值
  let profile: any = null

  // 已生成 processors 制品（srg/extra/client jar）则视为安装完成，避免每次启动重复下载安装程序
  // 但仍需确保版本 JSON 已合并（可能之前安装时 JSON 写入失败或被覆盖）
  let skipInstallerDownload = false
  if (!needsInstallerArtifacts(loader, loaderVersion, baseMcVersion, librariesDir)) {
    // 检查当前 JSON 是否已包含 inheritsFrom（合并标志）
    try {
      if (fs.existsSync(versionJsonPath)) {
        const currentJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
        if (currentJson.inheritsFrom) {
          return { ok: true, error: undefined }
        }
      }
    } catch {}
    // JSON 未合并，跳过下载但仍需读取 profile 并执行合并
    skipInstallerDownload = true
    console.log(`[Main] ${loader} 制品已存在但 JSON 未合并，跳过下载直接合并`)
  }

  // 1. 生成 installer jar 下载地址（官方 + 镜像）
  let installerUrls: string[]
  if (loader === 'neoforge') {
    const rel = `net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`
    installerUrls = orderByDownloadSource([
      `https://maven.neoforged.net/releases/${rel}`,
      `https://bmclapi2.bangbang93.com/maven/${rel}`
    ])
  } else {
    const rel = `net/minecraftforge/forge/${baseMcVersion}-${loaderVersion}/forge-${baseMcVersion}-${loaderVersion}-installer.jar`
    installerUrls = orderByDownloadSource([
      `https://maven.minecraftforge.net/${rel}`,
      `https://maven.aliyun.com/repository/public/${rel}`
    ])
  }

  const installerPath = path.join(tmpdir(), `${loader}-${loaderVersion}-${Date.now()}-installer.jar`)
  let installerOk = false
  let lastErr: any = null
  for (const url of installerUrls) {
    try {
      onStatus?.(mt('mc.downloadingInstaller', { loader: loader === 'neoforge' ? 'NeoForge' : 'Forge', version: loaderVersion }))
      await downloadFile(url, installerPath, undefined, undefined, 2)
      if (fs.existsSync(installerPath) && fs.statSync(installerPath).size > 1000) {
        // 必须校验 zip 魔数：镜像未命中时返回的是 HTML 错误页（如 aliyun 404 页），
        // 体积也能过 1000 字节的门槛，会被误判成下载成功并污染后续解析
        let isZip = false
        try {
          const fd = fs.openSync(installerPath, 'r')
          const magic = Buffer.alloc(2)
          try {
            fs.readSync(fd, magic, 0, 2, 0)
          } finally {
            fs.closeSync(fd)
          }
          isZip = magic[0] === 0x50 && magic[1] === 0x4b
        } catch {}
        if (isZip) {
          installerOk = true
          break
        }
        console.warn(`[Main] ${loader} installer 下载内容不是 zip（缺少 PK 魔数），换源重试: ${url}`)
        try { fs.unlinkSync(installerPath) } catch {}
      }
    } catch (e: any) {
      lastErr = e
      console.warn(`[Main] ${loader} installer 下载失败: ${url}`, e?.message || e)
    }
  }
  if (!installerOk) {
    // 制品已存在时，installer 下载失败不致命——可从已安装的库推断 profile
    if (skipInstallerDownload) {
      console.warn(`[Main] ${loader} installer 下载失败但制品已存在，尝试从已有信息构建 profile`)
      // 构建最小 profile 以完成 JSON 合并
      const forgeClientId = `net.minecraftforge:forge:${baseMcVersion}-${loaderVersion}:client`
      const neoforgeClientId = `net.neoforged:neoforge:${loaderVersion}`
      const loaderClientId = loader === 'neoforge' ? neoforgeClientId : forgeClientId
      profile = {
        id: baseMcVersion,
        inheritsFrom: baseMcVersion,
        mainClass: loader === 'neoforge'
          ? 'cpw.mods.bootstraplauncher.BootstrapLauncher'
          : 'cpw.mods.bootstraplauncher.BootstrapLauncher',
        libraries: [
          { name: loaderClientId, url: loader === 'neoforge' ? 'https://maven.neoforged.net/releases/' : 'https://maven.minecraftforge.net/' }
        ]
      }
    } else {
      return { ok: false, error: mt('mc.cannotDownloadInstaller', { loader, err: lastErr?.message || lastErr }) }
    }
  }

  // 2. 从 installer jar 中提取版本信息
  // Forge 有两套 schema：老版本把版本信息放在 install_profile.json 的 versionInfo 里，
  // 现代 Forge（1.13+）改为放在 jar 根目录的 version.json，install_profile.json 里没有 versionInfo。
  // 只读 versionInfo 会让 forge 43.x/47.x 全部拿到 undefined，导致「无法读取版本信息」。
  try {
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(installerPath)
    const readJson = (entryName: string): any => {
      const entry = zip.getEntry(entryName)
      if (!entry) return null
      try {
        return JSON.parse(entry.getData().toString('utf-8'))
      } catch {
        return null
      }
    }

    if (loader === 'neoforge') {
      profile = readJson('version.json')
    } else {
      // 优先用老 schema，缺失则回落到 jar 根目录的 version.json
      const installProfile = readJson('install_profile.json')
      const legacyProfile = installProfile?.versionInfo
      if (legacyProfile && legacyProfile.libraries && legacyProfile.libraries.length > 0) {
        profile = legacyProfile
        console.log(`[Main] forge 版本信息取自 install_profile.json/versionInfo`)
      } else {
        const rootVersion = readJson('version.json')
        if (rootVersion && rootVersion.libraries && rootVersion.libraries.length > 0) {
          profile = rootVersion
          console.log(`[Main] forge 版本信息取自 version.json（id=${rootVersion.id}, inheritsFrom=${rootVersion.inheritsFrom}）`)
        }
      }
    }
  } catch (e: any) {
    console.warn(`[Main] 解析 ${loader} installer 失败:`, e?.message || e)
  }

  if (!profile || !profile.libraries || profile.libraries.length === 0) {
    try { fs.unlinkSync(installerPath) } catch {}
    return { ok: false, error: mt('mc.cannotReadVersionInfo', { loader }) }
  }

  if (!fs.existsSync(librariesDir)) {
    fs.mkdirSync(librariesDir, { recursive: true })
  }

  // 3. 下载加载器相关依赖库（并发加速）— 制品已存在时跳过
  if (!skipInstallerDownload) {
    let downloaded = 0
    const loaderLibs = profile.libraries.filter((lib: any) => isLibAllowed(lib))

    // 预构建下载任务，避免并发时重复迁移目录
    const loaderTasks = loaderLibs.map((lib: any) => {
      const libName = lib.name
      if (!libName) return null
      const libRelPath = lib.downloads?.artifact?.path || mavenCoordsToPath(libName)
      const libPath = path.join(librariesDir, libRelPath)
      const libUrlBases: string[] = []
      if (lib.downloads?.artifact?.url) libUrlBases.push(lib.downloads.artifact.url)
      if (lib.url) libUrlBases.push(`${lib.url.replace(/\/$/, '')}/${libRelPath}`)
      if (loader === 'neoforge') {
        libUrlBases.push(`https://maven.neoforged.net/releases/${libRelPath}`)
      libUrlBases.push(`https://bmclapi2.bangbang93.com/maven/${libRelPath}`)
    } else {
      libUrlBases.push(`https://maven.minecraftforge.net/${libRelPath}`)
      libUrlBases.push(`https://maven.aliyun.com/repository/public/${libRelPath}`)
    }
    return { libName, libPath: libPath, libUrlBases: orderByDownloadSource([...new Set(libUrlBases)]) }
  }).filter((t: any) => t !== null)

  const LOADER_LIB_MAX_CONCURRENT = 8
  let loaderCursor = 0
  const loaderLibWorker = async () => {
    while (loaderCursor < loaderTasks.length) {
      const task = loaderTasks[loaderCursor++]
      if (!task) break

      const { libName, libPath, libUrlBases } = task

      if (fs.existsSync(libPath) && fs.statSync(libPath).size > 0) {
        downloaded++
        continue
      }
      const libDir = path.dirname(libPath)
      if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true })
      }

      let ok = false
      for (const base of libUrlBases) {
        try {
          onStatus?.(mt('mc.downloadingLoaderDep', { loader, name: libName }))
          await downloadFile(base, libPath, undefined, undefined, 2)
          ok = true
          break
        } catch (e: any) {
          console.warn(`[Main] ${loader} 库下载失败: ${base}`, e?.message || e)
        }
      }
      if (ok) {
        downloaded++
      } else {
        console.warn(`[Main] ${loader} 库下载失败(所有源): ${libName}`)
      }
    }
  }
  await Promise.all(Array(Math.min(LOADER_LIB_MAX_CONCURRENT, loaderTasks.length)).fill(null).map(loaderLibWorker))
  }

  // 4. 合并版本 json：inheritsFrom + mainClass + libraries + arguments
  try {
    const vanillaJson = fs.existsSync(versionJsonPath)
      ? JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
      : {}
    // 加载器 libraries 与基础版 libraries 存在重叠（commons-lang3/log4j 等），需按 name 去重，
    // 否则 classpath 出现重复 jar，NeoForge 的 UnionFileSystem 会报 Duplicate key
    const mergedLibs = [...(profile.libraries || []), ...(vanillaJson.libraries || [])]
    const seenLibNames = new Set<string>()
    const dedupedLibs = mergedLibs.filter((lib: any) => {
      const name = lib.name
      if (!name) return true
      if (seenLibNames.has(name)) return false
      seenLibNames.add(name)
      return true
    })
    const mergedJson: any = {
      ...vanillaJson,
      id: baseMcVersion,
      inheritsFrom: profile.inheritsFrom || baseMcVersion,
      mainClass: profile.mainClass || vanillaJson.mainClass || 'cpw.mods.bootstraplauncher.BootstrapLauncher',
      libraries: dedupedLibs
    }
    if (profile.arguments) mergedJson.arguments = profile.arguments
    if (!mergedJson.assetIndex && vanillaJson.assetIndex) mergedJson.assetIndex = vanillaJson.assetIndex
    if (!mergedJson.downloads && vanillaJson.downloads) mergedJson.downloads = vanillaJson.downloads
    fs.writeFileSync(versionJsonPath, JSON.stringify(mergedJson, null, 2), 'utf-8')
    console.log(`[Main] ${loader} 加载器 ${loaderVersion} 已合并到版本 json (inheritsFrom=${mergedJson.inheritsFrom})`)

    // NeoForge/Forge 的 MinecraftGameProvider 也会通过 inheritsFrom 查找基础版本目录
    const baseVersionDir = path.join(minecraftDir, 'versions', baseMcVersion)
    const baseVersionJsonPath = path.join(baseVersionDir, `${baseMcVersion}.json`)
    const baseVersionJarPath = path.join(baseVersionDir, `${baseMcVersion}.jar`)

    if (!fs.existsSync(baseVersionDir)) {
      fs.mkdirSync(baseVersionDir, { recursive: true })
    }

    if (!fs.existsSync(baseVersionJsonPath)) {
      try {
        const baseVanillaJson: any = {
          id: baseMcVersion,
          downloads: vanillaJson.downloads || {},
          assetIndex: vanillaJson.assetIndex || {},
          assets: vanillaJson.assets || '',
          libraries: vanillaJson.libraries || []
        }
        fs.writeFileSync(baseVersionJsonPath, JSON.stringify(baseVanillaJson, null, 2), 'utf-8')
        console.log(`[Main] 已创建基础版本 json: ${baseVersionJsonPath}`)
      } catch (e: any) {
        console.warn(`[Main] 创建基础版本 json 失败:`, e?.message || e)
      }
    }

    // 将客户端 jar 复制到基础版本目录（NeoForge/Forge 通过 inheritsFrom 查找时需要它）
    if (!fs.existsSync(baseVersionJarPath) || fs.statSync(baseVersionJarPath).size < 1024 * 1024) {
      const sourceJarCandidates = [
        path.join(versionsDir, `${targetDirName}.jar`),
        path.join(versionsDir, `${baseMcVersion}.jar`)
      ]
      let sourceJar: string | null = null
      for (const candidate of sourceJarCandidates) {
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).size >= 1024 * 1024) {
            sourceJar = candidate
            break
          }
        } catch {}
      }
      if (sourceJar) {
        try {
          fs.copyFileSync(sourceJar, baseVersionJarPath)
          console.log(`[Main] 已复制客户端 jar 到基础版本目录: ${sourceJar} -> ${baseVersionJarPath}`)
        } catch (e: any) {
          console.warn(`[Main] 复制客户端 jar 失败:`, e?.message || e)
        }
      } else {
        console.warn(`[Main] 未找到客户端 jar，无法复制到基础版本目录`)
      }
    }
  } catch (e: any) {
    console.warn(`[Main] 合并 ${loader} 版本 json 失败:`, e?.message || e)
    try { fs.unlinkSync(installerPath) } catch {}
    return { ok: false, error: mt('mc.mergeVersionJsonFailed', { loader, err: e?.message || e }) }
  }

  // 5. 运行官方安装程序生成 processors 关键制品（net/minecraft/client 的 srg/extra jar 与加载器 client jar）。
  // 这些文件不在任何 maven 镜像上，只能由 installer 生成；缺失时 NeoForge/Forge 客户端启动必然崩溃
  // 只要 installer jar 存在就运行 processors（不跳过）
  if (fs.existsSync(installerPath)) {
    const procResult = await runInstallerProcessors(loader, loaderVersion, baseMcVersion, installerPath, onStatus)
    if (!procResult.ok) {
      console.warn(`[Main] 生成 ${loader} 客户端制品失败:`, procResult.error)
    }
  } else {
    console.warn(`[Main] ${loader} installer jar 不存在，跳过 processors 运行`)
  }

  try { fs.unlinkSync(installerPath) } catch {}
  return { ok: true, error: undefined }
}

// 自适应内存分配：根据系统总内存计算 Xmx/Xms，避免硬编码导致的 OOM 或浪费
// 注意：JVM 内存参数统一输出整数 MB（如 -Xmx2816M），绝不使用 3.5G 这类小数，
// 因为 Java 7 及更早版本无法解析小数内存值，会直接报
// "Invalid initial heap size: -Xms3.5G" 导致游戏无法启动。
function getRecommendedMemory(): { xmx: string; xms: string } {
  const totalMB = Math.floor(totalmem() / (1024 ** 2))
  // 最多用系统内存的 40%，上限 4G，下限 512M
  let maxMB = Math.floor(totalMB * 0.4)
  maxMB = Math.min(maxMB, 4096)
  maxMB = Math.max(maxMB, 512)
  // 初始堆 = 最大堆的一半，至少 256M
  let minMB = Math.floor(maxMB / 2)
  minMB = Math.max(minMB, 256)
  // 确保 Xms <= Xmx
  minMB = Math.min(minMB, maxMB)
  console.log(`[Main] 系统内存: ${(totalMB / 1024).toFixed(1)}GB, 分配: Xmx=${maxMB}M, Xms=${minMB}M`)
  return { xmx: `${maxMB}M`, xms: `${minMB}M` }
}

// 把任意 JVM 内存值（3.5G / 4g / 512M / 2048）规范化为整数 MB，无法解析时返回 null
function normalizeMemArgValue(raw: string): number | null {
  const matched = raw.trim().match(/^([0-9]*\.?[0-9]+)([kmgt]?)$/i)
  if (!matched) return null
  const num = parseFloat(matched[1])
  if (!isFinite(num) || num <= 0) return null
  const unit = (matched[2] || 'm').toLowerCase()
  const multiplier = unit === 'k' ? 1 / 1024 : unit === 'g' ? 1024 : unit === 't' ? 1024 * 1024 : 1
  let mb = Math.floor(num * multiplier)
  if (mb < 16) mb = 16
  return mb
}

// Windows 原生退出码 → 人类可读说明。
// 游戏以 0xC0000005 这类 NTSTATUS 退出时，多数不是 Java 异常（没有 hs_err），
// 而是 JVM/显卡驱动/LWJGL 在原生代码里出错，给用户一个可操作的提示。
// 解析（退出码 → locale key）在 src/shared/game-log.ts，这里只负责翻译。
function describeNativeExitCode(code: number | null): string | null {
  const hintKey = nativeExitCodeHintKey(code)
  return hintKey ? mt(hintKey) : null
}

// 规范化所有 -Xmx / -Xms 参数：去掉小数、限制在安全范围内、保证 Xms <= Xmx。
// 启动器和用户自定义 JVM 参数都会经过这里，杜绝 "Invalid initial heap size" 类启动失败。
function sanitizeJvmMemoryArgs(args: string[]): string[] {
  let xmxMB: number | null = null
  let xmsMB: number | null = null
  const invalidArgs = new Set<string>()
  for (const arg of args) {
    if (/^-Xmx/i.test(arg)) {
      const value = normalizeMemArgValue(arg.slice(4))
      if (value === null) invalidArgs.add(arg)
      else xmxMB = value
    } else if (/^-Xms/i.test(arg)) {
      const value = normalizeMemArgValue(arg.slice(4))
      if (value === null) invalidArgs.add(arg)
      else xmsMB = value
    }
  }

  // 无法解析的内存参数直接丢弃，否则 JVM 会因非法值拒绝启动
  const keptArgs = args.filter(arg => !invalidArgs.has(arg))
  if (invalidArgs.size > 0) {
    console.warn(`[Main] 丢弃无法解析的 JVM 内存参数: ${Array.from(invalidArgs).join(', ')}`)
  }
  if (xmxMB === null && xmsMB === null) return keptArgs

  const totalMB = Math.floor(totalmem() / (1024 ** 2))
  const capMB = Math.max(512, Math.min(4096, Math.floor(totalMB * 0.4)))

  if (xmxMB === null) xmxMB = xmsMB!
  if (xmsMB === null) xmsMB = Math.max(256, Math.floor(xmxMB / 2))

  xmxMB = Math.max(512, Math.min(xmxMB, capMB))
  xmsMB = Math.max(256, Math.min(xmsMB, Math.floor(xmxMB / 2), xmxMB))

  return keptArgs.map(arg => {
    if (/^-Xmx/i.test(arg)) return `-Xmx${xmxMB}M`
    if (/^-Xms/i.test(arg)) return `-Xms${xmsMB}M`
    return arg
  })
}

// 生成离线账号的UUID（Minecraft 标准离线 UUID 算法）
function generateOfflineUUID(username: string): string {
  // Minecraft 离线 UUID 使用 "OfflinePlayer:" + 用户名 作为输入
  const input = 'OfflinePlayer:' + username
  const hash = createHash('md5').update(input, 'utf8').digest()
  // UUID v3: 设置 version 和 variant 位
  hash[6] = (hash[6] & 0x0f) | 0x30  // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80  // IETF variant
  const hex = hash.toString('hex')
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`
}

// 启动游戏（支持自定义目录名）
ipcMain.handle('launch-game', async (event, versionId: string, username?: string, directoryName?: string, settings?: { javaPath?: string; customJavaArgs?: string; skipJavaCheck?: boolean; autoDownloadJava?: boolean }) => {
  try {
    const targetDirName = directoryName || versionId
    // 设置里的「允许使用不推荐的 Java 版本」。原先这个开关在 stores/locales/UI 里都存在，
    // 但整个 src 没有任何一处读它 —— 勾了也没用。这里把它接进来。
    const allowNewerJava = settings?.skipJavaCheck === true
    // 找不到合适 Java 时是否自动下载。默认开启（保持原有行为），用户可在设置里关掉。
    const allowAutoDownloadJava = settings?.autoDownloadJava !== false
    console.log(`[Main] 启动游戏版本: ${versionId}, 目录: ${targetDirName}, 用户名: ${username || '默认Player'}, 允许不推荐Java版本: ${allowNewerJava}, 自动下载Java: ${allowAutoDownloadJava}`)

    // 检测是否为远古版
    // 仅匹配 a1.0.0 / b1.8 等真正的 alpha/beta 格式，避免误匹配 snapshot
    const isLegacy = /^[ab]\d+\./.test(versionId) ||
                     /^(inf-|c\.|rd-)/.test(versionId) ||
                     parseFloat(versionId) < 1.0

    // 检测 Minecraft 版本以确定 Java 需求
    // 整合包：从 modrinth.index.json 读取真实 MC 版本，避免把目录名误当版本号
    let javaBaseVersion = versionId
    const targetVersionsDir = path.join(getMinecraftDir(), 'versions', targetDirName)
    if (fs.existsSync(path.join(targetVersionsDir, 'modrinth.index.json'))) {
      const resolvedMc = resolveBaseMcVersion(versionId, targetDirName)
      if (resolvedMc && resolvedMc !== versionId) {
        javaBaseVersion = resolvedMc
      }
    }
    const javaNeed = requiredJavaForMcVersion(javaBaseVersion)
    let requiredJavaVersion = 17
    let javaType: 'legacy' | 'modern' | 'latest' = 'modern'

    if (isLegacy) {
      javaType = 'legacy'
      requiredJavaVersion = 8
    } else if (javaNeed) {
      javaType = javaNeed.type
      requiredJavaVersion = javaNeed.version
    }

    console.log(`[Main] 是否为远古版: ${isLegacy}, 需要的 Java 版本: ${requiredJavaVersion}`)
    console.log(`[Main] Java 类型: ${javaType}`)

    // ---- 启动日志：预检测 / 账号 / Java 需求 ----
    launchLog(`预检测已通过：版本 ${versionId}（目录 ${targetDirName}）`)
    launchLog(`账号：${username && username.trim() ? username.trim() : 'Player'}（离线模式）`)
    launchLog(`需要的 Java 版本：${requiredJavaVersion <= 8 ? '8' : '≥ ' + requiredJavaVersion}`)

    // 优先使用用户在设置中配置的 Java 路径
    let javaPath = ''
    let detectedVersion = 0
    let javaCandidate = null

    if (settings?.javaPath) {
      console.log(`[Main] 使用用户配置的 Java: ${settings.javaPath}`)
      const userVersion = await detectJavaVersion(settings.javaPath)
      if (userVersion !== null) {
        detectedVersion = userVersion
        javaPath = settings.javaPath
        console.log(`[Main] 用户配置的 Java 版本: ${detectedVersion}`)
        if (detectedVersion < requiredJavaVersion) {
          console.warn(`[Main] 用户配置的 Java ${detectedVersion} 版本过低，需要 ${requiredJavaVersion}，尝试自动匹配...`)
          javaPath = ''  // 版本不兼容，回退到自动匹配
          detectedVersion = 0
        }
      } else {
        console.warn(`[Main] 无法检测用户配置的 Java 版本: ${settings.javaPath}，尝试自动匹配...`)
      }
    }

    // 用户未配置或配置的 Java 不兼容时，自动扫描匹配
    if (!javaPath) {
      javaCandidate = await findJava(javaType, requiredJavaVersion, false, allowNewerJava)

      // 如果没有找到合适的Java，自动下载
      if (!javaCandidate && allowAutoDownloadJava) {
        console.log('[Main] 未找到合适的 Java，开始自动下载...')

        // 根据所需版本下载合适的Java
        let javaToDownload = '21'
        if (requiredJavaVersion >= 25) {
          javaToDownload = '25'
        } else if (requiredJavaVersion >= 21) {
          javaToDownload = '21'
        } else if (requiredJavaVersion >= 17) {
          javaToDownload = '17'
        } else {
          javaToDownload = '8'
        }

        try {
          const downloadResult = await downloadJavaInternal(javaToDownload, event)
          if (downloadResult.success) {
            invalidateJavaCache()
            javaCandidate = await findJava(javaType, requiredJavaVersion, true, allowNewerJava)
            if (javaCandidate) {
              console.log(`[Main] Java ${javaToDownload} 下载成功，使用: ${javaCandidate.path}`)
            pushJavaDownloadLog(javaToDownload, mt('mc.autoDownloadSuccess', { path: javaCandidate.path }), event)
            }
          } else {
            console.error('[Main] 自动下载Java失败:', downloadResult.error)
            pushJavaDownloadLog(javaToDownload, mt('mc.autoDownloadFailed', { err: downloadResult.error }), event)
          }
        } catch (e: any) {
          console.error('[Main] 自动下载Java失败:', e)
          pushJavaDownloadLog(javaToDownload, mt('mc.autoDownloadFailed', { err: e.message || String(e) }), event)
        }
      }

      if (javaCandidate) {
        javaPath = javaCandidate.path
        detectedVersion = javaCandidate.version
      }
    }

    // 如果仍然没有Java，返回错误
    if (!javaPath) {
      return {
        success: false,
        error: allowAutoDownloadJava
          ? mt('mc.javaNotFoundAutoDownloaded', { version: versionId, required: requiredJavaVersion })
          : mt('mc.javaNotFoundAutoDownloadOff', { version: versionId, required: requiredJavaVersion })
      }
    }

    // 版本兼容性检查（版本号来自缓存检测，无需再次 spawn java -version）
    if (detectedVersion < requiredJavaVersion) {
      return {
        success: false,
        error: mt('mc.javaIncompatible', { current: detectedVersion, version: versionId, required: requiredJavaVersion })
      }
    }

    // 如果 Java 版本比官方推荐更“新”（22/23/25 等），尝试换到更兼容的版本：
    // Minecraft 1.21.x 官方推荐 Java 21，很多 mod 会硬性要求 21，用 23 会被误判为不兼容。
    // 注意：需要 Java 25 的版本不降级；用户勾选「允许使用不推荐的 Java 版本」时也不降级。
    let javaExecutable = javaPath
    if (!allowNewerJava && requiredJavaVersion <= OFFICIAL_JAVA && detectedVersion > OFFICIAL_JAVA) {
      console.warn(`[Main] 警告: Java ${detectedVersion} 可能不与 Minecraft ${javaBaseVersion} 完全兼容（部分 mod 会报「需要 Java ${requiredJavaVersion}」），尝试寻找更兼容的版本...`)

      // 目标版本：优先官方推荐的 Java 21
      const wantVersion = requiredJavaVersion >= 21 ? '21' : requiredJavaVersion >= 17 ? '17' : '8'
      // 用统一的 Java 扫描器查找：它会优先选择官方推荐的 Java 21，
      // 也能识别自动下载到 java/jdk-21/<实际版本目录>/ 的 JDK（旧逻辑写死目录名，找不到就误用 23）
      const pickCompatible = async (force: boolean): Promise<JavaCandidate | null> => {
        const found = await findJava(javaType, requiredJavaVersion, force, false)
        return found && found.version >= requiredJavaVersion && found.version < detectedVersion ? found : null
      }

      let compat = await pickCompatible(false)

      // 没有现成的更兼容版本 → 自动下载所需版本（用户开启自动下载时）
      if (!compat && allowAutoDownloadJava) {
        console.log(`[Main] 未找到更兼容的 Java，自动下载 Java ${wantVersion}...`)
        try {
          const dl = await downloadJavaInternal(wantVersion, event)
          if (dl.success) {
            invalidateJavaCache()
            compat = await pickCompatible(true)
          } else {
            console.warn(`[Main] 自动下载 Java ${wantVersion} 失败: ${dl.error}`)
          }
        } catch (e: any) {
          console.warn(`[Main] 自动下载 Java ${wantVersion} 失败:`, e?.message || e)
        }
      }

      if (compat) {
        detectedVersion = compat.version
        javaExecutable = compat.path
        console.log(`[Main] 找到更兼容的 Java ${compat.version}，切换到: ${compat.path}`)
      } else {
        console.warn(`[Main] 未找到更兼容的 Java（建议 Java ${requiredJavaVersion}），将继续使用 Java ${detectedVersion}，游戏可能无法正常启动。请到设置 → Java 页面下载 Java ${requiredJavaVersion}。`)
      }
    }

    console.log(`[Main] 使用 Java: ${javaExecutable} (版本 ${detectedVersion})`)
    launchLog(`选中的 Java：Java ${detectedVersion || '（版本未知）'} → ${javaExecutable}`)

    // ========== 准备游戏路径和文件 ==========
    const minecraftDir = getMinecraftDir()
    const versionsDir = path.join(minecraftDir, 'versions', targetDirName)

    // 检查版本目录是否存在
    if (!fs.existsSync(versionsDir)) {
      return {
        success: false,
        error: mt('mc.versionNotInstalled', { version: targetDirName })
      }
    }

    // 查找版本核心 jar 文件（client.jar，包含游戏主类）
    const jarFile = path.join(versionsDir, `${targetDirName}.jar`)
    // 若为整合包且版本 json 尚未合并加载器（无 inheritsFrom），也需要补全加载器与 mod 文件
    const launchVersionJsonPath = path.join(versionsDir, `${targetDirName}.json`)
    let launchVersionJsonData: any = null
    if (fs.existsSync(launchVersionJsonPath)) {
      try { launchVersionJsonData = JSON.parse(fs.readFileSync(launchVersionJsonPath, 'utf-8')) } catch {}
    }
    const launchLoaderInfo = resolveModpackLoader(targetDirName)
    const isFabricLikeLoader = launchLoaderInfo && (launchLoaderInfo.loader === 'fabric-loader' || launchLoaderInfo.loader === 'quilt-loader')
    const isInstallerBasedLoader = launchLoaderInfo && (launchLoaderInfo.loader === 'neoforge' || launchLoaderInfo.loader === 'forge')
    const needsFabricMerge = isFabricLikeLoader && (!launchVersionJsonData || !launchVersionJsonData.inheritsFrom)
    const needsLoaderMerge = isInstallerBasedLoader && (!launchVersionJsonData || !launchVersionJsonData.inheritsFrom)
    const needsAnyLoaderMerge = needsFabricMerge || needsLoaderMerge
    if (!fs.existsSync(jarFile) || fs.statSync(jarFile).size < 50 * 1024 || needsAnyLoaderMerge) {
      // 国内发行版：不代用户获取本体/加载器，直接给出导入指引
      if (!__ENABLE_MC_DOWNLOAD__) {
        return {
          success: false,
          error: mt('mc.downloadDisabledMissing', { path: jarFile })
        }
      }
      console.log(`[Main] 缺少游戏文件或加载器未安装，尝试自动补齐: ${targetDirName}`)
      event.sender.send('game-launch-status', { versionId: targetDirName, message: mt('mc.missingGameFilesFilling') })
      const ensureResult = await ensureBaseGameFiles(versionId, targetDirName, (msg) => {
        event.sender.send('game-launch-status', { versionId: targetDirName, message: msg })
      })
      if (!ensureResult.ok) {
        return {
          success: false,
          error: ensureResult.error || mt('mc.gameFileNotFound', { path: jarFile })
        }
      }
      console.log(`[Main] 基础游戏文件下载完成，继续启动`)
    }

    // 整合包：每次启动都检查 modrinth.index.json 中的文件是否完整，缺失则补齐
    // （之前下载失败的 mod 会在下次启动时自动重试）
    if (launchLoaderInfo && fs.existsSync(path.join(versionsDir, 'modrinth.index.json'))) {
      console.log(`[Main] 检查整合包文件完整性: ${targetDirName}`)
      event.sender.send('game-launch-status', { versionId: targetDirName, message: mt('mc.checkingModpackIntegrity') })
      try {
        const completenessResult = await downloadModpackFiles(versionsDir, (done, total, name, speed, bytesDone, bytesTotal, threads) => {
          const speedStr = speed > 0 ? ` ${formatSpeed(speed)}` : ''
          const pctStr = bytesTotal > 0 ? ` (${Math.round(bytesDone / bytesTotal * 100)}%)` : ''
          event.sender.send('game-launch-status', { versionId: targetDirName, message: mt('mc.downloadingModpackFiles', { done, total, pct: pctStr, speed: speedStr, threads, name }) })
        })
        if (!completenessResult.ok) {
          console.warn(`[Main] 整合包仍有文件未下载完成: 成功 ${completenessResult.downloaded}，失败 ${completenessResult.failed}，将启动时重试`)
        } else if (completenessResult.downloaded > 0) {
          console.log(`[Main] 整合包文件补全完成: 下载 ${completenessResult.downloaded}，复用 ${completenessResult.skipped}`)
        }
      } catch (e: any) {
        console.warn(`[Main] 整合包文件完整性检查异常:`, e?.message || e)
      }
    }

    // 读取版本 json 配置文件，包含主类名、依赖库列表等信息
    const versionJsonPath = path.join(versionsDir, `${targetDirName}.json`)
    let mainClass = 'net.minecraft.client.main.Main' // 默认主类
    let classpath = jarFile // classpath 初始只包含 client.jar
    const libPaths: string[] = [] // 存储所有依赖库的路径
    let versionJson: any = null

    if (fs.existsSync(versionJsonPath)) {
      try {
        versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))

        // 从版本 json 中获取主类名（不同版本主类可能不同）
        if (versionJson.mainClass) {
          mainClass = versionJson.mainClass
        }

        // 启动前补齐缺失库文件（含加载器模块路径 -p 引用的库），
        // 否则会报 Unknown module / ClassNotFoundException: BootstrapLauncher
        // 国内发行版跳过：不代用户拉取本体库文件
        if (__ENABLE_MC_DOWNLOAD__) try {
          const libRepair = await ensureVersionLibraries(versionJson, (msg) => {
            event.sender.send('game-launch-status', { versionId: targetDirName, message: msg })
          })
          if (libRepair.downloaded > 0) {
            console.log(`[Main] 启动前库文件补全完成: 成功 ${libRepair.downloaded}，失败 ${libRepair.failed}`)
          }
          if (libRepair.failed > 0) {
            console.warn(`[Main] 启动前仍有 ${libRepair.failed} 个库文件补全失败`)
          }
        } catch (repairErr: any) {
          console.warn('[Main] 启动前库文件校验异常:', repairErr?.message || repairErr)
        }

        // ========== 构建 Classpath（类路径）==========
        // Java 运行时需要从 classpath 中查找所有依赖的 .class 文件
        // classpath 格式：多个 jar 文件路径用分号(;)分隔（Windows）
        const librariesDir = path.join(minecraftDir, 'libraries')

        if (versionJson.libraries) {
          const seenClasspathJars = new Set<string>()
          for (const lib of versionJson.libraries) {
            // 检查库是否允许在当前操作系统/架构下加载（规则过滤）
            if (!isLibAllowed(lib)) continue

            // 添加普通依赖库（.jar 文件）
            if (lib.downloads && lib.downloads.artifact) {
              const libPath = path.join(librariesDir, lib.downloads.artifact.path)
              if (fs.existsSync(libPath)) {
                // 同一 jar 只加入一次，避免 classpath 重复导致 NeoForge UnionFileSystem 报 Duplicate key
                if (!seenClasspathJars.has(libPath)) {
                  libPaths.push(libPath)
                  seenClasspathJars.add(libPath)
                }
              }
            }

            // 添加 natives 原生库（Windows 下是 .dll，Linux 是 .so，macOS 是 .dylib）
            if (lib.natives && lib.downloads && lib.downloads.classifiers) {
              // natives 键形如：windows / windows-64 / osx / linux
              const nativesKey = lib.natives
              const nativeKey = nativesKey[CURRENT_OS_NAME]
                || nativesKey[`${CURRENT_OS_NAME}-64`]
                || nativesKey[`${CURRENT_OS_NAME}-32`]
                || (CURRENT_OS_NAME === 'osx' ? (nativesKey.mac || nativesKey['mac-64'] || nativesKey['mac-32']) : null)
              if (nativeKey) {
                // 替换 ${arch} 占位符为 32 或 64
                const arch = process.arch === 'x64' ? '64' : '32'
                const nativeClassifier = nativeKey.replace('${arch}', arch)

                const nativeArtifact = lib.downloads.classifiers[nativeClassifier]
                if (nativeArtifact) {
                  const nativePath = path.join(librariesDir, nativeArtifact.path)
                  if (fs.existsSync(nativePath)) {
                    libPaths.push(nativePath)
                    console.log(`[Main] 加载 native 库: ${nativePath}`)
                  }
                }
              }
            }
          }
        }

        // 将所有依赖库和 client.jar 用分号连接成完整的 classpath
        if (libPaths.length > 0) {
          classpath = libPaths.join(path.delimiter) + path.delimiter + jarFile
          console.log(`[Main] 加载了 ${libPaths.length} 个库文件`)
        }
      } catch (e) {
        console.log('[Main] 无法解析版本 json:', e)
      }
    }

    // ========== 获取 AssetIndex（资源索引）ID ==========
    // 资源索引决定了游戏资源（音效、纹理、语言文件等）的版本
    let assetIndex = versionId.split('.').slice(0, 2).join('.')
    if (versionJson?.assetIndex?.id) {
      assetIndex = versionJson.assetIndex.id
    }

    console.log(`[Main] 主类: ${mainClass}`)
    console.log(`[Main] AssetIndex: ${assetIndex}`)
    console.log(`[Main] Classpath: ${classpath.substring(0, 200)}...`)
    console.log(`[Main] Java路径: ${javaPath}`)

    // ========== 检查 Natives（原生库）目录 ==========
    // Natives 目录包含解压后的 .dll 文件（LWJGL 等图形/音频库需要）
    const nativesDir = path.join(versionsDir, `${targetDirName}-natives`)
    let nativesPath = ''
    if (fs.existsSync(nativesDir)) {
      console.log(`[Main] Natives 目录: ${nativesDir}`)
      // 统计目录下的原生库文件数量
      const nativeFiles = fs.readdirSync(nativesDir).filter(f => f.endsWith('.dll') || f.endsWith('.so') || f.endsWith('.dylib'))
      console.log(`[Main] 找到 ${nativeFiles.length} 个 native 文件`)
      nativesPath = nativesDir
    }

    // ========== 构建 JVM 启动参数 ==========
    let jvmArgs: string[]
    // 统计加载器（版本 JSON）注入的参数条数，供启动日志展示
    let loaderJvmCount = 0
    let loaderGameCount = 0

    if (isLegacy) {
      // ========== 远古版（a1.0/b1.8/inf-等）启动参数 ==========
      jvmArgs = [
        '-Xmx1G',
        '-Xms512M',
        '-Dfile.encoding=UTF-8',
        // JDK 18+（JEP 400）后 stdout/stderr 默认用控制台原生编码（中文 Windows 是 GBK），
        // 启动器按 UTF-8 解码游戏日志会变乱码，这里强制 UTF-8（低版本 JDK 忽略该属性，无副作用）
        '-Dstdout.encoding=UTF-8',
        '-Dstderr.encoding=UTF-8',
        '-Dsun.java2d.noddraw=true',
        '-Dsun.java2d.d3d=false',
        '-Dsun.java2d.opengl=false',
        '-Dsun.java2d.pmoffscreen=false',
        mainClass
      ]
    } else {
      // ========== 现代版（1.0+ 及正式版）启动参数 ==========
      // 根据系统内存自适应分配，避免硬编码 4G 在小内存机器上 OOM / 大内存机器上不够用
      const { xmx, xms } = getRecommendedMemory()
      console.log(`[Main] 自适应内存: Xmx=${xmx}, Xms=${xms}`)

      jvmArgs = [
        // 内存分配：按系统总内存计算
        `-Xmx${xmx}`,
        `-Xms${xms}`,
        // G1GC 垃圾回收器优化参数
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+UseG1GC',
        '-XX:+ParallelRefProcEnabled',
        '-XX:MaxGCPauseMillis=200',
        '-XX:+DisableExplicitGC',
        '-XX:G1NewSizePercent=30',
        '-XX:G1MaxNewSizePercent=40',
        '-XX:G1HeapRegionSize=8M',
        '-XX:G1ReservePercent=20',
        '-XX:G1HeapWastePercent=5',
        // 代码缓存增大，减少大型整合包下的 JIT 抖动
        '-XX:ReservedCodeCacheSize=256M',
        // UTF-8 编码，防止中文乱码
        '-Dfile.encoding=UTF-8',
        // JDK 18+（JEP 400）后 stdout/stderr 默认按控制台原生编码（中文 Windows = GBK）输出，
        // 而启动器按 UTF-8 解码，游戏日志里的中文会变乱码；强制输出 UTF-8。
        // （低版本 JDK 只是多一个用不到的系统属性，无副作用）
        '-Dstdout.encoding=UTF-8',
        '-Dstderr.encoding=UTF-8',
        // Java 9+ 模块系统开放参数（必须，否则会报 InaccessibleObjectException）
        '--add-opens=java.base/java.io=ALL-UNNAMED',
        '--add-opens=java.base/java.lang=ALL-UNNAMED',
        '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
        '--add-opens=java.base/java.util=ALL-UNNAMED',
        '--add-opens=java.base/jdk.internal.misc=ALL-UNNAMED',
        '--add-opens=java.base/sun.nio.ch=ALL-UNNAMED',
        '--add-opens=java.base/java.nio=ALL-UNNAMED',
        '--add-opens=java.base/sun.security.ssl=ALL-UNNAMED',
        '--add-opens=java.base/java.lang.invoke=ALL-UNNAMED',
        '--add-opens=java.base/java.net=ALL-UNNAMED',
        '--add-opens=java.base/sun.security.x509=ALL-UNNAMED'
      ]

      // 添加 natives 动态链接库路径（.dll/.so 文件）
      if (nativesPath) {
        jvmArgs.push(`-Djava.library.path=${nativesPath}`)
      }

      // 使用离线账号或默认用户名
      const gameUsername = username && username.trim() ? username.trim() : 'Player'
      const offlineUUID = generateOfflineUUID(gameUsername)

      // 版本隔离：每个版本有独立的游戏目录存放 saves/mods/config 等
      const gameDir = path.join(minecraftDir, 'versions', targetDirName)
      if (!fs.existsSync(gameDir)) {
        fs.mkdirSync(gameDir, { recursive: true })
      }

      // 在版本目录下创建 assets 目录联接（junction），指向公共 assets 目录，避免重复占用空间
      const sharedAssetsDir = path.join(minecraftDir, 'assets')
      const gameAssetsDir = path.join(gameDir, 'assets')
      try {
        if (!fs.existsSync(gameAssetsDir)) {
          if (process.platform === 'win32') {
            fs.symlinkSync(sharedAssetsDir, gameAssetsDir, 'junction')
          } else {
            fs.symlinkSync(sharedAssetsDir, gameAssetsDir, 'dir')
          }
          console.log(`[Main] 创建 assets 符号链接: ${gameAssetsDir} -> ${sharedAssetsDir}`)
        }
      } catch (symlinkErr: any) {
        console.warn(`[Main] 创建 assets 符号链接失败:`, symlinkErr?.message || symlinkErr)
      }

      // 现代版本（1.13+ / 快照 / Forge / NeoForge / Fabric）的版本 JSON 都在 arguments.jvm 中
      // 声明了启动所需的关键参数——尤其是新快照的原生库加载参数：
      //   --enable-native-access=ALL-UNNAMED
      //   -XX:StackShadowPages=32           ← JIT/原生代码调用时的栈保护页
      //   -Djava.library.path=${natives_directory}/java
      //   -Djna.tmpdir / -Dorg.lwjgl.system.SharedLibraryExtractPath / -Dio.netty.native.workdir
      // 此前这些仅在「安装器型加载器(Forge/NeoForge)」时才注入，导致**原版快照缺失原生参数**：
      // LWJGL/Vulkan 在默认栈保护页下调用驱动原生代码时踩内存，进程以 0xC0000005 崩溃
      // （Windows 事件日志中崩溃模块为 jvm.dll，游戏日志仍会打印
      //  “Use --enable-native-access=ALL-UNNAMED” 的缺失警告）。
      // 现在对**所有带 arguments 的版本**统一注入 arguments.jvm；加载器额外注入 arguments.game。
      const loaderJvmArgs: string[] = []
      const loaderGameArgs: string[] = []
      if (versionJson?.arguments) {
        const librariesDirArg = path.join(minecraftDir, 'libraries')
        // natives_directory：供 LWJGL/JNA/Netty 抽取原生库；缺失时按版本目录创建
        let nativeDirArg = nativesPath
        if (!nativeDirArg) {
          nativeDirArg = path.join(versionsDir, `${targetDirName}-natives`)
          try {
            if (!fs.existsSync(nativeDirArg)) fs.mkdirSync(nativeDirArg, { recursive: true })
          } catch {}
        }
        const subPlaceholder = (s: string) => s
          .replace(/\$\{library_directory\}/g, librariesDirArg)
          .replace(/\$\{classpath_separator\}/g, path.delimiter)
          .replace(/\$\{classpath\}/g, classpath)
          .replace(/\$\{version_name\}/g, targetDirName)
          .replace(/\$\{launcher_name\}/g, 'ZNCraftLauncher')
          .replace(/\$\{launcher_version\}/g, app.getVersion())
          .replace(/\$\{natives_directory\}/g, nativeDirArg)
          .replace(/\$\{game_directory\}/g, gameDir)
          .replace(/\$\{assets_root\}/g, sharedAssetsDir)
          .replace(/\$\{assets_index_name\}/g, assetIndex)
          .replace(/\$\{auth_player_name\}/g, gameUsername)
          .replace(/\$\{auth_uuid\}/g, offlineUUID)
          .replace(/\$\{auth_access_token\}/g, '0')
          .replace(/\$\{auth_session\}/g, '0')
          .replace(/\$\{user_type\}/g, 'mojang')
          .replace(/\$\{version_type\}/g, 'ZNCraftLauncher')
          .replace(/\$\{clientid\}/g, '')
          .replace(/\$\{auth_xuid\}/g, '')

        const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'
        // 展开版本 JSON 参数条目（字符串 / 带 rules 的对象）。
        // 规则：仅当 action=allow 且 os 平台匹配时注入；features 类规则一律跳过（离线启动不启用任何 feature）。
        const expandEntries = (entries: any[]): string[] => {
          const out: string[] = []
          for (const entry of entries) {
            if (typeof entry === 'string') {
              out.push(subPlaceholder(entry))
              continue
            }
            if (entry && typeof entry === 'object' && Array.isArray(entry.rules)) {
              const matched = entry.rules.some((r: any) => {
                if (!r || r.action !== 'allow') return false
                if (r.os && r.os.name && r.os.name !== osName) return false
                if (r.features) return false
                return true
              })
              if (!matched) continue
              const vals = Array.isArray(entry.value) ? entry.value : [entry.value]
              for (const v of vals) if (typeof v === 'string') out.push(subPlaceholder(v))
            }
          }
          return out
        }
        // 过滤 JSON 中的 -cp / -classpath 及其值：classpath 由启动器统一注入，
        // 否则 JSON 里的字面量 ${classpath} 会覆盖掉我们构建好的 classpath
        const stripClasspath = (args: string[]): string[] => {
          const result: string[] = []
          for (let i = 0; i < args.length; i++) {
            if (args[i] === '-cp' || args[i] === '-classpath') { i++; continue }
            result.push(args[i])
          }
          return result
        }

        if (Array.isArray(versionJson.arguments.jvm)) {
          loaderJvmArgs.push(...stripClasspath(expandEntries(versionJson.arguments.jvm)))
        }
        if (isInstallerBasedLoader && Array.isArray(versionJson.arguments.game)) {
          // 加载器（Forge/NeoForge）的 arguments.game 含 --launchTarget / --fml.* 等必需参数
          loaderGameArgs.push(...expandEntries(versionJson.arguments.game))
        }
        console.log(`[Main] ${launchLoaderInfo?.loader || 'vanilla'} 注入 JVM 参数 ${loaderJvmArgs.length} 条, 游戏参数 ${loaderGameArgs.length} 条`)
        loaderJvmCount = loaderJvmArgs.length
        loaderGameCount = loaderGameArgs.length
      }

      // 添加 Minecraft 游戏主类及命令行参数
      jvmArgs.push(
        ...loaderJvmArgs,
        mainClass,
        '--username', gameUsername,
        '--version', versionId,
        '--gameDir', gameDir,
        '--assetsDir', gameAssetsDir,
        '--assetIndex', assetIndex,
        '--uuid', offlineUUID,
        '--accessToken', '0',
        '--userType', 'mojang',
        '--versionType', 'ZNCraftLauncher',
        ...loaderGameArgs
      )

      // Fabric/Quilt 加载器需要 --gameVersion 才能确定 MC 版本（否则报 "未找到 Minecraft 版本"）
      // NeoForge/Forge 使用 arguments.game 中的 --launchTarget/--fml.* 参数，不传 --gameVersion
      if (isFabricLikeLoader && versionJson?.inheritsFrom) {
        jvmArgs.push('--gameVersion', versionJson.inheritsFrom)
      }
    }

    // 注入用户自定义 JVM 参数（来自设置面板的「自定义 JVM 参数」输入框）
    if (settings?.customJavaArgs) {
      const customArgs = settings.customJavaArgs.split(/\s+/).filter(Boolean)
      if (customArgs.length > 0) {
        console.log(`[Main] 注入自定义 JVM 参数: ${customArgs.length} 条`)
        jvmArgs.push(...customArgs)
      }
    }

    // 若用户在设置里开启了「游戏也走代理」，注入 JVM 代理系统属性
    // （仅影响 Java 标准网络栈：Mojang 账号/皮肤/Realms 等 API 调用；
    //   游戏与服务器之间的 Netty 原始 socket 不受影响）
    const gameProxyArgs = gameProxyJvmArgs()
    if (gameProxyArgs.length > 0) {
      jvmArgs.push(...gameProxyArgs)
    }

    // ========== 使用 @argfile 方式解决 Windows 命令行长度限制问题 ==========
    // Windows cmd.exe 命令行最大长度为 8191 字符，现代 Minecraft 有 70+ 个库，
    // classpath 总长度可达 8000+ 字符，直接通过命令行传递会被截断导致 ClassNotFoundException。
    // Java 9+ 支持 @filename 语法：从文件中读取参数，每行一个参数，完全绕过命令行长度限制。
    // 这是 HMCL/PCL/BAKAXL 等所有主流启动器的标准做法。

    // 最终兜底：客户端 jar 必须存在，否则启动必然报 "Could not find main class"
    // （如 json 存在但 jar 缺失/过小、下载被跳过等中间状态）。缺失时自动补齐一次
    if (!fs.existsSync(jarFile) || fs.statSync(jarFile).size < 1024 * 1024) {
      if (!__ENABLE_MC_DOWNLOAD__) {
        // 国内发行版：不提供本体获取渠道，只引导用户自行导入
        return {
          success: false,
          error: mt('mc.downloadDisabledMissing', { path: jarFile })
        }
      }
      console.log(`[Main] 客户端 jar 缺失/过小，启动前自动补齐: ${jarFile}`)
      const ensureResult = await ensureBaseGameFiles(versionId, targetDirName, (msg) => {
        event.sender.send('game-launch-status', { versionId: targetDirName, message: msg })
      })
      if (!ensureResult.ok || !fs.existsSync(jarFile) || fs.statSync(jarFile).size < 1024 * 1024) {
        return {
          success: false,
          error: mt('mc.clientJarMissing', { path: jarFile })
        }
      }
    }

    // 规范化内存参数（去掉小数、限制上限、保证 Xms <= Xmx）
    // 必须在写入 argfile 之前执行，否则 -Xms3.5G 这类参数会让 JVM 直接拒绝启动
    jvmArgs = sanitizeJvmMemoryArgs(jvmArgs)

    // ---- 启动日志：参数摘要 ----
    {
      const xmxArg = jvmArgs.find(a => /^-Xmx/i.test(a))
      const xmsArg = jvmArgs.find(a => /^-Xms/i.test(a))
      const gcName = jvmArgs.includes('-XX:+UseG1GC') ? 'G1GC' : 'JVM 默认'
      const encArg = jvmArgs.find(a => a.startsWith('-Dfile.encoding='))
      const stdoutEncArg = jvmArgs.find(a => a.startsWith('-Dstdout.encoding='))
      launchLog(`系统内存：总 ${(totalmem() / 1024 ** 3).toFixed(1)}G / 可用 ${(freemem() / 1024 ** 3).toFixed(1)}G`)
      launchLog(`内存分配：${xmxArg || '默认'}${xmsArg ? ' ' + xmsArg : ''}（已按系统内存自动校正）`)
      launchLog(`垃圾回收：${gcName}   文件编码：${encArg ? encArg.split('=')[1] : 'UTF-8'}   日志输出编码：${stdoutEncArg ? stdoutEncArg.split('=')[1] : '随文件编码'}`)
      if (loaderJvmCount > 0 || loaderGameCount > 0) {
        launchLog(`加载器参数：来自版本 JSON（JVM ${loaderJvmCount} 条 / 游戏 ${loaderGameCount} 条）`)
      }
      const mainIdx = jvmArgs.indexOf(mainClass)
      const gameArgCount = mainIdx >= 0 ? jvmArgs.length - mainIdx - 1 : 0
      launchLog(`启动参数：共 ${jvmArgs.length} 项（主类 ${mainClass}${gameArgCount > 0 ? `，游戏参数 ${gameArgCount} 项` : ''}）`)
      if (gameProxyArgs.length > 0) {
        launchLog('代理：游戏进程已启用代理 JVM 参数')
      }
    }

    // 将 -cp 和 classpath 添加到参数最前面（主类之前）
    const fullJvmArgs = ['-cp', classpath, ...jvmArgs]

    // 在临时目录创建 Java 参数文件
    const argFilePath = path.join(tmpdir(), `zncl_launch_${Date.now()}.args`)
    // argfile 格式：每行一个参数，包含空格/分号的路径用双引号包裹
    // 注意：Java @argfile 中反斜杠(\)是转义字符，必须将Windows路径的反斜杠替换为正斜杠(/)，
    // 否则路径中的 \U、\2 等会被当作转义序列，导致classpath解析失败，找不到主类
    const argFileContent = fullJvmArgs.map(arg => {
      // 将Windows反斜杠路径转换为正斜杠，兼容Java参数文件解析
      const normalizedArg = arg.replace(/\\/g, '/')
      // 路径包含 classpath 分隔符或空格时需要用双引号包裹
      if (normalizedArg.includes(' ') || normalizedArg.includes(path.delimiter)) {
        // 转义参数中的双引号（如果有）
        return `"${normalizedArg.replace(/"/g, '\\"')}"`
      }
      return normalizedArg
    }).join('\n')

    fs.writeFileSync(argFilePath, argFileContent, 'utf-8')
    console.log(`[Main] Java 参数文件: ${argFilePath}`)
    console.log(`[Main] 参数文件大小: ${argFileContent.length} 字符`)
    console.log(`[Main] Classpath长度: ${classpath.length} 字符, 库数量: ${libPaths.length}`)
    console.log(`[Main] Classpath最后一项(client.jar): ${jarFile}`)

    // 实际传给 java.exe 的只有 @参数文件路径，长度永远不会超限
    const javaCmdArgs = [`@${argFilePath}`]

    console.log(`[Main] 启动命令: ${javaExecutable} @${argFilePath}`)

    // ---- 启动日志：命令摘要 ----
    launchLog(`类路径：${libPaths.length} 个库，classpath ${classpath.length} 字符`)
    launchLog(`工作目录：${minecraftDir}`)
    launchLog(`启动命令：${path.basename(javaExecutable)} @${path.basename(argFilePath)}`)
    launchLog('---------- 开始启动游戏 ----------')

    // ========== 启动游戏进程 ==========
    gameProcess = spawn(javaExecutable, javaCmdArgs, {
      cwd: minecraftDir,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: `${path.dirname(javaExecutable)}${path.delimiter}${process.env.PATH}`
      }
    })

    let stdout = ''
    let stderr = ''
    let hasOutput = false

    launchLog(`游戏进程已启动（PID ${gameProcess.pid ?? '未知'}）`)

    // stdout / stderr 各用一个流式解码器（不能共用）：
    //   - 配合 -Dstdout.encoding=UTF-8，修 JDK 18+ 按控制台编码（GBK）输出导致的中文乱码
    //   - 中文字符被 data 事件切成两半时，未解完的字节留到下一块，切口不再出替换字符
    const decodeStdout = createGameLogDecoder()
    const decodeStderr = createGameLogDecoder()

    gameProcess.stdout?.on('data', (data: Buffer) => {
      const output = decodeStdout(data)
      stdout += output
      hasOutput = true
      console.log('[Game]', output.trim())
      sendGameLog('info', output.trim())
    })

    gameProcess.stderr?.on('data', (data: Buffer) => {
      const output = decodeStderr(data)
      stderr += output
      hasOutput = true
      console.error('[Game Error]', output.trim())

      // 分级逻辑（异常/FATAL/WARN -> error/warn/info）在 src/shared/game-log.ts
      sendGameLog(classifyGameStderr(output), output.trim())
    })

    gameProcess.on('error', (err: Error) => {
      console.error('[Main] 游戏启动错误:', err)
      sendGameLog('error', mt('mc.gameError', { err: err.message }))
    })

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5000)
      const checkInterval = setInterval(() => {
        if (gameProcess.exitCode !== null || hasOutput) {
          clearTimeout(timeout)
          clearInterval(checkInterval)
          resolve(undefined)
        }
      }, 500)
    })

    // 清理临时参数文件的辅助函数
    const cleanupArgFile = () => {
      try {
        if (fs.existsSync(argFilePath)) {
          fs.unlinkSync(argFilePath)
          console.log(`[Main] 已清理临时参数文件`)
        }
      } catch (e) {
        // 忽略清理错误
      }
    }

    if (gameProcess.exitCode !== null) {
      console.error(`[Main] 游戏进程退出，代码: ${gameProcess.exitCode}`)
      console.error('[Main] 标准输出:', stdout.substring(0, 2000) || '(无)')
      console.error('[Main] 错误输出:', stderr.substring(0, 2000) || '(无)')

      // 发送完整日志给前端
      if (stdout) sendGameLog('info', mt('mc.stdoutLabel', { text: stdout.substring(0, 2000) }))
      if (stderr) sendGameLog('error', mt('mc.stderrLabel', { text: stderr.substring(0, 2000) }))

      // 分析常见错误（判定规则在 src/shared/game-log.ts，这里只翻译成用户文案）
      let errorHint = ''
      const hintKey = detectGameErrorHint(stderr)
      if (hintKey) {
        errorHint = mt(hintKey)
      }

      // 原生崩溃码（0xC0000005 等）通常不产生 Java 异常堆栈，单独识别
      if (!errorHint) {
        const nativeHint = describeNativeExitCode(gameProcess.exitCode)
        if (nativeHint) errorHint = nativeHint
      }

      // 启动失败，清理临时文件
      cleanupArgFile()

      return {
        success: false,
        error: mt('mc.launchFailed', { code: gameProcess.exitCode, hint: errorHint ? mt('mc.sentenceSep') + errorHint : '', err: stderr || stdout || mt('mc.unknownError') })
      }
    }

    if (!hasOutput) {
      console.log('[Main] 游戏进程已启动，但尚未有输出')
    }
    launchLog('启动流程完成，游戏进程运行中')

    gameProcess.on('exit', (code: number) => {
      console.log(`[Main] 游戏进程退出，代码: ${code}`)
      launchLog(code === 0 ? '游戏已正常退出' : `游戏进程异常退出，代码 ${code}`, code === 0 ? 'info' : 'warn')
      if (code !== 0) {
        const nativeHint = describeNativeExitCode(code)
        console.error(`[Main] 游戏异常退出${nativeHint ? '：' + nativeHint : ''}`)
        sendGameLog('error', nativeHint
          ? mt('mc.gameExitedWithHint', { code, hint: nativeHint })
          : mt('mc.gameExited', { code }))
        win?.webContents.send('game-crash', {
          versionId,
          exitCode: code,
          stderr: stderr.substring(0, 500),
          nativeHint: nativeHint || undefined
        })
      }
      // 游戏退出后清理临时参数文件
      cleanupArgFile()
      gameProcess = null
    })

    // 分离进程，让游戏独立运行
    gameProcess.unref()

    return { success: true, message: mt('mc.launchSuccess', { version: versionId }) }

  } catch (error: any) {
    console.error('[Main] 启动游戏失败:', error)
    return {
      success: false,
      error: error.message || mt('mc.launchGameFailed')
    }
  }
})

let serverProcess: any = null

function sendServerLog(level: string, message: string) {
  if (win) {
    win.webContents.send('server-log', {
      level,
      message,
      timestamp: new Date().toISOString()
    })
  }
}

ipcMain.handle('check-server-jar', async (event, versionId: string) => {
  const minecraftDir = getMinecraftDir()
  const serverDir = path.join(minecraftDir, 'servers', versionId)
  const serverJar = path.join(serverDir, 'server.jar')
  return { exists: fs.existsSync(serverJar), serverJar }
})

ipcMain.handle('download-server-jar', async (event, versionId: string) => {
  try {
    const minecraftDir = getMinecraftDir()
    const serverDir = path.join(minecraftDir, 'servers', versionId)
    if (!fs.existsSync(serverDir)) {
      fs.mkdirSync(serverDir, { recursive: true })
    }

    const serverJar = path.join(serverDir, 'server.jar')
    if (fs.existsSync(serverJar)) {
      const stats = fs.statSync(serverJar)
      if (stats.size > 10000) {
        return { success: true, message: mt('mc.serverAlreadyExists') }
      }
      try { fs.unlinkSync(serverJar) } catch {}
    }

    // 国内发行版：server.jar 同属游戏本体，不代用户获取
    if (!__ENABLE_MC_DOWNLOAD__) {
      return { success: false, error: mt('mc.downloadDisabled') }
    }

    console.log(`[Main] 正在获取版本 ${versionId} 的官方下载地址...`)

    await ensureAutoProbe()

    const manifestUrls = orderByDownloadSource([
      'https://launchermeta.mojang.com/mc/game/version_manifest.json',
      'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json',
      'https://download.mcbbs.net/mc/game/version_manifest.json'
    ])

    let versionMetaUrl: string | null = null
    for (const manifestUrl of manifestUrls) {
      try {
        const manifestResp = await httpFetch(manifestUrl, { timeout: 10000 })
        if (!manifestResp.ok) continue
        const manifestData: any = await manifestResp.json()
        const found = manifestData.versions?.find((v: any) => v.id === versionId)
        if (found?.url) {
          versionMetaUrl = found.url as string
          console.log(`[Main] 从官方 Manifest 获取到版本元数据地址: ${versionMetaUrl.substring(0, 60)}...`)
          break
        }
      } catch (e) {
        console.warn(`[Main] 从 ${manifestUrl} 获取 Manifest 失败:`, (e as any).message)
      }
    }

    let downloadUrls: string[] = []

    if (versionMetaUrl) {
      try {
        const metaResp = await httpFetch(versionMetaUrl, { timeout: 10000 })
        if (metaResp.ok) {
          const metaData: any = await metaResp.json()
          const serverDownload = metaData.downloads?.server
          if (serverDownload?.url) {
            downloadUrls.push(serverDownload.url)
            console.log(`[Main] 获取到官方服务端下载地址: ${serverDownload.url.substring(0, 60)}...`)
          }
        }
      } catch (e) {
        console.warn(`[Main] 获取版本元数据失败:`, (e as any).message)
      }
    }

    const fallbackUrls = [
      `https://bmclapi2.bangbang93.com/version/${versionId}/server_jar`,
      `https://download.mcbbs.net/version/${versionId}/server_jar`
    ]

    for (const url of fallbackUrls) {
      if (!downloadUrls.includes(url)) {
        downloadUrls.push(url)
      }
    }

    if (downloadUrls.length === 0) {
      return { success: false, error: mt('mc.cannotGetServerUrl') }
    }

    downloadUrls = orderByDownloadSource(downloadUrls)

    console.log(`[Main] 共 ${downloadUrls.length} 个下载源，${preferMirror() ? '镜像优先' : '官方优先'}`)

    let downloadSuccess = false
    let lastError = ''

    for (let i = 0; i < downloadUrls.length; i++) {
      const url = downloadUrls[i]
      const isOfficial = !isMirrorUrl(url)
      console.log(`[Main] 尝试下载服务端 JAR (${i + 1}/${downloadUrls.length})${isOfficial ? ' [官方]' : ' [镜像]'}: ${url.substring(0, 60)}...`)

      try {
        await downloadFile(url, serverJar, (progress, speed) => {
          event.sender?.send('server-download-progress', { versionId, progress, speed: speed || 0 })
        }, () => false)

        if (fs.existsSync(serverJar)) {
          const stats = fs.statSync(serverJar)
          if (stats.size > 10000) {
            console.log(`[Main] 服务端 JAR 下载成功: ${serverJar}, 大小: ${stats.size}`)
            downloadSuccess = true
            break
          }
        }
      } catch (e: any) {
        lastError = e.message
        console.error(`[Main] 源 ${i + 1} 下载失败:`, e.message)
      }
    }

    if (!downloadSuccess) {
      return { success: false, error: mt('mc.downloadFailed', { err: lastError || mt('mc.allSourcesFailed') }) }
    }

    const eulaFile = path.join(serverDir, 'eula.txt')
    if (!fs.existsSync(eulaFile)) {
      fs.writeFileSync(eulaFile, '#Generated by ZNCraft Launcher\neula=true\n')
      console.log('[Main] 已自动同意 EULA')
    }

    const propsFile = path.join(serverDir, 'server.properties')
    if (!fs.existsSync(propsFile)) {
      const defaultProps = [
        '#Minecraft server properties',
        '#Generated by ZNCraft Launcher',
        'server-port=25565',
        'max-players=20',
        'online-mode=false',
        'allow-flight=false',
        'difficulty=easy',
        'gamemode=survival',
        'level-name=world',
        'motd=A Minecraft Server powered by ZNCraft',
        'pvp=true',
        'spawn-protection=16',
        'white-list=false',
        'enable-command-block=false',
        'max-world-size=29999984',
        'network-compression-threshold=256',
        'resource-pack-sha1=',
        'resource-pack=',
        'spawn-npcs=true',
        'spawn-animals=true',
        'generate-structures=true',
        'view-distance=10',
        'max-build-height=256',
        'snooper-enabled=true',
        'level-seed=',
        'prevent-proxy-connections=false',
        'use-native-transport=true',
        'enable-rcon=false',
        ''
      ].join('\n')
      fs.writeFileSync(propsFile, defaultProps)
      console.log('[Main] 已生成默认 server.properties')
    }

    return { success: true }
  } catch (e: any) {
    console.error('[Main] 下载服务端失败:', e)
    return { success: false, error: e.message || mt('mc.unknownError') }
  }
})

ipcMain.handle('start-server', async (event, versionId: string, maxMemory: string = '4G', options?: { skipJavaCheck?: boolean; autoDownloadJava?: boolean }) => {
  try {
    if (serverProcess) {
      return { success: false, error: mt('mc.serverAlreadyRunning') }
    }

    const minecraftDir = getMinecraftDir()
    const serverDir = path.join(minecraftDir, 'servers', versionId)
    const serverJar = path.join(serverDir, 'server.jar')

    if (!fs.existsSync(serverJar)) {
      return { success: false, error: mt('mc.serverJarMissing') }
    }

    const javaNeed = requiredJavaForMcVersion(versionId)
    let requiredJavaVersion = 17
    let javaType: 'legacy' | 'modern' | 'latest' = 'modern'

    if (javaNeed) {
      javaType = javaNeed.type
      requiredJavaVersion = javaNeed.version
    }

    const allowNewerJava = options?.skipJavaCheck === true
    const allowAutoDownloadJava = options?.autoDownloadJava !== false
    let javaPath = await findJavaPath(javaType, requiredJavaVersion, allowNewerJava)

    // 自动下载 Java —— 原先只有 launch-game 有这条逻辑，服务器启动找不到就直接失败。
    // launch-game 里同样的映射：只可能需要 8 / 17 / 21 / 25 这几个版本。
    if (!javaPath && allowAutoDownloadJava) {
      const javaToDownload =
        requiredJavaVersion >= 25 ? '25'
        : requiredJavaVersion >= 21 ? '21'
        : requiredJavaVersion >= 17 ? '17'
        : '8'
      console.log(`[Main] 未找到 Java ${requiredJavaVersion}+，开始自动下载 Java ${javaToDownload}...`)
      pushJavaDownloadLog(javaToDownload, mt('mc.javaAutoDownloadNeeded', { required: requiredJavaVersion, version: javaToDownload }), event)
      try {
        const downloadResult = await downloadJavaInternal(javaToDownload, event)
        if (downloadResult.success) {
          invalidateJavaCache()
          javaPath = await findJavaPath(javaType, requiredJavaVersion, allowNewerJava)
          console.log(javaPath ? `[Main] Java ${javaToDownload} 下载成功，使用: ${javaPath}` : '[Main] Java 下载完成但仍找不到可用的可执行文件')
          if (javaPath) pushJavaDownloadLog(javaToDownload, mt('mc.autoDownloadSuccess', { path: javaPath }), event)
        } else {
          console.error('[Main] 自动下载 Java 失败:', downloadResult.error)
          pushJavaDownloadLog(javaToDownload, mt('mc.autoDownloadFailed', { err: downloadResult.error }), event)
        }
      } catch (e: any) {
        console.error('[Main] 自动下载 Java 失败:', e)
        pushJavaDownloadLog(javaToDownload, mt('mc.autoDownloadFailed', { err: e.message || String(e) }), event)
      }
    }

    if (!javaPath) {
      return {
        success: false,
        error: allowAutoDownloadJava
          ? mt('mc.javaNotFoundServerAutoOn', { required: requiredJavaVersion })
          : mt('mc.javaNotFoundServerAutoOff', { required: requiredJavaVersion })
      }
    }

    const totalMB = Math.floor(totalmem() / (1024 ** 2))
    const capMB = Math.max(1024, Math.min(8192, Math.floor(totalMB * 0.5)))
    const parsedMaxMB = normalizeMemArgValue(maxMemory) ?? capMB
    const serverMaxMB = Math.max(1024, Math.min(parsedMaxMB, capMB))
    // 初始堆取最大堆的一半，且不超过系统可分配上限
    const serverMinMB = Math.max(512, Math.min(Math.floor(serverMaxMB / 2), capMB))

    const serverArgs = [
      `-Xmx${serverMaxMB}M`,
      `-Xms${serverMinMB}M`,
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-XX:+UnlockExperimentalVMOptions',
      '-XX:+DisableExplicitGC',
      '-XX:G1NewSizePercent=30',
      '-XX:G1MaxNewSizePercent=40',
      '-XX:G1HeapRegionSize=8M',
      '-XX:G1ReservePercent=20',
      '-XX:G1HeapWastePercent=5',
      '-XX:G1MixedGCCountTarget=4',
      '-XX:InitiatingHeapOccupancyPercent=15',
      '-XX:G1MixedGCLiveThresholdPercent=90',
      '-XX:G1RSetUpdatingPauseTimePercent=5',
      '-XX:SurvivorRatio=32',
      '-XX:+PerfDisableSharedMem',
      '-XX:MaxTenuringThreshold=1',
      '-Dusing.aikars.flags=https://mcflags.emc.gs',
      '-Daikars.new.flags=true',
      '-Dfile.encoding=UTF-8',
      // 同游戏进程：JDK 18+ 下 stdout/stderr 默认按控制台编码（GBK）输出，强制 UTF-8
      '-Dstdout.encoding=UTF-8',
      '-Dstderr.encoding=UTF-8',
      '-jar',
      serverJar,
      'nogui'
    ]

    console.log(`[Main] 启动服务器: ${versionId}, Java: ${javaPath}, Xmx=${serverMaxMB}M, Xms=${serverMinMB}M`)
    sendServerLog('info', mt('mc.serverStarting', { version: versionId }))
    sendServerLog('info', mt('mc.serverMaxMemory', { max: serverMaxMB, min: serverMinMB }))

    // 流式解码，理由同游戏进程（JDK 18+ 编码 / 多字节字符跨块）
    const decodeServerStdout = createGameLogDecoder()
    const decodeServerStderr = createGameLogDecoder()

    serverProcess = spawn(javaPath, serverArgs, {
      cwd: serverDir,
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const output = decodeServerStdout(data)
      splitLogLines(output).forEach(line => sendServerLog('info', line))
    })

    serverProcess.stderr?.on('data', (data: Buffer) => {
      const output = decodeServerStderr(data)
      splitLogLines(output).forEach(line => sendServerLog('error', line))
    })

    serverProcess.on('exit', (code: number) => {
      console.log(`[Main] 服务器进程退出，代码: ${code}`)
      sendServerLog(code === 0 ? 'info' : 'error', mt('mc.serverExited', { code }))
      if (win) {
        win.webContents.send('server-stopped', { exitCode: code })
      }
      serverProcess = null
    })

    serverProcess.on('error', (err: Error) => {
      console.error('[Main] 服务器启动错误:', err)
      sendServerLog('error', mt('mc.serverError', { err: err.message }))
      serverProcess = null
    })

    return { success: true }
  } catch (e: any) {
    console.error('[Main] 启动服务器失败:', e)
    return { success: false, error: e.message || mt('mc.unknownError') }
  }
})

ipcMain.handle('stop-server', async () => {
  try {
    if (!serverProcess) {
      return { success: false, error: mt('mc.noServerRunning') }
    }

    sendServerLog('info', mt('mc.stoppingServer'))
    serverProcess.stdin?.write('stop\n')

    const timeout = setTimeout(() => {
      if (serverProcess) {
        console.warn('[Main] 服务器未在 10 秒内停止，强制终止')
        sendServerLog('warn', mt('mc.serverStopTimeout'))
        serverProcess.kill()
      }
    }, 10000)

    serverProcess.once('exit', () => {
      clearTimeout(timeout)
    })

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message || mt('mc.unknownError') }
  }
})

ipcMain.handle('send-server-command', async (event, command: string) => {
  try {
    if (!serverProcess) {
      return { success: false, error: mt('mc.noServerRunning') }
    }
    serverProcess.stdin?.write(command + '\n')
    sendServerLog('command', command)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message || mt('mc.unknownError') }
  }
})

ipcMain.handle('open-server-dir', async (event, versionId: string) => {
  try {
    const minecraftDir = getMinecraftDir()
    const serverDir = path.join(minecraftDir, 'servers', versionId)
    if (!fs.existsSync(serverDir)) {
      fs.mkdirSync(serverDir, { recursive: true })
    }
    shell.openPath(serverDir)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// ========== FRP 内网穿透 ==========
let frpProcess: any = null

const FRP_VERSION = '0.61.0'

// 按平台/架构生成 frp 下载信息（github release 标准命名：frp_<ver>_<os>_<arch>.zip）
function getFrpDownloadInfo(): { urls: string[]; filename: string; version: string } {
  const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? '386' : 'amd64'
  const filename = `frp_${FRP_VERSION}_${osName}_${arch}.zip`
  const base = `https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/${filename}`
  return {
    version: FRP_VERSION,
    urls: [
      `https://gh.ddlc.top/${base}`,
      `https://github.moeyy.xyz/${base}`,
      base
    ],
    filename
  }
}

function getToolsDir(): string {
  const dir = path.join(getMinecraftDir(), 'tools')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getFrpDir(): string {
  const dir = path.join(getToolsDir(), 'frp')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getFrpcPath(): string {
  return path.join(getFrpDir(), toolExe('frpc'))
}

ipcMain.handle('check-frp-downloaded', async () => {
  const frpcPath = getFrpcPath()
  return { exists: fs.existsSync(frpcPath), path: frpcPath }
})

ipcMain.handle('download-frp', async (event) => {
  try {
    const downloadInfo = getFrpDownloadInfo()

    const frpDir = getFrpDir()
    const zipPath = path.join(frpDir, downloadInfo.filename)
    const frpcPath = getFrpcPath()
    const frpcName = toolExe('frpc')

    if (fs.existsSync(frpcPath)) {
      return { success: true, path: frpcPath }
    }

    event.sender.send('frp-download-progress', { progress: 0, speed: 0 })

    let downloadSuccess = false
    let lastError = ''

    for (let i = 0; i < downloadInfo.urls.length; i++) {
      try {
        const url = downloadInfo.urls[i]
        console.log(`[Main] 尝试下载 FRP (源 ${i + 1}): ${url.substring(0, 60)}...`)

        await downloadFile(
          url,
          zipPath,
          (progress, speed) => {
            event.sender.send('frp-download-progress', { progress, speed: speed || 0 })
          }
        )

        downloadSuccess = true
        break
      } catch (e: any) {
        lastError = e.message || mt('mc.downloadFailedShort')
        console.warn(`[Main] FRP 下载源 ${i + 1} 失败: ${lastError}`)
        if (fs.existsSync(zipPath)) {
          try { fs.unlinkSync(zipPath) } catch {}
        }
      }
    }

    if (!downloadSuccess) {
      return { success: false, error: mt('mc.allDownloadSourcesFailed', { err: lastError }) }
    }

    event.sender.send('frp-download-progress', { progress: 95, speed: 0 })

    try {
      const AdmZip = require('adm-zip')
      const zip = new AdmZip(zipPath)
      const entries = zip.getEntries()
      for (const entry of entries) {
        if (entry.entryName.endsWith(frpcName) || entry.entryName.endsWith('frpc.toml') || entry.entryName.endsWith('frpc.ini')) {
          const fileName = path.basename(entry.entryName)
          zip.extractEntryTo(entry, frpDir, false, true)
        }
      }

      try { fs.unlinkSync(zipPath) } catch {}
    } catch (e: any) {
      console.warn('[Main] 自动解压 FRP 失败，尝试手动:', e.message)
      try {
        const { execSync } = require('child_process')
        execSync(`tar -xf "${zipPath}" -C "${frpDir}"`, { timeout: 30000 })
        const extracted = fs.readdirSync(frpDir).find(f => f.startsWith('frp_'))
        if (extracted) {
          const subDir = path.join(frpDir, extracted)
          const subFrpc = path.join(subDir, frpcName)
          if (fs.existsSync(subFrpc)) {
            fs.copyFileSync(subFrpc, path.join(frpDir, frpcName))
          }
          try { fs.rmSync(subDir, { recursive: true, force: true }) } catch {}
        }
        try { fs.unlinkSync(zipPath) } catch {}
      } catch (e2: any) {
        return { success: false, error: mt('mc.extractFailedManual', { err: e2.message, path: zipPath }) }
      }
    }

    event.sender.send('frp-download-progress', { progress: 100, speed: 0 })

    if (!fs.existsSync(frpcPath)) {
      return { success: false, error: mt('mc.frpcNotFoundAfterExtract', { name: frpcName }) }
    }

    // POSIX 需要给 frpc 可执行权限（zip 解压会丢失）
    if (process.platform !== 'win32') {
      try { fs.chmodSync(frpcPath, 0o755) } catch {}
    }

    return { success: true, path: frpcPath }
  } catch (e: any) {
    console.error('[Main] 下载 FRP 失败:', e)
    return { success: false, error: e.message || mt('mc.unknownError') }
  }
})

ipcMain.handle('start-frp-tunnel', async (event, config: {
  serverAddr: string
  serverPort: number
  token?: string
  localPort: number
  tunnelName: string
  tunnelType: string
}) => {
  try {
    if (frpProcess) {
      return { success: false, error: mt('mc.frpTunnelAlreadyRunning') }
    }

    const frpcPath = getFrpcPath()
    if (!fs.existsSync(frpcPath)) {
      return { success: false, error: mt('mc.frpcNotDownloaded') }
    }

    if (!config.serverAddr) {
      return { success: false, error: mt('mc.fetchServerAddress') }
    }

    const remotePort = 50000 + Math.floor(Math.random() * 10000)

    const iniContent = `[common]
server_addr = ${config.serverAddr}
server_port = ${config.serverPort}
${config.token ? `token = ${config.token}` : ''}

[${config.tunnelName || 'minecraft'}]
type = ${config.tunnelType || 'tcp'}
local_ip = 127.0.0.1
local_port = ${config.localPort}
remote_port = ${remotePort}
`

    const configPath = path.join(getFrpDir(), 'frpc-auto.ini')
    fs.writeFileSync(configPath, iniContent, 'utf-8')

    console.log(`[Main] 启动 FRP 隧道: ${config.serverAddr}:${config.serverPort} → 本地端口 ${config.localPort}`)
    console.log(`[Main] FRP 配置文件: ${configPath}`)
    console.log(`[Main] FRP 配置内容:\n${iniContent}`)

    let processExited = false
    let exitCode: number | null = null
    let allOutput: string[] = []

    frpProcess = spawn(frpcPath, ['-c', configPath], {
      cwd: getFrpDir(),
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    frpProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim()
      if (output) {
        console.log(`[FRP] ${output}`)
        allOutput.push(output)
      }
    })

    frpProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString().trim()
      if (output) {
        console.error(`[FRP ERR] ${output}`)
        allOutput.push(output)
      }
    })

    frpProcess.on('exit', (code: number) => {
      console.log(`[Main] FRP 进程退出，代码: ${code}`)
      processExited = true
      exitCode = code
      frpProcess = null
    })

    frpProcess.on('error', (err: Error) => {
      console.error('[Main] FRP 启动错误:', err)
      allOutput.push(err.message)
      processExited = true
      frpProcess = null
    })

    await new Promise(resolve => setTimeout(resolve, 5000))

    if (processExited) {
      const lastLines = allOutput.slice(-5).join('\n')
      const errorMsg = lastLines || mt('mc.frpProcessExitCode', { code: exitCode })
      return { success: false, error: errorMsg }
    }

    if (!frpProcess) {
      return { success: false, error: mt('mc.frpProcessStartFailed') }
    }

    return {
      success: true,
      pid: frpProcess.pid,
      remotePort,
      remoteAddress: `${config.serverAddr}:${remotePort}`
    }
  } catch (e: any) {
    console.error('[Main] 启动 FRP 隧道失败:', e)
    return { success: false, error: e.message || mt('mc.unknownError') }
  }
})

ipcMain.handle('stop-frp-tunnel', async () => {
  try {
    if (!frpProcess) {
      return { success: false, error: mt('mc.noFrpTunnelRunning') }
    }
    frpProcess.kill()
    frpProcess = null
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message || mt('mc.unknownError') }
  }
})

// ========== EasyTier 虚拟局域网 ==========
let easyTierProcess: any = null

// EasyTier 官方 release 命名：easytier-<arch>-<os>.zip
function getEasyTierDownloadInfo(): { urls: string[]; filename: string } {
  const archName = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
  const filename = `easytier-${archName}-${osName}.zip`
  const base = `https://github.com/EasyTier/EasyTier/releases/latest/download/${filename}`
  return {
    urls: [
      `https://gh.ddlc.top/${base}`,
      `https://github.moeyy.xyz/${base}`,
      base
    ],
    filename
  }
}

function getEasyTierDir(): string {
  const dir = path.join(getToolsDir(), 'easytier')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getEasyTierPath(): string {
  return path.join(getEasyTierDir(), toolExe('easytier-core'))
}

ipcMain.handle('check-easytier-downloaded', async () => {
  const etPath = getEasyTierPath()
  const altPath = path.join(getEasyTierDir(), toolExe('easytier-cli'))
  return { exists: fs.existsSync(etPath) || fs.existsSync(altPath), path: etPath }
})

ipcMain.handle('download-easytier', async (event) => {
  try {
    const downloadInfo = getEasyTierDownloadInfo()

    const etDir = getEasyTierDir()
    const zipPath = path.join(etDir, downloadInfo.filename)
    const etPath = getEasyTierPath()
    const coreName = toolExe('easytier-core')

    if (fs.existsSync(etPath)) {
      return { success: true, path: etPath }
    }

    event.sender.send('easytier-download-progress', { progress: 0, speed: 0 })

    let downloadSuccess = false
    let lastError = ''

    for (let i = 0; i < downloadInfo.urls.length; i++) {
      try {
        const url = downloadInfo.urls[i]
        console.log(`[Main] 尝试下载 EasyTier (源 ${i + 1}): ${url.substring(0, 60)}...`)

        await downloadFile(
          url,
          zipPath,
          (progress, speed) => {
            event.sender.send('easytier-download-progress', { progress, speed: speed || 0 })
          }
        )

        downloadSuccess = true
        break
      } catch (e: any) {
        lastError = e.message || mt('mc.downloadFailedShort')
        console.warn(`[Main] EasyTier 下载源 ${i + 1} 失败: ${lastError}`)
        if (fs.existsSync(zipPath)) {
          try { fs.unlinkSync(zipPath) } catch {}
        }
      }
    }

    if (!downloadSuccess) {
      return { success: false, error: mt('mc.allDownloadSourcesFailed', { err: lastError }) }
    }

    event.sender.send('easytier-download-progress', { progress: 95, speed: 0 })

    try {
      // 跨平台解压（EasyTier 各平台都是 zip）
      extractArchive(zipPath, etDir)
      try { fs.unlinkSync(zipPath) } catch {}
    } catch (e: any) {
      console.warn('[Main] 自动解压 EasyTier 失败，尝试手动:', e.message)
      try {
        const { execSync } = require('child_process')
        execSync(`tar -xf "${zipPath}" -C "${etDir}"`, { timeout: 30000 })
        try { fs.unlinkSync(zipPath) } catch {}
      } catch (e2: any) {
        return { success: false, error: mt('mc.extractFailed', { detail: e2.message, hint: '' }) }
      }
    }

    event.sender.send('easytier-download-progress', { progress: 100, speed: 0 })

    // 平台化可执行文件过滤：win 是 .exe/.dll，POSIX 无扩展名
    const allFiles = fs.readdirSync(etDir)
    const binFiles = process.platform === 'win32'
      ? allFiles.filter(f => f.toLowerCase().includes('easytier') && (f.endsWith('.exe') || f.endsWith('.dll')))
      : allFiles.filter(f => f.includes('easytier'))
    if (binFiles.length === 0) {
      return { success: false, error: mt('mc.easytierExeNotFound') }
    }

    const coreFile = binFiles.find(f => f.toLowerCase().includes('core')) || binFiles[0]
    const finalPath = path.join(etDir, coreName)
    if (coreFile !== coreName) {
      try {
        fs.copyFileSync(path.join(etDir, coreFile), finalPath)
      } catch {}
    }

    // POSIX 需要给可执行权限
    if (process.platform !== 'win32' && fs.existsSync(finalPath)) {
      try { fs.chmodSync(finalPath, 0o755) } catch {}
    }

    return { success: true, path: finalPath }
  } catch (e: any) {
    console.error('[Main] 下载 EasyTier 失败:', e)
    return { success: false, error: e.message || mt('mc.unknownError') }
  }
})

ipcMain.handle('start-easytier', async (event, config: {
  networkName: string
  peerName: string
  virtualIp: string
  subnet: string
  listenPort: number
  relayAddr: string
}) => {
  try {
    if (easyTierProcess) {
      return { success: false, error: mt('mc.easytierAlreadyRunning') }
    }

    const etDir = getEasyTierDir()
    let etPath = getEasyTierPath()
    if (!fs.existsSync(etPath)) {
      // 平台化可执行文件过滤（win 是 .exe，POSIX 无扩展名）
      const altFiles = process.platform === 'win32'
        ? fs.readdirSync(etDir).filter(f => f.endsWith('.exe') || f.endsWith('.dll'))
        : fs.readdirSync(etDir).filter(f => f.includes('easytier'))
      if (altFiles.length > 0) {
        etPath = path.join(etDir, altFiles[0])
      }
    }

    if (!fs.existsSync(etPath)) {
      return { success: false, error: mt('mc.easytierNotDownloaded') }
    }

    const args = [
      '--network-name', config.networkName,
      '--hostname', config.peerName,
      '--virtual-ip', config.virtualIp,
      '--subnet', config.subnet,
      '--listen-port', config.listenPort.toString()
    ]

    if (config.relayAddr) {
      args.push('--relays', config.relayAddr)
    }

    console.log(`[Main] 启动 EasyTier: ${config.networkName} (${config.virtualIp})`)

    easyTierProcess = spawn(etPath, args, {
      cwd: etDir,
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let started = true

    easyTierProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString().trim()
      if (output) {
        console.log(`[EasyTier] ${output}`)
      }
    })

    easyTierProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString().trim()
      if (output) {
        console.error(`[EasyTier ERR] ${output}`)
      }
    })

    easyTierProcess.on('exit', (code: number) => {
      console.log(`[Main] EasyTier 进程退出，代码: ${code}`)
      easyTierProcess = null
    })

    easyTierProcess.on('error', (err: Error) => {
      console.error('[Main] EasyTier 启动错误:', err)
      easyTierProcess = null
      started = false
    })

    await new Promise(resolve => setTimeout(resolve, 2000))

    if (!started || !easyTierProcess) {
      return { success: false, error: mt('mc.easytierProcessStartFailed') }
    }

    return { success: true, pid: easyTierProcess.pid }
  } catch (e: any) {
    console.error('[Main] 启动 EasyTier 失败:', e)
    return { success: false, error: e.message || mt('mc.unknownError') }
  }
})

ipcMain.handle('stop-easytier', async () => {
  try {
    if (!easyTierProcess) {
      return { success: false, error: mt('mc.noEasyTierRunning') }
    }
    easyTierProcess.kill()
    easyTierProcess = null
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message || mt('mc.unknownError') }
  }
})

// ============= P2P TCP 转发 =============
let p2pServer: net.Server | null = null
let p2pClient: net.Socket | null = null
let p2pForwardTarget: WebContents | null = null

// 客户端模式：启动 TCP 服务端监听 25565，把 MC 客户端数据通过 P2P 转发
const startP2PClientMode = () => {
  return new Promise<{ success: boolean; error?: string; port: number }>((resolve) => {
    if (p2pServer) {
      resolve({ success: true, port: (p2pServer.address() as any).port })
      return
    }

    // 尝试从 25565 开始，被占用就往后找
    let tryPort = 25565
    const tryStart = () => {
      p2pServer = net.createServer((socket: net.Socket) => {
        console.log(`[P2P] MC 客户端已连接: ${socket.remoteAddress}:${socket.remotePort}`)
        p2pClient = socket

        socket.on('data', (data: Buffer) => {
          // 把 MC 数据发给渲染进程走 P2P
          if (p2pForwardTarget && !p2pForwardTarget.isDestroyed()) {
            p2pForwardTarget.send('p2p-tcp-data', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
          }
        })

        socket.on('close', () => {
          console.log('[P2P] MC 客户端断开')
          if (p2pClient === socket) p2pClient = null
        })

        socket.on('error', (err) => {
          console.error('[P2P] MC socket 错误:', err.message)
        })
      })

      p2pServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && tryPort < 25600) {
          tryPort++
          p2pServer = null
          tryStart()
        } else {
          resolve({ success: false, error: err.message, port: tryPort })
        }
      })

      p2pServer.listen(tryPort, '127.0.0.1', () => {
        console.log(`[P2P] 客户端模式监听端口: ${tryPort}`)
        resolve({ success: true, port: tryPort })
      })
    }
    tryStart()
  })
}

// 主机端模式：连接到本地 MC 服务器 25565
const startP2PHostMode = () => {
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    if (p2pClient) {
      resolve({ success: true })
      return
    }

    const client = net.createConnection({ port: 25565, host: '127.0.0.1' }, () => {
      console.log('[P2P] 已连接到本地 MC 服务器 :25565')
      p2pClient = client
      resolve({ success: true })
    })

    client.on('data', (data: Buffer) => {
      if (p2pForwardTarget && !p2pForwardTarget.isDestroyed()) {
        p2pForwardTarget.send('p2p-tcp-data', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
      }
    })

    client.on('close', () => {
      console.log('[P2P] 与本地 MC 服务器断开')
      if (p2pClient === client) p2pClient = null
    })

    client.on('error', (err) => {
      console.error('[P2P] 连接本地 MC 服务器失败:', err.message)
      resolve({ success: false, error: mt('mc.cannotConnectLocalMc', { err: err.message }) })
    })
  })
}

ipcMain.handle('start-p2p-forward', async (event, isHost: boolean) => {
  try {
    p2pForwardTarget = event.sender
    if (isHost) {
      const result = await startP2PHostMode()
      return { ...result, mode: 'host' }
    } else {
      const result = await startP2PClientMode()
      return { ...result, mode: 'client' }
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('send-p2p-data', async (_event, data: ArrayBuffer) => {
  if (!p2pClient) return { success: false, error: mt('mc.noTcpSocket') }
  try {
    p2pClient.write(Buffer.from(data))
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('stop-p2p-forward', async () => {
  try {
    if (p2pClient) { p2pClient.destroy(); p2pClient = null }
    if (p2pServer) { p2pServer.close(); p2pServer = null }
    p2pForwardTarget = null
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
})

// 检查 Java 是否安装
// allowNewerJava：与 launch-game 用同一个开关，保证首页显示的就是实际会用的那个
ipcMain.handle('check-java', async (event, allowNewerJava?: boolean) => {
  const java = await findJava(undefined, undefined, false, allowNewerJava === true)
  return { success: !!java, installed: !!java, path: java?.path || null, version: java?.version || null }
})

// 列出所有已安装的 Java（设置页「已安装」列表使用）
// 必须全量扫描：check-java 只返回自动挑选的那一个，无法反映用户装过哪些版本
ipcMain.handle('list-javas', async () => {
  try {
    const candidates = await scanJavaCandidates(true)
    return {
      success: true,
      list: candidates.map(c => ({ version: String(c.version), path: c.path }))
    }
  } catch (error: any) {
    console.error('[Main] 列出 Java 失败:', error)
    return { success: false, list: [], error: error.message }
  }
})

// 下载并安装 Java
ipcMain.handle('download-java', async (event, javaVersion: string) => {
  try {
    console.log(`[Main] 开始下载 Java ${javaVersion}`)

    // 使用时间戳创建新的下载目录，避免文件被占用问题
    const timestamp = Date.now()
    const downloadDir = path.join(getMinecraftDir(), 'java-downloads', `jdk-${javaVersion}-${timestamp}`)
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true })
    }

    // 清理旧的下载目录
    try {
      const javaDownloadsParent = path.join(getMinecraftDir(), 'java-downloads')
      if (fs.existsSync(javaDownloadsParent)) {
        const oldDirs = fs.readdirSync(javaDownloadsParent).filter(d => d.startsWith(`jdk-${javaVersion}-`) && d !== path.basename(downloadDir))
        for (const oldDir of oldDirs) {
          try {
            const oldDirPath = path.join(javaDownloadsParent, oldDir)
            fs.rmSync(oldDirPath, { recursive: true, force: true })
            console.log(`[Main] 已清理旧目录: ${oldDir}`)
          } catch {}
        }
      }
    } catch {}

    const downloadInfo = javaDownloadUrls(javaVersion)
    if (!downloadInfo) {
      return { success: false, error: mt('mc.javaUnsupported', { version: javaVersion }) }
    }

    const zipPath = path.join(downloadDir, downloadInfo.filename)
    const tempZipPath = path.join(downloadDir, `temp_${downloadInfo.filename}`)
    let skipDownload = false

    // 检查是否已有有效的 zip 文件（大小 > 0）
    if (fs.existsSync(zipPath)) {
      try {
        const stats = fs.statSync(zipPath)
        if (isArchiveReadable(zipPath)) {
          console.log(`[Main] 发现已存在的 Java 压缩包，大小: ${stats.size} bytes，跳过下载`)
          skipDownload = true
        } else {
          console.warn(`[Main] 已存在的 Java 压缩包已损坏或被安全软件拦截，重新下载`)
          try { fs.unlinkSync(zipPath) } catch {}
        }
      } catch (err) {
        try { fs.unlinkSync(zipPath) } catch {}
      }
    }

    // 下载 Java - 尝试多个源（如果没有有效文件）
    if (!skipDownload) {
      event.sender.send('java-download-progress', { version: javaVersion, progress: 0, status: 'downloading', speed: 0 })

      // 设置取消标志
      let cancelled = false
      currentJavaDownload = { abort: () => { cancelled = true }, cancelled: false }

      let downloadSuccess = false
      let lastError = ''

      for (let i = 0; i < downloadInfo.urls.length; i++) {
        if (cancelled || currentJavaDownload?.cancelled) {
          return { success: false, error: mt('mc.downloadCancelled') }
        }

        const url = downloadInfo.urls[i]
        console.log(`[Main] 尝试下载源 ${i + 1}/${downloadInfo.urls.length}: ${url}`)

        try {
          // 使用临时文件名避免冲突，并传递取消检查函数
          await downloadFile(url, tempZipPath, (progress, speed) => {
            if (!cancelled) {
              event.sender.send('java-download-progress', { version: javaVersion, progress, speed: speed || 0, status: 'downloading' })
            }
          }, () => cancelled)

          if (cancelled) {
            return { success: false, error: mt('mc.downloadCancelled') }
          }

          // 下载成功后移动到目标位置（使用更可靠的方式）
          // 先确保目标文件不存在
          if (fs.existsSync(zipPath)) {
            try {
              // 等待一下再删除，有时文件可能被占用
              setTimeout(() => {
                try { fs.unlinkSync(zipPath) } catch {}
              }, 100)
            } catch {}
          }

          // 使用更可靠的文件移动方式：先复制再删除
          try {
            fs.copyFileSync(tempZipPath, zipPath)
            try { fs.unlinkSync(tempZipPath) } catch {}
          } catch (copyError: any) {
            // 如果复制失败，尝试直接重命名
            console.log('[Main] 复制失败，尝试重命名:', copyError.message)
            try { fs.renameSync(tempZipPath, zipPath) } catch (renameError: any) {
              // 如果重命名也失败，可能是跨设备或文件被占用
              if (renameError.code === 'EXDEV' || renameError.code === 'EPERM') {
                // 尝试使用流复制
                const readStream = fs.createReadStream(tempZipPath)
                const writeStream = fs.createWriteStream(zipPath)
                await new Promise<void>((resolve, reject) => {
                  readStream.pipe(writeStream)
                  writeStream.on('finish', () => {
                    try { fs.unlinkSync(tempZipPath) } catch {}
                    resolve()
                  })
                  writeStream.on('error', reject)
                  readStream.on('error', reject)
                })
              } else {
                throw renameError
              }
            }
          }

          downloadSuccess = true
          console.log(`[Main] 下载成功，使用源: ${url}`)
          break
        } catch (downloadError: any) {
          console.error(`[Main] 源 ${i + 1} 下载失败:`, downloadError.message)
          lastError = downloadError.message
          // 清理残留文件后尝试下一个源
          if (fs.existsSync(tempZipPath)) {
            try { fs.unlinkSync(tempZipPath) } catch {}
          }
          continue
        }
      }
      
      if (!downloadSuccess) {
        return { success: false, error: mt('mc.downloadFailed', { err: lastError }) }
      }
    }

    console.log(`[Main] Java ${javaVersion} 下载完成，文件大小: ${fs.statSync(zipPath).size} bytes`)
    event.sender.send('java-download-progress', { version: javaVersion, progress: 100, status: 'extracting' })

    // 解压 Java 到独立的版本文件夹
    const extractDir = path.join(getMinecraftDir(), 'java', `jdk-${javaVersion}`)
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true })
    }

    // 跨平台解压
    try {
      console.log(`[Main] 开始解压到: ${extractDir}`)

      // 解压前清除「来自互联网」标记，文件被安全软件占用时自动重试
      unblockMarkOfTheWeb(zipPath)
      extractArchiveWithRetry(zipPath, extractDir)

      console.log(`[Main] Java 解压完成到: ${extractDir}`)

      // 递归清除解压产物上的「来自互联网」标记，避免 Windows 安全中心拦截 java.exe
      unblockMarkOfTheWeb(extractDir, true)

      // 删除 zip 文件
      fs.unlinkSync(zipPath)
      console.log('[Main] 已删除 ZIP 文件')

      // 查找解压后的 Java 路径
      const javaExePath = await findJavaInDirectory(extractDir)

      if (javaExePath) {
        console.log(`[Main] Java ${javaVersion} 安装完成: ${javaExePath}`)
        invalidateJavaCache()
        event.sender.send('java-download-progress', { version: javaVersion, progress: 100, status: 'completed' })
        return { success: true, path: javaExePath }
      } else {
        console.error(`[Main] 无法找到 ${javaExeName()}，目录内容:`, fs.readdirSync(extractDir))
        return { success: false, error: mt('mc.javaNotFoundAfterInstall', { name: javaExeName() }) }
      }
    } catch (extractError: any) {
      console.error('[Main] 解压失败:', extractError)
      // 解压失败时清理残留文件
      if (fs.existsSync(zipPath)) {
        try { fs.unlinkSync(zipPath) } catch {}
      }
      const detail = extractError.message || String(extractError)
      const hint = /EBUSY|EPERM|EACCES|resource busy|being used|另一个程序|拒绝访问|正被/i.test(detail)
        ? mt('mc.extractBlockedHint')
        : ''
      return { success: false, error: mt('mc.extractFailed', { detail, hint }) }
    }

  } catch (error: any) {
    console.error('[Main] 下载 Java 失败:', error)
    const emsg = error.message || mt('mc.downloadFailedShort')
    pushJavaDownloadLog(javaVersion, mt('mc.javaDownloadFailed', { err: emsg }), event)
    if (currentJavaDownload) {
      currentJavaDownload = null
    }
    return { success: false, error: emsg }
  }
})

// 取消 Java 下载
ipcMain.handle('cancel-java-download', async () => {
  if (currentJavaDownload) {
    console.log('[Main] 取消 Java 下载')
    currentJavaDownload.abort()
    currentJavaDownload.cancelled = true
    currentJavaDownload = null
    return { success: true }
  }
  return { success: false, error: mt('mc.noDownloadInProgress') }
})

// Java 下载日志查看 API
ipcMain.handle('get-java-download-logs', async (event, javaVersion: string) => {
  return getJavaDownloadLogs(javaVersion)
})
ipcMain.handle('clear-java-download-logs', async (event, javaVersion: string) => {
  clearJavaDownloadLogs(javaVersion)
  return
})

// 删除已安装的 Java
ipcMain.handle('delete-java', async (event, javaVersion: string) => {
  try {
    console.log(`[Main] 删除 Java ${javaVersion}`)
    
    const extractDir = path.join(getMinecraftDir(), 'java', `jdk-${javaVersion}`)
    const downloadDir = path.join(getMinecraftDir(), 'java-downloads', `jdk-${javaVersion}`)
    
    let deleted = false
    
    // 删除已安装的 Java 目录
    if (fs.existsSync(extractDir)) {
      try {
        fs.rmSync(extractDir, { recursive: true, force: true })
        console.log(`[Main] 已删除 Java 目录: ${extractDir}`)
        deleted = true
      } catch (err) {
        console.error('[Main] 删除 Java 目录失败:', err)
      }
    }
    
    // 删除下载缓存
    if (fs.existsSync(downloadDir)) {
      try {
        fs.rmSync(downloadDir, { recursive: true, force: true })
        console.log(`[Main] 已删除下载缓存: ${downloadDir}`)
      } catch {}
    }
    
    if (deleted) {
      invalidateJavaCache()
      return { success: true }
    } else {
      return { success: false, error: mt('mc.javaNotInstalledOrCannotDelete') }
    }
  } catch (error: any) {
    console.error('[Main] 删除 Java 失败:', error)
    return { success: false, error: error.message || mt('mc.deleteFailed') }
  }
})

// 在目录中查找 Java
async function findJavaInDirectory(dir: string): Promise<string | null> {
  const javaExeNameToFind = javaExeName()
  try {
    // 首先检查当前目录是否就是 JDK 目录（包含 bin/java）
    const directJavaExe = path.join(dir, 'bin', javaExeNameToFind)
    if (fs.existsSync(directJavaExe)) {
      return directJavaExe
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const javaExe = path.join(dir, entry.name, 'bin', javaExeNameToFind)
        if (fs.existsSync(javaExe)) {
          return javaExe
        }
        // 递归查找
        const subResult = await findJavaInDirectory(path.join(dir, entry.name))
        if (subResult) return subResult
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return null
}

// 获取系统内存信息
ipcMain.handle('get-system-memory', async () => {
  const totalBytes = totalmem()
  const freeBytes = freemem()
  const usedBytes = totalBytes - freeBytes
  const totalGB = totalBytes / (1024 * 1024 * 1024)
  const usedGB = usedBytes / (1024 * 1024 * 1024)
  const freeGB = freeBytes / (1024 * 1024 * 1024)
  return {
    total: parseFloat(totalGB.toFixed(1)),
    used: parseFloat(usedGB.toFixed(1)),
    free: parseFloat(freeGB.toFixed(1)),
    totalBytes,
    usedBytes,
    freeBytes
  }
})

// 磁盘信息缓存：避免每次调用都同步递归扫描整个游戏目录，阻塞主进程
const DISK_FREE_CACHE_TTL = 60 * 1000
const GAME_SIZE_CACHE_TTL = 5 * 60 * 1000

let diskFreeCache: { at: number; totalBytes: number; freeBytes: number } | null = null
let gameSizeCache: { at: number; sizeGB: number; sizeMB: number } | null = null
let gameSizeWalk: Promise<number> | null = null

function invalidateDiskCache() {
  diskFreeCache = null
  gameSizeCache = null
  gameSizeWalk = null
}

// 异步递归统计目录大小（不阻塞主进程，每 200 项让出一次事件循环）
async function calculateDirSizeAsync(dir: string): Promise<number> {
  let size = 0
  let count = 0
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      try {
        if (entry.isFile()) {
          const stat = await fs.promises.stat(fullPath)
          size += stat.size
        } else if (entry.isDirectory()) {
          size += await calculateDirSizeAsync(fullPath)
        }
      } catch {}
      count++
      if (count % 200 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
  } catch {}
  return size
}

// 单飞 + 缓存：同一时间只跑一次目录扫描，5 分钟内直接返回缓存
async function getGameDirSize(): Promise<{ sizeGB: number; sizeMB: number }> {
  const now = Date.now()
  if (gameSizeCache && now - gameSizeCache.at < GAME_SIZE_CACHE_TTL) {
    return { sizeGB: gameSizeCache.sizeGB, sizeMB: gameSizeCache.sizeMB }
  }
  const run = async () => {
    if (gameSizeWalk) return gameSizeWalk
    gameSizeWalk = calculateDirSizeAsync(getMinecraftDir())
    try {
      return await gameSizeWalk
    } finally {
      gameSizeWalk = null
    }
  }
  const sizeBytes = await run()
  const result = {
    sizeGB: parseFloat((sizeBytes / (1024 ** 3)).toFixed(2)),
    sizeMB: parseFloat((sizeBytes / (1024 ** 2)).toFixed(1))
  }
  gameSizeCache = { at: now, sizeGB: result.sizeGB, sizeMB: result.sizeMB }
  return result
}

// 磁盘剩余空间缓存（statfs 同步调用约 10~50ms，60 秒内直接复用）
async function getDiskFree(): Promise<{ totalBytes: number; freeBytes: number }> {
  const now = Date.now()
  if (diskFreeCache && now - diskFreeCache.at < DISK_FREE_CACHE_TTL) {
    return diskFreeCache
  }
  const gameDir = getMinecraftDir()
  const drive = path.parse(gameDir).root
  let totalBytes = 0
  let freeBytes = 0
  try {
    // Node 18.15+ 提供跨平台 fs.statfsSync，替代 Windows-only 的 fsutil
    const stats = fs.statfsSync(drive)
    totalBytes = stats.blocks * stats.bsize
    freeBytes = stats.bavail * stats.bsize
  } catch {}
  diskFreeCache = { at: now, totalBytes, freeBytes }
  return diskFreeCache
}

// 获取磁盘使用信息
ipcMain.handle('get-disk-usage', async () => {
  try {
    const [disk, game] = await Promise.all([getDiskFree(), getGameDirSize()])
    
    const usedBytes = disk.totalBytes - disk.freeBytes
    return {
      totalGB: disk.totalBytes > 0 ? parseFloat((disk.totalBytes / (1024 ** 3)).toFixed(1)) : 0,
      usedGB: disk.totalBytes > 0 ? parseFloat((usedBytes / (1024 ** 3)).toFixed(1)) : 0,
      freeGB: disk.totalBytes > 0 ? parseFloat((disk.freeBytes / (1024 ** 3)).toFixed(1)) : 0,
      usedPercent: disk.totalBytes > 0 ? Math.round((usedBytes / disk.totalBytes) * 100) : 0,
      gameSizeGB: game.sizeGB,
      gameSizeMB: game.sizeMB
    }
  } catch {
    return { totalGB: 0, usedGB: 0, freeGB: 0, usedPercent: 0, gameSizeGB: 0, gameSizeMB: 0 }
  }
})

// 打开 Minecraft 目录
ipcMain.handle('get-game-dir', async () => {
  return getMinecraftDir()
})

ipcMain.handle('set-game-dir', async (_event, dir: string) => {
  if (dir) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true })
        console.log(`[Main] 创建自定义游戏目录: ${dir}`)
      } catch (e: any) {
        return { success: false, error: mt('mc.dirNotExistCannotCreate', { err: e?.message || e }) }
      }
    }
    customGameDir = dir
    getMinecraftDir()
    invalidateJavaCache()
    invalidateDiskCache()
    return { success: true }
  }
  customGameDir = null
  getMinecraftDir()
  invalidateJavaCache()
  invalidateDiskCache()
  return { success: true }
})

ipcMain.handle('set-download-source', async (_event, mode: string) => {
  setDownloadSourceMode(mode)
  return { success: true, mode: downloadSourceMode }
})

// 调整下载并发线程数（影响全局连接预算与单文件分块数）
ipcMain.handle('set-download-threads', async (_event, n: number) => {
  const threads = setDownloadThreads(n)
  return { success: true, threads }
})

ipcMain.handle('get-download-threads', async () => {
  return { success: true, threads: getDownloadThreads() }
})

// 切换 Modrinth 国内镜像源
ipcMain.handle('set-modrinth-mirror', async (_event, enabled: boolean) => {
  const value = setModrinthMirrorEnabled(enabled)
  return { success: true, enabled: value }
})

// ============ 下载代理（HTTP / SOCKS5） ============
// 只接管启动器自身的资源下载与元数据请求；节点地址与账号全部由用户提供，
// 启动器不内置、不分发任何代理或 VPN 节点。
const proxyConfigPath = () => path.join(app.getPath('userData'), 'proxy-config.json')

const applySessionProxy = async () => {
  try {
    const c = getProxyConfig()
    // 需要配置代理的会话：默认会话（渲染进程 / 图片 / fetch）+ 自动更新专用会话
    // electron-updater 6.x 用的是 session.fromPartition('electron-updater')，
    // 不设置的话更新请求不会走代理。
    const sessions: Electron.Session[] = [
      session.defaultSession,
      session.fromPartition('electron-updater', { cache: false })
    ]
    if (!c.enabled || !c.host) {
      for (const s of sessions) await s.setProxy({ mode: 'direct' })
      console.log('[Proxy] Chromium 会话恢复直连')
      return
    }
    const rules = { proxyRules: proxyRulesString(), proxyBypassRules: proxyBypassString() }
    for (const s of sessions) await s.setProxy(rules)
    console.log(`[Proxy] Chromium 会话已走代理 ${proxyRulesString()}（白名单：${proxyBypassString()}）`)
  } catch (e: any) {
    console.warn('[Proxy] 应用 Chromium 会话代理失败:', e?.message || e)
  }
}

// 代理需要认证时，Chromium/net 会发出登录质询；统一在这里补上用户名密码
app.on('login', (event, _webContents, _details, authInfo, callback) => {
  try {
    if (!authInfo.isProxy) return
    const c = getProxyConfig()
    if (!c.enabled || !c.username) return
    event.preventDefault()
    callback(c.username, c.password)
  } catch {}
})

ipcMain.handle('set-proxy', async (_event, cfg: any) => {
  const saved = setProxyConfig(cfg || {})
  // 落盘，使下次启动（含自动更新检查）在渲染进程同步之前就已生效
  saveProxyConfigToFile(proxyConfigPath(), saved)
  await applySessionProxy()
  return { success: true, config: saved }
})

ipcMain.handle('get-proxy', async () => {
  return { success: true, config: getProxyConfig() }
})

// 用传入的配置临时测试代理连通性与速度（无需先保存），测完自动还原
ipcMain.handle('test-proxy', async (_event, cfg: any) => {
  const prev = getProxyConfig()
  if (cfg) setProxyConfig(cfg)
  try {
    const r = await testProxyConnection()
    return { success: r.ok, ...r }
  } catch (e: any) {
    return { success: false, ok: false, ms: 0, kbs: 0, error: e?.message || String(e) }
  } finally {
    if (cfg) setProxyConfig(prev)
  }
})

// 同步界面语言到主进程（主进程发出的日志/状态/错误消息据此本地化）
ipcMain.handle('set-locale', async (_event, locale: string) => {
  setMainLocale(locale)
  return { success: true, locale: locale === 'en' ? 'en' : 'zh' }
})

ipcMain.handle('open-minecraft-dir', async () => {
  try {
    const minecraftDir = getMinecraftDir()
    if (!fs.existsSync(minecraftDir)) {
      fs.mkdirSync(minecraftDir, { recursive: true })
    }
    if (!fs.existsSync(minecraftDir)) {
      return { success: false, error: mt('mc.dirCreateFailed', { path: minecraftDir }) }
    }
    shell.openPath(minecraftDir)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-version-dir', async (_event, versionId: string, directoryName?: string) => {
  try {
    const dirName = directoryName || versionId
    const versionDir = path.join(getMinecraftDir(), 'versions', dirName)
    if (!fs.existsSync(versionDir)) {
      return { success: false, error: mt('mc.versionDirNotExist') }
    }
    shell.openPath(versionDir)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-saves-dir', async (_event, directoryName?: string) => {
  try {
    // 版本隔离：如果有 directoryName，打开该版本的存档目录
    const savesDir = directoryName
      ? path.join(getMinecraftDir(), 'versions', directoryName, 'saves')
      : path.join(getMinecraftDir(), 'saves')
    if (!fs.existsSync(savesDir)) {
      fs.mkdirSync(savesDir, { recursive: true })
    }
    shell.openPath(savesDir)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// 下载文件的辅助函数 - 支持断点续传、停滞检测和重试
// 在版本目录中递归查找 modrinth.index.json（处理解压后嵌套一层目录的情况）
function findModrinthIndex(dir: string): string | null {
  const direct = path.join(dir, 'modrinth.index.json')
  if (fs.existsSync(direct)) return direct
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nested = path.join(dir, entry.name, 'modrinth.index.json')
        if (fs.existsSync(nested)) return nested
      }
    }
  } catch {}
  return null
}

// 计算文件的 SHA1 校验值
function sha1File(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const data = fs.readFileSync(filePath)
    return createHash('sha1').update(data).digest('hex')
  } catch (e) {
    return null
  }
}

// 流式异步 sha1：不阻塞事件循环，且限制并发避免占满 libuv 线程池
// 同步版会把整个文件读进内存，24 个并发文件同时校验时主进程被卡死，
// 表现为下载"卡住不动"甚至进度倒退
const SHA1_MAX_CONCURRENCY = Math.max(2, Math.min(4, cpus().length - 1))
let sha1Running = 0
const sha1Waiters: (() => void)[] = []

function sha1FileAsync(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve(null)
      return
    }

    const start = () => {
      sha1Running++
      const hash = createHash('sha1')
      let settled = false
      const finish = (value: string | null) => {
        if (settled) return
        settled = true
        sha1Running--
        const next = sha1Waiters.shift()
        if (next) next()
        resolve(value)
      }
      const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 })
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('error', () => {
        try { stream.destroy() } catch {}
        finish(null)
      })
      stream.on('end', () => finish(hash.digest('hex')))
    }

    if (sha1Running >= SHA1_MAX_CONCURRENCY) {
      sha1Waiters.push(start)
    } else {
      start()
    }
  })
}

// 下载整合包 modrinth.index.json 中列出的所有文件（mods/config/shaderpacks 等）
// 每个文件的路径相对游戏目录（如 mods/xxx.jar），下载到版本目录对应位置
async function downloadModpackFiles(versionsDir: string, onProgress?: (done: number, total: number, name: string, speed: number, bytesDone: number, bytesTotal: number, threads: number) => void, onCancel?: () => boolean, initialDone: number = 0, initialBytesDone: number = 0): Promise<{ ok: boolean; downloaded: number; skipped: number; failed: number; error?: string; failedFiles?: string[]; bytesDone: number }> {
  const idxPath = findModrinthIndex(versionsDir)
  if (!idxPath) return { ok: true, downloaded: 0, skipped: 0, failed: 0 }
  let index: any
  try {
    index = JSON.parse(fs.readFileSync(idxPath, 'utf-8'))
  } catch (e) {
    return { ok: false, downloaded: 0, skipped: 0, failed: 0, error: mt('mc.cannotParseModrinthIndex') }
  }
  const files = index.files || []
  if (files.length === 0) return { ok: true, downloaded: 0, skipped: 0, failed: 0 }

  let downloaded = 0
  let skipped = 0
  let failed = 0
  const failedFiles: string[] = []
  const total = files.length
  let done = initialDone

  // 字节级进度跟踪
  const expectedBytesTotal = files.reduce((sum: number, f: any) => sum + (f.fileSize || 0), 0)
  const speedTrackStart = Date.now()
  let lastSpeedReport = 0

  // ============ 进度模型（保证单调不回退）============
  // completedBytes：已确认完成的字节（磁盘已有且校验通过 / 下载并校验通过）
  // inflight：每个正在下载的文件当前已下载字节（key 为文件索引）
  // 展示值 = completedBytes + 所有 inflight 之和，且强制不小于上一次上报值
  let completedBytes = Math.min(Math.max(0, initialBytesDone), expectedBytesTotal)
  let lastReportedBytes = completedBytes
  const inflightBytes = new Map<number, number>()
  const inflightThreads = new Map<number, number>()
  let currentName = ''

  const report = (force = false) => {
    if (!onProgress) return
    const now = Date.now()
    if (!force && now - lastSpeedReport < 400) return
    let reportedBytes = completedBytes
    for (const value of inflightBytes.values()) reportedBytes += value
    if (reportedBytes > expectedBytesTotal) reportedBytes = expectedBytesTotal
    // 强制单调：任何情况下都不允许上报值小于上一次
    if (reportedBytes < lastReportedBytes) reportedBytes = lastReportedBytes
    lastReportedBytes = reportedBytes
    const elapsed = (now - speedTrackStart) / 1000
    const speed = elapsed > 0 ? Math.round(reportedBytes / elapsed) : 0
    let threads = 0
    for (const t of inflightThreads.values()) threads += t
    onProgress?.(done, total, currentName, speed, reportedBytes, expectedBytesTotal, Math.max(1, threads))
    lastSpeedReport = now
  }

  // 清理上次中断残留的临时分片，避免占用磁盘与误判
  // 分片数由 download-utils 决定，最多可达 128 块（CHUNK_MAX），这里一并清理
  const cleanStaleTmp = (destPath: string) => {
    try {
      for (let i = 0; i < 128; i++) {
        const p = `${destPath}.tmp.part${i}`
        if (fs.existsSync(p)) fs.unlinkSync(p)
      }
      if (fs.existsSync(`${destPath}.tmp`)) fs.unlinkSync(`${destPath}.tmp`)
    } catch {}
  }

  const processFile = async (file: any, idx: number) => {
    const relPath = (file.path || '').replace(/^\/+/, '')
    if (!relPath) return
    const env = file.env || {}
    if (env.client === 'unsupported' && env.server === 'required') return

    const destPath = path.join(versionsDir, relPath)
    const destDir = path.dirname(destPath)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    const fileSize = file.fileSize || 0
    const baseName = path.basename(relPath)

    // 已存在则校验
    if (fs.existsSync(destPath)) {
      let valid = false
      if (file.fileSize) {
        valid = fs.statSync(destPath).size === file.fileSize
      } else if (file.hashes?.sha1) {
        valid = await sha1FileAsync(destPath) === file.hashes.sha1
      }
      if (valid) {
        skipped++
        done++
        completedBytes += fileSize
        currentName = baseName
        report(true)
        return
      }
    }

    cleanStaleTmp(destPath)

    // 每个下载地址都展开成候选列表：镜像开启时"镜像优先、官方兜底"
    const rawUrls: string[] = (file.downloads && file.downloads.length > 0) ? file.downloads : []
    const urls: string[] = []
    for (const u of rawUrls) {
      for (const c of modrinthCandidates(u)) {
        if (!urls.includes(c)) urls.push(c)
      }
    }
    if (urls.length === 0) {
      failed++
      failedFiles.push(relPath)
      done++
      // 失败文件不计入完成字节：否则进度虚高，且重试时会从错误的高位继续
      currentName = baseName
      report(true)
      return
    }

    // 单源并发均衡：不同文件从不同的候选链路开始下载。
    // 这类 CDN 按"单条连接"限速，若所有并发文件都从同一个地址（镜像）起步，
    // 几十条连接会全压在镜像上被限速、而官方 CDN 空闲；轮转后两条链路各分一半。
    const rotateBy = urls.length > 1 ? idx % urls.length : 0
    const candidateUrls = rotateBy > 0 ? urls.slice(rotateBy).concat(urls.slice(0, rotateBy)) : urls

    let ok = false
    for (const url of candidateUrls) {
      try {
        // Modrinth CDN 直链无需重定向解析，跳过省一次 HTTP 请求。
        // 但注意 cdn.modrinth.com 实际返回 307 跳转到真实存储，
        // 分块下载需要稳定的最终地址（8 个分块各自重定向会多 8 次往返），
        // 因此分块模式下强制预解析（结果有缓存，不会重复请求）
        const useChunked = fileSize >= 16 * 1024 * 1024
        const isDirectCdn = url.includes('cdn.modrinth.com') || url.includes('mod.mcimirror.top') || url.includes('mediafire.com') || url.includes('github.com')
        let finalUrl = url
        if (!isDirectCdn || useChunked) {
          try {
            finalUrl = await resolveRedirectUrl(url)
          } catch {}
        }

        const tmpPath = destPath + '.tmp'
        currentName = baseName
        // 注意 downloadFile 的参数顺序：
        //   (url, dest, onProgress, onCancel, maxRetries, onPauseCheck,
        //    onRequestCreated, followRedirects, knownTotalSize, expectedSha1, altUrls)
        // 这里第 10 个参数（expectedSha1）传 undefined —— 完整性由本函数下方的
        // 大小 + sha1 双重校验负责；第 11 个参数传候选链路列表，让分块下载
        // 能把并发摊到"镜像 + 官方"两条链路上（之前错把 urls 传到 expectedSha1，
        // 导致 SHA-1 校验抛异常、每个文件都被误判失败，且多链路完全不生效）。
        await downloadFile(finalUrl, tmpPath, (fileProgress, fileSpeed, fileThreads) => {
          const currentBytes = fileSize > 0
            ? Math.min(fileSize, Math.round((Math.max(0, Math.min(100, fileProgress)) / 100) * fileSize))
            : 0
          // 覆盖式写入（不累加）：重试/换源时数值自然回落，不会重复计数
          inflightBytes.set(idx, currentBytes)
          inflightThreads.set(idx, fileThreads || 1)
          report()
        }, undefined, useChunked ? 5 : 3, undefined, undefined, true, fileSize, undefined, candidateUrls)

        // 强制校验大小：连接被提前关闭时下载会"成功返回"但文件是截断的，
        // 没有这一步，残缺文件会被当成完整文件写进整合包（表现为进游戏崩 mods）
        if (fileSize > 0) {
          let actualSize = 0
          try { actualSize = fs.statSync(tmpPath).size } catch {}
          if (actualSize !== fileSize) {
            console.warn(`[Main] 文件大小不符: ${relPath}，期望 ${fileSize} 实际 ${actualSize}`)
            try { fs.unlinkSync(tmpPath) } catch {}
            inflightBytes.delete(idx)
            inflightThreads.delete(idx)
            report(true)
            continue
          }
        }

        if (file.hashes?.sha1) {
          const actualSha1 = await sha1FileAsync(tmpPath)
          if (actualSha1 !== file.hashes.sha1) {
            console.warn(`[Main] 文件校验失败(sha1): ${relPath}，期望 ${file.hashes.sha1} 实际 ${actualSha1}`)
            try { fs.unlinkSync(tmpPath) } catch {}
            // 清空该文件的在途进度，换源重下时不会污染总量
            inflightBytes.delete(idx)
            inflightThreads.delete(idx)
            report(true)
            continue
          }
        }
        try {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
        } catch (e) {
          try { fs.rmSync(destPath, { force: true }) } catch {}
        }
        fs.renameSync(tmpPath, destPath)
        ok = true
        break
      } catch (e: any) {
        console.warn(`[Main] 整合包文件下载失败: ${url}`, e?.message || e)
        try { if (fs.existsSync(destPath + '.tmp')) fs.unlinkSync(destPath + '.tmp') } catch {}
        inflightBytes.delete(idx)
        inflightThreads.delete(idx)
      }
    }
    // 该文件彻底结束：从在途集合移除，转入已完成
    inflightBytes.delete(idx)
    inflightThreads.delete(idx)
    if (ok) {
      downloaded++
      completedBytes += fileSize
    } else {
      failed++
      failedFiles.push(relPath)
    }
    done++
    currentName = baseName
    report(true)
  }

  // 按文件大小排序：小文件优先下载，让进度前期快速推进
  // 大文件排最后，避免它们占满连接额度拖慢前面的小文件
  files.sort((a: any, b: any) => (a.fileSize || 0) - (b.fileSize || 0))

  // 并发 worker 数：连接数由 download-utils 的全局 + 单源预算统一控制，
  // 这里可以多开一些，让小文件（握手开销占主导）尽快铺满带宽。
  // 实测这类源按"单条连接"限速(~20KB/s)，所以并发文件数越多总吞吐越高：
  // 跟随用户线程数设置（下限 8、上限 128）。上限必须能跟上线程设置，
  // 否则用户把线程从 64 往上调时这一层会成为瓶颈、调了也没效果。
  const MAX_CONCURRENT_FILES = Math.max(8, Math.min(128, getDownloadThreads()))
  let cursor = 0
  const worker = async () => {
    while (cursor < files.length) {
      const idx = cursor++
      if (onCancel && onCancel()) break
      await processFile(files[idx], idx)
    }
  }
  const workers = Array(Math.min(MAX_CONCURRENT_FILES, files.length)).fill(null).map(worker)
  await Promise.all(workers)

  // 收尾：把剩余在途计数清零并上报最终值，保证进度条走到该阶段的终点
  inflightBytes.clear()
  inflightThreads.clear()
  report(true)

  return { ok: failed === 0, downloaded, skipped, failed, failedFiles, bytesDone: lastReportedBytes }
}

// downloadFile, tryParallelDownload, downloadFileWithRetry 已迁移至 download-utils.ts
// 通过 import { downloadFile } from './download-utils' 使用

// 内部函数：下载并安装基础游戏文件（版本json + client jar + 依赖库 + 资源）
// 供 download-version 与整合包安装共用
async function installBaseVersion(versionId: string, versionUrl: string, targetDirName: string, isPaused: () => boolean, sendProgress: (type: string, progress: number) => void): Promise<void> {
  const minecraftDir = getMinecraftDir()
  const versionsDir = path.join(minecraftDir, 'versions', targetDirName)

  if (!fs.existsSync(versionsDir)) {
    fs.mkdirSync(versionsDir, { recursive: true })
  }

  await ensureAutoProbe()

  const versionJsonPath = path.join(versionsDir, `${targetDirName}.json`)
  const clientJarPath = path.join(versionsDir, `${targetDirName}.jar`)

  // 生成带国内镜像的 URL 列表（优先官方源，镜像作为 fallback）
  function getMirrorUrls(originalUrl: string, type: 'json' | 'jar'): string[] {
    const urls: string[] = [originalUrl]
    if (type === 'json') {
      if (originalUrl.includes('launchermeta.mojang.com')) {
        urls.push(originalUrl.replace('launchermeta.mojang.com', 'bmclapi2.bangbang93.com'))
        urls.push(originalUrl.replace('launchermeta.mojang.com', 'download.mcbbs.net'))
      }
      if (originalUrl.includes('piston-meta.mojang.com')) {
        urls.push(originalUrl.replace('piston-meta.mojang.com', 'bmclapi2.bangbang93.com'))
      }
    } else if (type === 'jar') {
      if (originalUrl.includes('launcher.mojang.com')) {
        urls.push(originalUrl.replace('launcher.mojang.com', 'bmclapi2.bangbang93.com'))
        urls.push(originalUrl.replace('launcher.mojang.com', 'download.mcbbs.net'))
      }
      if (originalUrl.includes('piston-data.mojang.com')) {
        urls.push(originalUrl.replace('piston-data.mojang.com', 'bmclapi2.bangbang93.com'))
      }
    }
    return orderByDownloadSource([...new Set(urls)])
  }

  const downloadWithMirrors = async (url: string, dest: string, type: 'json' | 'jar', sendType: string) => {
    const mirrorUrls = getMirrorUrls(url, type)
    let lastError: any = null
    for (let i = 0; i < mirrorUrls.length; i++) {
      try {
        console.log(`[Main] 尝试下载${type} (${i + 1}/${mirrorUrls.length}): ${mirrorUrls[i]}`)
        await downloadFile(mirrorUrls[i], dest, (progress) => {
          sendProgress(sendType, progress)
        }, undefined, 1, isPaused)
        return true
      } catch (err: any) {
        lastError = err
        console.warn(`[Main] ${type}下载失败 (${i + 1}/${mirrorUrls.length}):`, err?.message || err)
        if (i < mirrorUrls.length - 1) {
          console.log(`[Main] 尝试下一个镜像源...`)
        }
      }
    }
    throw lastError || new Error(mt('mc.allTypeSourcesFailed', { type }))
  }

  // 发送初始进度事件，确保前端能收到下载开始的通知
  sendProgress('json', 0)

  // 版本配置已存在且可解析时跳过下载（避免重复下载并覆盖已合并的加载器 json）
  const versionJsonExists = fs.existsSync(versionJsonPath) && (() => {
    try { JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8')); return true } catch { return false }
  })()

  if (!versionJsonExists) {
    await downloadWithMirrors(versionUrl, versionJsonPath, 'json', 'json')
    console.log(`[Main] 版本 JSON 下载完成`)
  } else {
    console.log(`[Main] 版本 JSON 已存在，跳过下载`)
  }

  const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))

  // 若现有 json 不含客户端下载信息（如加载器已合并的 json 缺失 downloads），
  // 从官方 json 获取客户端下载地址，避免漏下载 jar 导致启动时主类找不到
  let clientUrl: string | undefined = versionJson.downloads?.client?.url
  if (!clientUrl) {
    const vanillaJsonPath = path.join(tmpdir(), `zncl_vanilla_${targetDirName}_${Date.now()}.json`)
    try {
      await downloadWithMirrors(versionUrl, vanillaJsonPath, 'json', 'json')
      const vanillaJson = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf-8'))
      clientUrl = vanillaJson.downloads?.client?.url
    } catch (e: any) {
      console.warn(`[Main] 获取客户端下载信息失败:`, e?.message || e)
    } finally {
      try { fs.unlinkSync(vanillaJsonPath) } catch {}
    }
  }

  if (clientUrl) {
    // 客户端 jar 已存在且大小合理时跳过下载
    const clientJarExists = fs.existsSync(clientJarPath) && fs.statSync(clientJarPath).size >= 1024 * 1024
    if (!clientJarExists) {
      await downloadWithMirrors(clientUrl, clientJarPath, 'jar', 'jar')
      console.log(`[Main] 客户端 JAR 下载完成`)
    } else {
      console.log(`[Main] 客户端 JAR 已存在，跳过下载`)
    }
  } else {
    console.warn(`[Main] 无法获取客户端下载地址: ${targetDirName}`)
  }

  const librariesDir = path.join(minecraftDir, 'libraries')
  if (!fs.existsSync(librariesDir)) {
    fs.mkdirSync(librariesDir, { recursive: true })
  }

  if (versionJson.libraries) {
    const allowedLibs = versionJson.libraries.filter((lib: any) => isLibAllowed(lib))
    let downloadedLibs = 0
    const totalLibs = allowedLibs.length

    const libraryUrlBases = orderByDownloadSource([
      'https://libraries.minecraft.net/',
      'https://bmclapi2.bangbang93.com/maven/',
      'https://maven.aliyun.com/repository/public/'
    ])

    const downloadLibWithFallback = async (libPath: string, libUrl: string, sha1?: string) => {
      const pathPart = libUrl.replace('https://libraries.minecraft.net/', '')
      for (let baseIndex = 0; baseIndex < libraryUrlBases.length; baseIndex++) {
        const url = `${libraryUrlBases[baseIndex]}${pathPart}`
        try {
          // 带 SHA-1 校验：镜像/官方中途断流产生的截断 jar 会被挡下并换源重试
          await downloadFile(url, libPath, undefined, undefined, 3, isPaused, undefined, true, 0, sha1)
          return true
        } catch (err: any) {
          if (err.message && err.message.includes('状态码: 404')) {
            continue
          }
          if (baseIndex === libraryUrlBases.length - 1) {
            return false
          }
        }
      }
      return false
    }

    // 构建下载任务列表（库 jar + natives），然后并发下载提速
    const libTasks: { libPath: string; libUrl: string; sha1?: string }[] = []
    for (const lib of allowedLibs) {
      if (lib.downloads && lib.downloads.artifact) {
        libTasks.push({ libPath: path.join(librariesDir, lib.downloads.artifact.path), libUrl: lib.downloads.artifact.url, sha1: lib.downloads.artifact.sha1 })
      }
      if (lib.natives && lib.downloads && lib.downloads.classifiers) {
        const nativesKey = lib.natives
        const nativeKey = nativesKey[CURRENT_OS_NAME]
          || nativesKey[`${CURRENT_OS_NAME}-64`]
          || nativesKey[`${CURRENT_OS_NAME}-32`]
          || (CURRENT_OS_NAME === 'osx' ? (nativesKey.mac || nativesKey['mac-64'] || nativesKey['mac-32']) : null)
        if (nativeKey) {
          const arch = process.arch === 'x64' ? '64' : '32'
          const nativeClassifier = nativeKey.replace('${arch}', arch)
          const nativeArtifact = lib.downloads.classifiers[nativeClassifier]
          if (nativeArtifact) {
            libTasks.push({ libPath: path.join(librariesDir, nativeArtifact.path), libUrl: nativeArtifact.url, sha1: nativeArtifact.sha1 })
          }
        }
      }
    }

    // 并发下载库文件（默认 16 个并行）
    const LIB_MAX_CONCURRENT = 16
    let libCursor = 0
    let libFailedCount = 0
    const libFailedTasks: typeof libTasks = []
    const libWorker = async () => {
      while (libCursor < libTasks.length) {
        while (isPaused()) {
          await new Promise(resolve => setTimeout(resolve, 200))
        }
        const task = libTasks[libCursor++]
        if (!task) break

        const libDir = path.dirname(task.libPath)
        if (!fs.existsSync(libDir)) {
          fs.mkdirSync(libDir, { recursive: true })
        }

        if (!fs.existsSync(task.libPath)) {
          try {
            const success = await downloadLibWithFallback(task.libPath, task.libUrl, task.sha1)
            if (!success) {
              console.warn(`[Main] 下载库失败(已尝试所有源): ${task.libPath}`)
              libFailedTasks.push(task)
            }
          } catch (err) {
            libFailedTasks.push(task)
            console.warn(`[Main] 下载库失败: ${task.libPath}`, err)
          }
        }

        downloadedLibs++
        const libProgress = Math.round((downloadedLibs / totalLibs) * 100)
        sendProgress('libraries', libProgress)
      }
    }
    await Promise.all(Array(Math.min(LIB_MAX_CONCURRENT, libTasks.length)).fill(null).map(libWorker))

    // 全局重试失败的库（最多 2 轮）
    if (libFailedTasks.length > 0) {
      for (let retryRound = 0; retryRound < 2 && libFailedTasks.length > 0; retryRound++) {
        console.log(`[Main] 依赖库全局重试 ${retryRound + 1}/2，${libFailedTasks.length} 个待重试...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        const stillFailed: typeof libTasks = []
        let retryCursor = 0
        const retryWorker = async () => {
          while (retryCursor < libFailedTasks.length) {
            const task = libFailedTasks[retryCursor++]
            if (!task) break
            if (fs.existsSync(task.libPath) && fs.statSync(task.libPath).size > 0 && (!task.sha1 || (await sha1FileAsync(task.libPath)) === task.sha1)) continue
            try {
              const success = await downloadLibWithFallback(task.libPath, task.libUrl, task.sha1)
              if (!success) stillFailed.push(task)
            } catch { stillFailed.push(task) }
          }
        }
        await Promise.all(Array(Math.min(LIB_MAX_CONCURRENT, libFailedTasks.length)).fill(null).map(retryWorker))
        libFailedTasks.length = 0
        libFailedTasks.push(...stillFailed)
      }
      libFailedCount = libFailedTasks.length
    }

    if (libFailedCount > 0) {
      console.warn(`[Main] 依赖库下载完成，${libFailedCount} 个失败`)
    }
  }

  if (versionJson.assetIndex) {
    const assetsDir = path.join(minecraftDir, 'assets')
    const indexesDir = path.join(assetsDir, 'indexes')
    if (!fs.existsSync(indexesDir)) {
      fs.mkdirSync(indexesDir, { recursive: true })
    }

    const indexFile = path.join(indexesDir, `${versionJson.assetIndex.id}.json`)
    if (!fs.existsSync(indexFile)) {
      await downloadFile(versionJson.assetIndex.url, indexFile, undefined, undefined, 3, isPaused)
      console.log(`[Main] 资源索引下载完成`)
    }

    try {
      const assetIndexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'))
      if (assetIndexData.objects) {
        const objectsDir = path.join(assetsDir, 'objects')
        if (!fs.existsSync(objectsDir)) {
          fs.mkdirSync(objectsDir, { recursive: true })
        }

        const assetObjects = Object.entries(assetIndexData.objects)
        const totalAssets = assetObjects.length
        const assetUrlBases = orderByDownloadSource([
          'https://resources.download.minecraft.net/',
          'https://bmclapi2.bangbang93.com/assets/',
          'https://download.mcbbs.net/assets/'
        ])

        console.log(`[Main] 开始下载 ${totalAssets} 个资源文件...`)

        const assetsToDownload: { hash: string; virtualPath: string; path: string; size: number }[] = []

        for (const [virtualPath, assetInfo] of assetObjects) {
          const info = assetInfo as { hash: string; size: number }
          const realHash = info.hash
          const subDir = realHash.substring(0, 2)
          const objectDir = path.join(objectsDir, subDir)
          if (!fs.existsSync(objectDir)) {
            fs.mkdirSync(objectDir, { recursive: true })
          }

          const objectPath = path.join(objectDir, realHash)
          if (!fs.existsSync(objectPath) || fs.statSync(objectPath).size !== info.size) {
            assetsToDownload.push({
              hash: realHash,
              virtualPath,
              path: objectPath,
              size: info.size
            })
          }
        }

        console.log(`[Main] 需要下载 ${assetsToDownload.length} 个资源文件`)

        // 资源多为小文件，并发上限调高以接近 PCL 的下载速度
        const maxConcurrent = 24
        let completedCount = 0
        const downloadQueue = [...assetsToDownload]
        const assetFailedItems: typeof assetsToDownload = []

        const downloadAssetWithFallback = async (item: typeof assetsToDownload[0]) => {
          const subDir = item.hash.substring(0, 2)
          let all404 = true
          for (let baseIndex = 0; baseIndex < assetUrlBases.length; baseIndex++) {
            const base = assetUrlBases[baseIndex]
            const usesSubDir = base.includes('minecraft.net')
            const url = usesSubDir
              ? `${base}${subDir}/${item.hash}`
              : `${base}${item.hash}`
            try {
              // 资源对象以 SHA-1 命名，下载后强制校验哈希：
              // 服务器中途断流会产出「截断但看起来成功」的文件，不校验就会留下坏 PNG/坏语言文件
              await downloadFile(url, item.path, undefined, undefined, 3, isPaused, undefined, true, item.size, item.hash)
              return true
            } catch (err: any) {
              if (err.message && err.message.includes('404')) {
                continue
              }
              all404 = false
              if (baseIndex === assetUrlBases.length - 1) {
                return false
              }
            }
          }
          if (all404) {
            console.warn(`[Main] 资源在所有源都不存在(404): ${item.hash}，跳过`)
          }
          return false
        }

        const downloadNext = async () => {
          while (downloadQueue.length > 0) {
            while (isPaused()) {
              await new Promise(resolve => setTimeout(resolve, 200))
            }

            const item = downloadQueue.pop()
            if (!item) break

            const ok = await downloadAssetWithFallback(item)
            if (!ok) {
              // 下载报错，但文件可能已完整落盘；必须按 SHA-1 复核，坏文件不能放过
              const recovered = fs.existsSync(item.path)
                && fs.statSync(item.path).size === item.size
                && (await sha1FileAsync(item.path)) === item.hash
              if (!recovered) assetFailedItems.push(item)
            }

            completedCount++
            if (completedCount % 50 === 0 || completedCount === assetsToDownload.length) {
              const assetProgress = Math.round((completedCount / totalAssets) * 100)
              console.log(`[Main] 资源下载进度: ${completedCount}/${totalAssets} (${assetProgress}%)`)
              sendProgress('assets', assetProgress)
            }
          }
        }

        const workers = Array(Math.min(maxConcurrent, assetsToDownload.length)).fill(null).map(downloadNext)
        await Promise.all(workers)

        // 全局重试失败的资源文件（最多 2 轮）
        if (assetFailedItems.length > 0) {
          for (let retryRound = 0; retryRound < 2 && assetFailedItems.length > 0; retryRound++) {
            console.log(`[Main] 资源全局重试 ${retryRound + 1}/2，${assetFailedItems.length} 个待重试...`)
            await new Promise(resolve => setTimeout(resolve, 2000))
            const stillFailed: typeof assetsToDownload = []
            let retryCursor = 0
            const retryWorker = async () => {
              while (retryCursor < assetFailedItems.length) {
                const item = assetFailedItems[retryCursor++]
                if (!item) break
                if (fs.existsSync(item.path) && (await sha1FileAsync(item.path)) === item.hash) continue
                const ok = await downloadAssetWithFallback(item)
                if (!ok) stillFailed.push(item)
              }
            }
            await Promise.all(Array(Math.min(maxConcurrent, assetFailedItems.length)).fill(null).map(retryWorker))
            assetFailedItems.length = 0
            assetFailedItems.push(...stillFailed)
          }
          if (assetFailedItems.length > 0) {
            console.warn(`[Main] 资源下载完成，${assetFailedItems.length} 个失败（已重试）`)
          }
        }

        console.log(`[Main] 资源文件下载完成`)
      }
    } catch (err) {
      console.warn(`[Main] 下载资源文件失败:`, err)
    }
  }
}

// 轻量版基础游戏下载：只下载 jar + JSON，不下载 libraries/assets（延迟到启动时补全）
// 用于整合包安装阶段，大幅缩短安装时间
async function installBaseVersionLight(versionId: string, versionUrl: string, targetDirName: string, isPaused: () => boolean, sendProgress: (type: string, progress: number) => void): Promise<void> {
  const minecraftDir = getMinecraftDir()
  const versionsDir = path.join(minecraftDir, 'versions', targetDirName)
  if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true })

  const versionJsonPath = path.join(versionsDir, `${targetDirName}.json`)
  const clientJarPath = path.join(versionsDir, `${targetDirName}.jar`)

  // 生成带国内镜像的 URL 列表
  function getMirrorUrls(originalUrl: string, type: 'json' | 'jar'): string[] {
    const urls: string[] = [originalUrl]
    if (type === 'json') {
      if (originalUrl.includes('launchermeta.mojang.com')) {
        urls.push(originalUrl.replace('launchermeta.mojang.com', 'bmclapi2.bangbang93.com'))
        urls.push(originalUrl.replace('launchermeta.mojang.com', 'download.mcbbs.net'))
      }
      if (originalUrl.includes('piston-meta.mojang.com')) {
        urls.push(originalUrl.replace('piston-meta.mojang.com', 'bmclapi2.bangbang93.com'))
      }
    } else if (type === 'jar') {
      if (originalUrl.includes('launcher.mojang.com')) {
        urls.push(originalUrl.replace('launcher.mojang.com', 'bmclapi2.bangbang93.com'))
        urls.push(originalUrl.replace('launcher.mojang.com', 'download.mcbbs.net'))
      }
      if (originalUrl.includes('piston-data.mojang.com')) {
        urls.push(originalUrl.replace('piston-data.mojang.com', 'bmclapi2.bangbang93.com'))
      }
    }
    return orderByDownloadSource([...new Set(urls)])
  }

  const downloadWithMirrors = async (url: string, dest: string, type: 'json' | 'jar', sendType: string) => {
    const mirrorUrls = getMirrorUrls(url, type)
    let lastError: any = null
    for (let i = 0; i < mirrorUrls.length; i++) {
      try {
        await downloadFile(mirrorUrls[i], dest, (progress) => sendProgress(sendType, progress), undefined, 1, isPaused)
        return true
      } catch (err: any) {
        lastError = err
        if (i < mirrorUrls.length - 1) {
          console.warn(`[Main] ${type}下载失败 (${i + 1}/${mirrorUrls.length})，尝试下一个源...`)
        }
      }
    }
    throw lastError || new Error(mt('mc.allTypeSourcesFailed', { type }))
  }

  sendProgress('json', 0)

  // 下载版本 JSON（如果不存在）
  if (!fs.existsSync(versionJsonPath)) {
    await downloadWithMirrors(versionUrl, versionJsonPath, 'json', 'json')
    console.log(`[Main] 版本 JSON 下载完成`)
  }

  const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))

  // 获取客户端下载地址
  let clientUrl: string | undefined = versionJson.downloads?.client?.url
  if (!clientUrl) {
    // JSON 无下载信息，从官方重新获取
    const vanillaJsonPath = path.join(tmpdir(), `zncl_vanilla_${targetDirName}_${Date.now()}.json`)
    try {
      await downloadWithMirrors(versionUrl, vanillaJsonPath, 'json', 'json')
      const vanillaJson = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf-8'))
      clientUrl = vanillaJson.downloads?.client?.url
    } catch (e: any) {
      console.warn(`[Main] 获取客户端下载信息失败:`, e?.message || e)
    } finally {
      try { fs.unlinkSync(vanillaJsonPath) } catch {}
    }
  }

  // 下载客户端 jar（如果不存在或太小）
  if (clientUrl) {
    const clientJarExists = fs.existsSync(clientJarPath) && fs.statSync(clientJarPath).size >= 1024 * 1024
    if (!clientJarExists) {
      await downloadWithMirrors(clientUrl, clientJarPath, 'jar', 'jar')
      console.log(`[Main] 客户端 JAR 下载完成`)
    }
  } else {
    console.warn(`[Main] 无法获取客户端下载地址: ${targetDirName}`)
  }
}

// 下载 Minecraft 版本（支持自定义目录名）
ipcMain.handle('download-version', async (event, versionId: string, versionUrl: string, directoryName?: string) => {
  // 国内发行版不提供本体获取渠道
  if (!__ENABLE_MC_DOWNLOAD__) {
    return { success: false, error: mt('mc.downloadDisabled') }
  }
  try {
    const targetDirName = directoryName || versionId
    console.log(`[Main] 开始下载版本: ${versionId} -> 目录: ${targetDirName}`)

    // 检查是否已有该目录在下载
    if (activeVersionDownloads.has(targetDirName)) {
      return { success: false, error: mt('mc.versionAlreadyDownloading', { version: targetDirName }) }
    }

    const downloadState: VersionDownloadState = {
      versionId: targetDirName,
      paused: false,
      abortController: null,
      currentRequest: null
    }
    activeVersionDownloads.set(targetDirName, downloadState)

    const isPaused = () => downloadState.paused || false

    const minecraftDir = getMinecraftDir()
    const versionsDir = path.join(minecraftDir, 'versions', targetDirName)

    if (!fs.existsSync(versionsDir)) {
      fs.mkdirSync(versionsDir, { recursive: true })
    }

    const versionJsonPath = path.join(versionsDir, `${targetDirName}.json`)
    const clientJarPath = path.join(versionsDir, `${targetDirName}.jar`)

    // 完整检查：需要同时存在 JSON 和 JAR 文件
    if (fs.existsSync(versionJsonPath) && fs.existsSync(clientJarPath)) {
      try {
        const testRead = fs.readFileSync(versionJsonPath, 'utf-8')
        const versionJson = JSON.parse(testRead)

        // 检查 JAR 文件大小是否合理（至少 1MB）
        const jarStats = fs.statSync(clientJarPath)
        if (jarStats.size < 1024 * 1024) {
          console.warn(`[Main] JAR 文件过小，重新下载: ${targetDirName}`)
        } else {
          console.log(`[Main] 版本 ${targetDirName} 已存在且完整，跳过下载`)
          activeVersionDownloads.delete(targetDirName)
          return { success: true, message: mt('mc.versionInstalled', { version: targetDirName }), alreadyInstalled: true }
        }
      } catch (err) {
        console.warn(`[Main] 版本文件存在但无法读取: ${versionJsonPath}`)
      }
    }

    const sendProgress = (type: string, progress: number) => {
      win?.webContents.send('download-progress', { versionId: targetDirName, type, progress })
    }

    await installBaseVersion(versionId, versionUrl, targetDirName, isPaused, sendProgress)

    activeVersionDownloads.delete(targetDirName)
    win?.webContents.send('download-complete', { versionId: targetDirName, success: true })
    return { success: true, message: mt('mc.versionDownloadComplete', { version: targetDirName }) }
  } catch (error: any) {
    console.error('[Main] 下载版本失败:', error)
    const targetDirName = directoryName || versionId
    activeVersionDownloads.delete(targetDirName)
    win?.webContents.send('download-complete', { versionId: targetDirName, success: false, error: error.message || mt('mc.downloadFailedShort') })
    return { success: false, error: error.message || mt('mc.downloadFailedShort') }
  }
})

// 暂停下载
ipcMain.handle('pause-download', async (event, versionId: string) => {
  try {
    const download = activeVersionDownloads.get(versionId)
    if (!download) {
      return { success: false, error: mt('mc.noActiveDownloadTask') }
    }
    
    download.paused = true
    console.log(`[Main] 暂停下载: ${versionId}`)
    
    win?.webContents.send('download-paused', { versionId })
    return { success: true }
  } catch (error: any) {
    console.error('[Main] 暂停下载失败:', error)
    return { success: false, error: error.message || mt('mc.pauseFailed') }
  }
})

// 继续下载
ipcMain.handle('resume-download', async (event, versionId: string) => {
  try {
    const download = activeVersionDownloads.get(versionId)
    if (!download) {
      return { success: false, error: mt('mc.noPausedDownloadTask') }
    }
    
    download.paused = false
    console.log(`[Main] 继续下载: ${versionId}`)
    
    win?.webContents.send('download-resumed', { versionId })
    return { success: true }
  } catch (error: any) {
    console.error('[Main] 继续下载失败:', error)
    return { success: false, error: error.message || mt('mc.resumeFailed') }
  }
})

// 取消下载
ipcMain.handle('cancel-download', async (event, versionId: string) => {
  try {
    const download = activeVersionDownloads.get(versionId)
    if (!download) {
      return { success: false, error: mt('mc.noActiveDownloadTask') }
    }
    
    if (download.currentRequest) {
      download.currentRequest.destroy()
    }
    activeVersionDownloads.delete(versionId)
    console.log(`[Main] 取消下载: ${versionId}`)
    
    win?.webContents.send('download-cancelled', { versionId })
    return { success: true }
  } catch (error: any) {
    console.error('[Main] 取消下载失败:', error)
    return { success: false, error: error.message || mt('mc.cancelFailed') }
  }
})

// 强制重置所有下载状态（应急按钮）
ipcMain.handle('force-reset-downloads', async (event) => {
  try {
    console.log('[Main] 执行强制重置下载状态...')
    
    // 设置全局取消标志 - 这将取消所有正在进行的下载
    setForceCancelAllDownloads(true)
    
    // 销毁所有版本下载
    for (const [versionId, download] of activeVersionDownloads) {
      if (download.currentRequest) {
        try {
          download.currentRequest.destroy()
        } catch (e) {
          console.warn(`[Main] 销毁版本下载请求时出错: ${versionId}`, e)
        }
      }
    }
    activeVersionDownloads.clear()
    
    // 取消所有模组下载
    for (const [modId, download] of activeModDownloads) {
      if (download.currentRequest) {
        try {
          download.currentRequest.destroy()
        } catch (e) {
          console.warn(`[Main] 销毁模组下载请求时出错: ${modId}`, e)
        }
      }
    }
    activeModDownloads.clear()
    
    // 取消所有整合包下载
    for (const [modId, download] of activeModpackDownloads) {
      if (download.currentRequest) {
        try {
          download.currentRequest.destroy()
        } catch (e) {
          console.warn(`[Main] 销毁整合包下载请求时出错: ${modId}`, e)
        }
      }
      // 清理未完成的 zip 文件
      if (download.zipPath && fs.existsSync(download.zipPath)) {
        try {
          fs.unlinkSync(download.zipPath)
        } catch (e) {
          console.warn('[Main] 删除未完成的整合包文件时出错:', e)
        }
      }
    }
    activeModpackDownloads.clear()
    
    // 取消 Java 下载
    if (currentJavaDownload) {
      try {
        currentJavaDownload.abort()
      } catch (e) {
        console.warn('[Main] 取消Java下载时出错:', e)
      }
      currentJavaDownload = null
    }
    
    // 停止游戏进程
    if (gameProcess) {
      try {
        gameProcess.kill('SIGTERM')
      } catch (e) {
        console.warn('[Main] 停止游戏进程时出错:', e)
      }
      gameProcess = null
    }
    
    // 延迟重置全局取消标志，确保所有下载都有机会检测到取消
    setTimeout(() => {
      setForceCancelAllDownloads(false)
    }, 5000)
    
    console.log('[Main] 下载状态已强制重置')
    return { success: true, message: mt('mc.allDownloadsReset') }
  } catch (error: any) {
    console.error('[Main] 强制重置下载状态失败:', error)
    setForceCancelAllDownloads(false)
    return { success: false, error: error.message || mt('mc.resetFailed') }
  }
})

// ========== 下载模组 / 资源包 / 光影包（支持版本隔离 + 真实文件名 + 完整性校验）==========
// 文件名清洗：去除 Windows 非法字符
function sanitizeFileNameSegment(name: string): string {
  return String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'file'
}

// 真正取消下载：销毁底层 HTTP 请求并标记 cancelled，
// 由 download-mod / install-modpack 的异常处理识别后返回“下载已取消”结果
ipcMain.handle('cancel-mod-download', (_event, modId: string) => {
  const mod = activeModDownloads.get(modId)
  if (mod?.currentRequest) {
    mod.cancelled = true
    try { mod.currentRequest.destroy() } catch {}
    return { success: true }
  }
  const mp = activeModpackDownloads.get(modId)
  if (mp?.currentRequest) {
    mp.cancelled = true
    try { mp.currentRequest.destroy() } catch {}
    return { success: true }
  }
  return { success: false }
})

ipcMain.handle('download-mod', async (event, modId: string, modName: string, downloadUrl: string, versionId: string, targetGameVersion?: string, subDir?: string, fileName?: string, expectedSize?: number, expectedSha1?: string) => {
  try {
    console.log(`[Main] 开始下载模组: ${modName}, 目标版本: ${targetGameVersion || '全局'}, 子目录: ${subDir || 'mods'}`)

    // 检查是否已有该模组在下载
    if (activeModDownloads.has(modId)) {
      return { success: false, error: mt('mc.modAlreadyDownloading', { name: modName }) }
    }

    activeModDownloads.set(modId, {
      modId,
      currentRequest: null
    })

    const minecraftDir = getMinecraftDir()
    const folderName = subDir || 'mods'
    // 版本隔离：如果有目标版本，下载到该版本的对应子目录
    const destDir = targetGameVersion
      ? path.join(minecraftDir, 'versions', targetGameVersion, folderName)
      : path.join(minecraftDir, folderName)

    // 创建目录
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    // 用 Modrinth 提供的真实文件名（含正确扩展名：模组 .jar、资源/光影包 .zip）
    // 而不是一律拼成 .jar —— .jar 的资源包/光影包不会被游戏识别
    const extName = path.extname(fileName || '')
    const fileNameFinal = (fileName && extName)
      ? sanitizeFileNameSegment(fileName)
      : `${sanitizeFileNameSegment(modName)}-${sanitizeFileNameSegment(versionId)}${folderName === 'mods' ? '.jar' : '.zip'}`
    const destPath = path.join(destDir, fileNameFinal)

    // 目标文件已存在且大小/SHA-1 与服务器声明一致：跳过下载。
    // 解决“重装同一版本整文件重下一遍”的问题，也不会碰已有文件。
    if (expectedSha1 && expectedSize && fs.existsSync(destPath)) {
      let statSize = -1
      try { statSize = fs.statSync(destPath).size } catch {}
      if (statSize === expectedSize && (await sha1FileAsync(destPath)) === expectedSha1) {
        activeModDownloads.delete(modId)
        return { success: true, skipped: true, message: mt('mc.modDownloadComplete', { name: modName }), filePath: destPath, fileName: fileNameFinal }
      }
    }

    // 预解析重定向链（Modrinth CDN 通常 2-3 层 307），减少下载往返、提升速度。
    // 镜像开启时优先解析镜像地址，失败再自动回退官方地址。
    let resolvedUrl = downloadUrl
    for (const cand of modrinthCandidates(downloadUrl)) {
      try {
        resolvedUrl = await resolveRedirectUrl(cand)
        break
      } catch (e) {
        console.warn(`[Main] 预解析重定向失败(${cand})，尝试下一个地址: ${e}`)
      }
    }

    // 先下载到同目录临时文件，校验通过后再拷贝到目标文件名：
    // 并行分块下载开始时会把目标文件删掉重建，若中途失败或 sha1 校验失败，
    // 原本已装好的同名文件会被毁掉。临时文件 + 成功后覆盖，失败则原文件保留。
    const tmpPath = path.join(destDir, `.zncl-dl-${fileNameFinal}.tmp`)

    try {
      // 下载文件（携带 Modrinth 声明的 size/sha1 做完整性校验）
      await downloadFile(resolvedUrl, tmpPath, (progress, speed, threads) => {
        console.log(`[Main] 下载模组进度: ${progress}%`)
        event.sender.send('mod-download-progress', { modId, progress, speed: speed || 0, threads: threads || 1 })
      }, undefined, 5, undefined, (req) => {
        const download = activeModDownloads.get(modId)
        if (download) {
          download.currentRequest = req
        }
      }, true, expectedSize || 0, expectedSha1, modrinthCandidates(downloadUrl))

      // 校验通过后才覆盖到目标文件名（copyFileSync 覆盖已有文件）
      fs.copyFileSync(tmpPath, destPath)
    } finally {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch {}
    }

    console.log(`[Main] 模组下载完成: ${destPath}`)
    activeModDownloads.delete(modId)

    return { success: true, message: mt('mc.modDownloadComplete', { name: modName }), filePath: destPath, fileName: fileNameFinal }
  } catch (error: any) {
    console.error('[Main] 下载模组失败:', error)
    const state = activeModDownloads.get(modId)
    activeModDownloads.delete(modId)
    if (state?.cancelled) {
      return { success: false, cancelled: true, error: mt('mc.downloadCancelled') }
    }
    return { success: false, error: error.message || mt('mc.downloadFailedShort') }
  }
})

// 管理已安装文件：删除 / 禁用（重命名为 .disabled）/ 启用（还原文件名）
// 模组、资源包、光影包都支持。MC 对非 .jar/.zip 后缀的文件会忽略加载，达到真正的启停效果。
ipcMain.handle('manage-installed-file', async (_event, action: 'delete' | 'disable' | 'enable', subDir?: string, targetGameVersion?: string, fileName?: string, modName?: string, versionId?: string) => {
  try {
    const minecraftDir = getMinecraftDir()
    const folderName = subDir || 'mods'
    const dir = targetGameVersion
      ? path.join(minecraftDir, 'versions', targetGameVersion, folderName)
      : path.join(minecraftDir, folderName)

    if (!fs.existsSync(dir)) {
      return { success: false, error: mt('mc.dirNotExist') }
    }

    const allNames = fs.readdirSync(dir)
    const exactFile = (fileName || '').trim().toLowerCase()
    const nameHint = (modName || '').trim().toLowerCase()
    const versionHint = (versionId || '').trim()

    const candidates = allNames.filter(n => {
      const lower = n.toLowerCase()
      if (exactFile && lower === exactFile) return true
      if (nameHint) {
        const hint = sanitizeFileNameSegment(nameHint).toLowerCase()
        if (hint && (lower === hint || lower.startsWith(hint))) return true
      }
      if (versionHint && lower.includes(`-${sanitizeFileNameSegment(versionHint).toLowerCase()}.`)) return true
      return false
    })

    if (candidates.length === 0) {
      return { success: false, error: mt('mc.installedFileNotFound', { name: fileName || modName || '' }) }
    }

    if (action === 'delete') {
      // 精确文件名优先，避免误删同名前缀的其它文件；无精确匹配时退化为模糊匹配
      const exacts = allNames.filter(n => exactFile && n.toLowerCase() === exactFile)
      const targets = exacts.length > 0 ? exacts : candidates
      for (const name of targets) {
        const p = path.join(dir, name)
        try {
          if (fs.statSync(p).isFile()) fs.unlinkSync(p)
        } catch (e) {
          console.warn('[Main] 删除文件失败:', name, e)
        }
      }
      return { success: true, removed: targets.length, message: mt('mc.installedFileDeleted', { count: targets.length }) }
    }

    if (action === 'disable') {
      const target = candidates.find(n => !n.toLowerCase().endsWith('.disabled'))
      if (!target) return { success: true, skipped: true }
      const newName = `${target}.disabled`
      fs.renameSync(path.join(dir, target), path.join(dir, newName))
      return { success: true, newFileName: newName, newPath: path.join(dir, newName), message: mt('mc.installedFileDisabled') }
    }

    if (action === 'enable') {
      const target = candidates.find(n => n.toLowerCase().endsWith('.disabled'))
      if (!target) return { success: true, skipped: true }
      const baseName = target.replace(/\.disabled$/i, '')
      const finalTarget = baseName + (fs.existsSync(path.join(dir, baseName)) ? '.disabled.old' : '')
      fs.renameSync(path.join(dir, target), path.join(dir, finalTarget))
      return { success: true, newFileName: finalTarget, newPath: path.join(dir, finalTarget), message: mt('mc.installedFileEnabled') }
    }

    return { success: false, error: mt('mc.invalidAction') }
  } catch (error: any) {
    console.error('[Main] 管理已安装文件失败:', error)
    return { success: false, error: error.message || mt('mc.installFailed') }
  }
})

// 安装整合包 - 下载 zip 并解压为独立版本目录
ipcMain.handle('install-modpack', async (event, modId: string, modName: string, downloadUrl: string, versionId: string, expectedSize?: number, expectedSha1?: string) => {
  let zipPath = ''
  let tempExtractDir = ''
  try {
    console.log(`[Main] 开始安装整合包: ${modName}`)
    console.log(`[Main]   版本=${versionId} 下载地址=${downloadUrl}`)
    console.log(`[Main]   API 声明: size=${expectedSize || '未知'} sha1=${expectedSha1 || '未知'}`)

    // 检查是否已有该整合包在下载。
    // 之前只要 map 里有条目就永久拒绝，导致一次网络卡死之后再也装不上，
    // 只能重启启动器。这里改为：只有确实还在推进才拒绝，长时间无进展就接管。
    const existing = activeModpackDownloads.get(modId)
    if (existing) {
      const now = Date.now()
      const idleMs = now - (existing.lastActivity || existing.startedAt || now)
      const runningMs = now - (existing.startedAt || now)
      const IDLE_LIMIT_MS = 5 * 60 * 1000     // 5 分钟没有任何进展即视为卡死
      const TOTAL_LIMIT_MS = 60 * 60 * 1000  // 最长 1 小时后也让用户能重试
      if (idleMs < IDLE_LIMIT_MS && runningMs < TOTAL_LIMIT_MS) {
        const mins = Math.floor(runningMs / 60000)
        const secs = Math.floor((idleMs % 60000) / 1000)
        return {
          success: false,
          error: mt('mc.modpackDownloadingIdle', { name: modName, mins, secs })
        }
      }
      console.warn(`[Main] 整合包 ${modName} 上次任务疑似卡死（无进展 ${Math.round(idleMs / 1000)}s），接管并重试`)
      try { existing.currentRequest?.destroy() } catch {}
      activeModpackDownloads.delete(modId)
    }

    const minecraftDir = getMinecraftDir()

    // 安全的版本目录名（替换非法字符）
    const safeVersionId = (modName || 'modpack').replace(/[<>:"/\\|?*]/g, '_') + '-' + versionId
    const versionsDir = path.join(minecraftDir, 'versions', safeVersionId)

    // P0-2: zip 存到系统临时目录，安装完自动删，崩溃由 OS 清理
    zipPath = path.join(tmpdir(), `zncl_modpack_${safeVersionId}_${Date.now()}.zip`)
    tempExtractDir = path.join(tmpdir(), `zncl_extract_${safeVersionId}_${Date.now()}`)

    activeModpackDownloads.set(modId, {
      modId,
      currentRequest: null,
      zipPath,
      startedAt: Date.now(),
      lastActivity: Date.now()
    })

    // 下载整合包 zip 到临时目录（镜像开启时镜像优先、官方兜底）
    const zipCandidates = modrinthCandidates(downloadUrl)
    let zipLastError: any = null
    for (let ci = 0; ci < zipCandidates.length; ci++) {
      const zipUrl = zipCandidates[ci]
      try {
        await downloadFile(zipUrl, zipPath, (progress, speed, threads) => {
          // 刷新心跳：卡死看门狗靠它判断任务是否还在推进
          const st = activeModpackDownloads.get(modId)
          if (st) st.lastActivity = Date.now()
          const pct = Math.round(progress)
          // 节流，避免每个数据块都刷一行把日志冲垮
          if (pct % 5 === 0) {
            console.log(`[Main] 整合包下载进度: ${pct}% 速度=${formatSpeed(speed || 0)} [${threads || 1}线程] -> ${zipUrl}`)
          }
          event.sender.send('mod-download-progress', { modId, progress: Math.round(progress * 0.1), speed: speed || 0, threads: threads || 1 })
        }, undefined, 5, undefined, (req) => {
          const download = activeModpackDownloads.get(modId)
          if (download) {
            download.currentRequest = req
          }
        }, true, expectedSize || 0, expectedSha1, zipCandidates)
        zipLastError = null
        break
      } catch (e: any) {
        zipLastError = e
        const msg = String(e?.message || e)
        // 用户取消 / 任务已被清理：不再换源重试
        if (msg === '下载已取消' || !activeModpackDownloads.has(modId)) break
        // 换源前清掉半成品，避免下一个地址从截断文件续传
        try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath) } catch {}
        if (ci < zipCandidates.length - 1) {
          console.warn(`[Main] 整合包下载失败(${zipUrl})，回退下一个地址: ${msg}`)
        }
      }
    }
    if (zipLastError) throw zipLastError

    console.log(`[Main] 整合包下载完成: ${zipPath}`)

    // P0-1: 解压到临时目录，不直接解压到版本目录
    if (!fs.existsSync(tempExtractDir)) fs.mkdirSync(tempExtractDir, { recursive: true })
    extractArchive(zipPath, tempExtractDir)
    console.log(`[Main] 整合包解压到临时目录: ${tempExtractDir}`)
    event.sender.send('mod-download-progress', { modId, progress: 10 })

    // 查找 modrinth.index.json（可能在根目录或子目录中）
    let indexJsonDir = tempExtractDir
    let idxPath = findModrinthIndex(tempExtractDir)
    if (!idxPath) {
      // 尝试在解压目录的子目录中查找
      const entries = fs.readdirSync(tempExtractDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subIdx = findModrinthIndex(path.join(tempExtractDir, entry.name))
          if (subIdx) {
            idxPath = subIdx
            indexJsonDir = path.join(tempExtractDir, entry.name)
            break
          }
        }
      }
    }

    // P0-1: 只复制声明的文件到版本目录（不清空目标目录）
    if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true })

    // 先复制 overrides（如果有）
    const overridesDir = path.join(indexJsonDir, 'overrides')
    if (fs.existsSync(overridesDir)) {
      const copyOverrides = (src: string, dest: string) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
        for (const item of fs.readdirSync(src)) {
          const srcPath = path.join(src, item)
          const destPath = path.join(dest, item)
          const stat = fs.statSync(srcPath)
          if (stat.isDirectory()) {
            copyOverrides(srcPath, destPath)
          } else {
            // 不覆盖已有文件（保留用户修改）
            if (!fs.existsSync(destPath)) {
              fs.copyFileSync(srcPath, destPath)
            }
          }
        }
      }
      copyOverrides(overridesDir, versionsDir)
      console.log(`[Main] overrides 文件已复制到版本目录`)
    }

    // 复制 modrinth.index.json 到版本目录
    if (idxPath) {
      const destIdx = path.join(versionsDir, 'modrinth.index.json')
      if (!fs.existsSync(destIdx)) {
        fs.copyFileSync(idxPath, destIdx)
      }
    }

    event.sender.send('mod-download-progress', { modId, progress: 12 })

    // ========== 下载 modrinth.index.json 中列出的所有文件（mods/config/shaderpacks 等）==========
    console.log(`[Main] 开始下载整合包文件（来自 modrinth.index.json）...`)
    let cumulativeDone = 0
    // 记录已展示的字节高水位：重试时从上次位置继续，
    // 否则每轮重试都会把进度从 12% 重新算起，表现为进度条"回退"
    let cumulativeBytes = 0
    const modpackTotal = (() => {
      try {
        const iPath = idxPath || findModrinthIndex(versionsDir)
        if (!iPath) return 1
        const idx = JSON.parse(fs.readFileSync(iPath, 'utf-8'))
        return (idx.files || []).length
      } catch { return 1 }
    })()
    const modpackBytesTotal = (() => {
      try {
        const iPath = idxPath || findModrinthIndex(versionsDir)
        if (!iPath) return 0
        const idx = JSON.parse(fs.readFileSync(iPath, 'utf-8'))
        return (idx.files || []).reduce((sum: number, f: any) => sum + (f.fileSize || 0), 0)
      } catch { return 0 }
    })()
    let lastModpackPct = 12
    const emitModpackProgress = (bytesDone: number, done: number, speed: number, threads: number) => {
      if (bytesDone > cumulativeBytes) cumulativeBytes = bytesDone
      const pct = cumulativeBytes > 0 && modpackBytesTotal > 0
        ? Math.round(12 + (cumulativeBytes / modpackBytesTotal) * 48)
        : Math.round(12 + (done / modpackTotal) * 48)
      // 双重保护：阶段内进度只增不减
      const safePct = Math.min(60, Math.max(lastModpackPct, pct))
      lastModpackPct = safePct
      // 整合包文件阶段同样刷新心跳（这是耗时最长的阶段）
      const st = activeModpackDownloads.get(modId)
      if (st) st.lastActivity = Date.now()
      event.sender.send('mod-download-progress', { modId, progress: safePct, speed, threads })
    }
    let modpackFilesResult = await downloadModpackFiles(versionsDir, (done, total, name, speed, bytesDone, bytesTotal, threads) => {
      emitModpackProgress(bytesDone, done, speed, threads)
    })
    cumulativeDone += modpackFilesResult.downloaded + modpackFilesResult.skipped
    // 重试失败文件
    if (!modpackFilesResult.ok && modpackFilesResult.failed > 0) {
      console.warn(`[Main] 部分整合包文件下载失败，开始重试`)
      for (let retry = 1; retry <= 3 && !modpackFilesResult.ok; retry++) {
        await new Promise(resolve => setTimeout(resolve, 1500 * retry))
        console.log(`[Main] 整合包文件补全重试 ${retry}/3 ...`)
        modpackFilesResult = await downloadModpackFiles(versionsDir, (done, total, name, speed, bytesDone, bytesTotal, threads) => {
          emitModpackProgress(bytesDone, done, speed, threads)
        }, undefined, cumulativeDone, cumulativeBytes)
        cumulativeDone += modpackFilesResult.downloaded + modpackFilesResult.skipped
      }
    }
    if (modpackFilesResult.ok) {
      console.log(`[Main] 整合包文件下载完成: 下载 ${modpackFilesResult.downloaded}，复用 ${modpackFilesResult.skipped}`)
    } else {
      const missingList = modpackFilesResult.failedFiles || []
      console.warn(`[Main] 整合包文件仍有缺失: 成功 ${modpackFilesResult.downloaded}，失败 ${modpackFilesResult.failed}`)
      missingList.slice(0, 20).forEach(f => console.warn(`[Main]   缺失文件: ${f}`))
      // 明确把缺失信息抛给界面：整合包不完整时装完会导致进游戏崩 mods，
      // 用户必须能在界面上看到并重试，而不是"看起来装好了"
      event.sender.send('mod-download-progress', {
        modId,
        progress: 60,
        speed: 0,
        threads: 0,
        incomplete: true,
        missingCount: modpackFilesResult.failed,
        missingFiles: missingList.slice(0, 50)
      })
    }

    // ========== P1-4: 安装阶段只下 jar + JSON，libraries/assets 延迟到启动时补全 ==========
    const baseMcVersion = (() => {
      try {
        const iPath = findModrinthIndex(versionsDir)
        if (iPath) {
          const json = JSON.parse(fs.readFileSync(iPath, 'utf-8'))
          if (json.gameVersions && json.gameVersions.length > 0) return json.gameVersions[0] as string
          if (json.dependencies && json.dependencies.minecraft) return json.dependencies.minecraft as string
        }
      } catch {}
      return ''
    })()

    // 检查客户端 jar 和版本 JSON 是否有效
    const clientJarPath = path.join(versionsDir, `${safeVersionId}.jar`)
    const clientJarValid = (() => {
      try {
        return fs.existsSync(clientJarPath) && fs.statSync(clientJarPath).size >= 1024 * 1024
      } catch { return false }
    })()
    const jsonCheckPath = path.join(versionsDir, `${safeVersionId}.json`)
    const versionJsonValid = (() => {
      try {
        if (!fs.existsSync(jsonCheckPath)) return false
        const json = JSON.parse(fs.readFileSync(jsonCheckPath, 'utf-8'))
        return !!(json.downloads?.client && json.libraries?.length)
      } catch { return false }
    })()

    // 只在 jar/JSON 缺失时下载（不下载 libraries/assets，延迟到启动时）
    if ((!clientJarValid || !versionJsonValid) && baseMcVersion) {
      console.log(`[Main] 整合包需要基础游戏文件，目标 MC 版本: ${baseMcVersion}`)
      event.sender.send('mod-download-progress', { modId, progress: 60, speed: 0 })

      await ensureAutoProbe()

      const manifestUrls = orderByDownloadSource([
        'https://launchermeta.mojang.com/mc/game/version_manifest.json',
        'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json',
        'https://download.mcbbs.net/mc/game/version_manifest.json'
      ])
      let versionMetaUrl: string | null = null
      for (const manifestUrl of manifestUrls) {
        try {
          const manifestResp = await httpFetch(manifestUrl, { timeout: 10000 })
          if (!manifestResp.ok) continue
          const manifestData: any = await manifestResp.json()
          const found = manifestData.versions?.find((v: any) => v.id === baseMcVersion)
          if (found?.url) { versionMetaUrl = found.url as string; break }
        } catch (e) {
          console.warn(`[Main] 获取版本清单失败:`, (e as any).message)
        }
      }

      if (versionMetaUrl) {
        let baseDownloadOk = false
        try {
          // 只下载 jar + JSON（不下载 libraries/assets，启动时补全）
          await installBaseVersionLight(baseMcVersion, versionMetaUrl, safeVersionId, () => false, (type, progress) => {
            const base = 60
            const range = 15
            const pct = type === 'assets' ? base + range : base + Math.round((progress / 100) * range)
            event.sender.send('mod-download-progress', { modId, progress: Math.min(75, pct), speed: 0 })
          })
          baseDownloadOk = true
          console.log(`[Main] 整合包基础游戏文件下载完成: ${baseMcVersion}`)

          // 验证下载的 JSON 是否完整（必须含 downloads 和 libraries 才能被加载器合并）
          try {
            const checkJson = JSON.parse(fs.readFileSync(jsonCheckPath, 'utf-8'))
            if (!checkJson.downloads?.client || !checkJson.libraries?.length) {
              console.warn(`[Main] 基础游戏 JSON 不完整，缺少 downloads 或 libraries`)
              baseDownloadOk = false
            }
          } catch {
            console.warn(`[Main] 基础游戏 JSON 解析失败`)
            baseDownloadOk = false
          }
        } catch (e: any) {
          console.warn(`[Main] 整合包基础游戏下载失败:`, e?.message || e)
        }

        // 基础游戏下载失败时，不再继续安装加载器（否则合并出的 JSON 必然不完整）
        if (!baseDownloadOk) {
          try { fs.unlinkSync(zipPath) } catch {}
          try { fs.rmSync(tempExtractDir, { recursive: true, force: true }) } catch {}
          activeModpackDownloads.delete(modId)
          return {
            success: false,
            error: mt('mc.baseGameDownloadFailed', { version: baseMcVersion }),
            versionId: safeVersionId,
            versionDir: versionsDir
          }
        }
      } else {
        console.warn(`[Main] 未在版本清单中找到 MC 版本 ${baseMcVersion}，跳过基础游戏下载`)
      }
    } else if (clientJarValid && versionJsonValid) {
      console.log(`[Main] 整合包已包含基础游戏文件，跳过下载`)
    } else {
      console.warn(`[Main] 无法确定整合包基础 MC 版本，跳过基础游戏下载`)
    }

    // ========== 安装加载器 ==========
    let loaderInstallOk = true
    const loaderInfo = resolveModpackLoader(safeVersionId)
    if (loaderInfo && (loaderInfo.loader === 'fabric-loader' || loaderInfo.loader === 'quilt-loader')) {
      console.log(`[Main] 整合包使用 ${loaderInfo.loader} ${loaderInfo.version}，开始安装加载器...`)
      event.sender.send('mod-download-progress', { modId, progress: 80, speed: 0 })
      let fabricMcVersion = baseMcVersion
      if (!fabricMcVersion) {
        try {
          const idx = findModrinthIndex(versionsDir)
          if (idx) {
            const json = JSON.parse(fs.readFileSync(idx, 'utf-8'))
            if (json.gameVersions && json.gameVersions.length > 0) fabricMcVersion = json.gameVersions[0]
            else if (json.dependencies?.minecraft) fabricMcVersion = json.dependencies.minecraft
          }
        } catch {}
      }
      if (!fabricMcVersion) {
        console.warn(`[Main] 无法确定加载器的 MC 版本，跳过加载器安装`)
        loaderInstallOk = false
      } else {
        try {
          const fabricResult = await installFabricLoader(safeVersionId, fabricMcVersion, loaderInfo.version, (msg) => {
            event.sender.send('mod-download-progress', { modId, progress: 80, speed: 0 })
          })
          if (!fabricResult.ok) {
            console.warn(`[Main] 加载器安装失败:`, fabricResult.error)
            loaderInstallOk = false
          }
        } catch (e: any) {
          console.warn(`[Main] 加载器安装异常:`, e?.message || e)
          loaderInstallOk = false
        }
      }
    } else if (loaderInfo && (loaderInfo.loader === 'neoforge' || loaderInfo.loader === 'forge')) {
      console.log(`[Main] 整合包使用 ${loaderInfo.loader} ${loaderInfo.version}，开始安装加载器...`)
      event.sender.send('mod-download-progress', { modId, progress: 80, speed: 0 })
      let loaderMcVersion = baseMcVersion
      if (!loaderMcVersion) {
        try {
          const idx = findModrinthIndex(versionsDir)
          if (idx) {
            const json = JSON.parse(fs.readFileSync(idx, 'utf-8'))
            if (json.gameVersions && json.gameVersions.length > 0) loaderMcVersion = json.gameVersions[0]
            else if (json.dependencies?.minecraft) loaderMcVersion = json.dependencies.minecraft
          }
        } catch {}
      }
      if (!loaderMcVersion) {
        console.warn(`[Main] 无法确定加载器的 MC 版本，跳过加载器安装`)
        loaderInstallOk = false
      } else {
        try {
          const loaderResult = await installInstallerBasedLoader(loaderInfo.loader, safeVersionId, loaderMcVersion, loaderInfo.version, (msg) => {
            event.sender.send('mod-download-progress', { modId, progress: 80, speed: 0 })
          })
          if (!loaderResult.ok) {
            console.warn(`[Main] 加载器安装失败:`, loaderResult.error)
            loaderInstallOk = false
          }
        } catch (e: any) {
          console.warn(`[Main] 加载器安装异常:`, e?.message || e)
          loaderInstallOk = false
        }
      }
    }

    event.sender.send('mod-download-progress', { modId, progress: 100 })

    // 验证版本 JSON 是否完整
    const finalJsonPath = path.join(versionsDir, `${safeVersionId}.json`)
    let jsonValid = false
    try {
      if (fs.existsSync(finalJsonPath)) {
        const finalJson = JSON.parse(fs.readFileSync(finalJsonPath, 'utf-8'))
        jsonValid = !!(finalJson.inheritsFrom && finalJson.mainClass && finalJson.libraries?.length)
      }
    } catch {}

    // 清理临时文件
    try { fs.unlinkSync(zipPath) } catch {}
    try { fs.rmSync(tempExtractDir, { recursive: true, force: true }) } catch {}

    activeModpackDownloads.delete(modId)

    if (!loaderInstallOk) {
      return {
        success: false,
        error: mt('mc.modpackLoaderInstallFailed'),
        versionId: safeVersionId,
        versionDir: versionsDir
      }
    }

    if (!jsonValid) {
      return {
        success: false,
        error: mt('mc.modpackConfigIncomplete'),
        versionId: safeVersionId,
        versionDir: versionsDir
      }
    }

    return {
      success: true,
      message: mt('mc.modpackInstallComplete', { name: modName }),
      versionId: safeVersionId,
      versionDir: versionsDir,
      hasVersionJson: true
    }
  } catch (error: any) {
    console.error('[Main] 安装整合包失败:', error)
    const cancelled = activeModpackDownloads.get(modId)?.cancelled
    return {
      success: false,
      cancelled: !!cancelled,
      error: cancelled ? mt('mc.downloadCancelled') : (error.message || mt('mc.modpackInstallFailed'))
    }
  } finally {
    // 无论成功、失败还是提前 return，都必须释放占用标记和临时文件，
    // 否则一次异常就会让该整合包永久处于"下载中"，之后再也点不动
    activeModpackDownloads.delete(modId)
    if (zipPath) { try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath) } catch {} }
    if (tempExtractDir) { try { if (fs.existsSync(tempExtractDir)) fs.rmSync(tempExtractDir, { recursive: true, force: true }) } catch {} }
  }
})

// 扫描当前游戏目录下已安装的版本
ipcMain.handle('scan-installed-versions', async () => {
  try {
    const minecraftDir = getMinecraftDir()
    
    let versionsDir = path.join(minecraftDir, 'versions')
    
    if (!fs.existsSync(versionsDir)) {
      if (fs.existsSync(path.join(minecraftDir, 'launcher_profiles.json')) ||
          fs.existsSync(path.join(minecraftDir, 'launcher_accounts.json'))) {
        console.log('[Main] 检测到 Minecraft 根目录但没有 versions 子文件夹')
        return { success: true, versions: [] }
      }
      
      const entries = fs.readdirSync(minecraftDir, { withFileTypes: true })
      const hasVersionFolders = entries.some(e => {
        if (!e.isDirectory()) return false
        const dir = path.join(minecraftDir, e.name)
        return fs.existsSync(path.join(dir, `${e.name}.json`)) ||
               fs.existsSync(path.join(dir, `${e.name}.jar`))
      })
      
      if (hasVersionFolders) {
        console.log('[Main] 检测到所选目录直接包含版本文件夹，使用该目录作为 versions 目录')
        versionsDir = minecraftDir
      } else {
        console.log(`[Main] 版本目录不存在: ${versionsDir}`)
        return { success: true, versions: [] }
      }
    }
    
    console.log(`[Main] 扫描版本目录: ${versionsDir}`)

    const entries = fs.readdirSync(versionsDir, { withFileTypes: true })
    const installedVersions: { directoryName: string; versionId: string; hasJson: boolean; hasJar: boolean; isModpack?: boolean; packName?: string; mcVersion?: string }[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      
      const dirName = entry.name
      const versionDir = path.join(versionsDir, dirName)
      const versionJsonPath = path.join(versionDir, `${dirName}.json`)
      const clientJarPath = path.join(versionDir, `${dirName}.jar`)
      // Modrinth 整合包标志文件
      const modrinthIndexPath = path.join(versionDir, 'modrinth.index.json')
      const nestedModrinthIndex = findModrinthIndex(versionDir)

      const hasJson = fs.existsSync(versionJsonPath)
      let hasJar = false
      let jarSize = 0
      if (fs.existsSync(clientJarPath)) {
        jarSize = fs.statSync(clientJarPath).size
        hasJar = jarSize >= 50 * 1024
      }

      // 整合包目录：有 modrinth.index.json 即视为已安装
      const isModpack = fs.existsSync(modrinthIndexPath) || !!nestedModrinthIndex

      console.log(`[Main] 检查版本 ${dirName}: json=${hasJson}, jar=${hasJar}, jarSize=${jarSize}, modpack=${isModpack}`)

      if (isModpack) {
        // 整合包版本：优先识别（完整安装的整合包含 modrinth.index.json 也会有 json+jar）
        // 使用目录名作为版本ID，modrinth.index.json 中的名称用于显示
        let packName = ''
        let mcVersion = ''
        try {
          const idxPath = fs.existsSync(modrinthIndexPath) ? modrinthIndexPath : nestedModrinthIndex!
          const json = JSON.parse(fs.readFileSync(idxPath, 'utf-8'))
          if (json.name) packName = json.name
          if (json.gameVersions && json.gameVersions.length > 0) mcVersion = json.gameVersions[0]
          else if (json.dependencies && json.dependencies.minecraft) mcVersion = json.dependencies.minecraft
        } catch (e) {}

        installedVersions.push({
          directoryName: dirName,
          versionId: dirName,
          hasJson,
          hasJar,
          isModpack: true,
          packName,
          mcVersion
        })
        console.log(`[Main] 识别整合包版本: ${dirName} (${packName || dirName}, MC ${mcVersion || '未知'})`)
      } else if (hasJson && hasJar) {
        let versionId = dirName
        try {
          const jsonContent = fs.readFileSync(versionJsonPath, 'utf-8')
          const json = JSON.parse(jsonContent)
          if (json.id) {
            versionId = json.id
          }
        } catch (e) {}

        installedVersions.push({
          directoryName: dirName,
          versionId,
          hasJson,
          hasJar
        })
      }
    }

    console.log(`[Main] 扫描完成，找到 ${installedVersions.length} 个已安装版本`)
    return { success: true, versions: installedVersions }
  } catch (error: any) {
    console.error('[Main] 扫描已安装版本失败:', error)
    return { success: false, error: error.message, versions: [] }
  }
})

// 检查版本是否实际安装（文件是否存在）
ipcMain.handle('check-version-installed', async (_event, versionId: string, directoryName?: string) => {
  try {
    const dirName = directoryName || versionId
    const minecraftDir = getMinecraftDir()
    const versionDir = path.join(minecraftDir, 'versions', dirName)

    // 首先检查版本目录是否存在
    const dirExists = fs.existsSync(versionDir)
    if (!dirExists) {
      return {
        success: true,
        installed: false,
        dirExists: false,
        jsonExists: false,
        jarExists: false,
        jarValid: false,
        reason: mt('mc.dirNotExist')
      }
    }

    const versionJsonPath = path.join(versionDir, `${dirName}.json`)
    const clientJarPath = path.join(versionDir, `${dirName}.jar`)
    const modrinthIndexPath = path.join(versionDir, 'modrinth.index.json')
    const isModpack = fs.existsSync(modrinthIndexPath) || !!findModrinthIndex(versionDir)

    const jsonExists = fs.existsSync(versionJsonPath)
    const jarExists = fs.existsSync(clientJarPath)
    const jarValid = jarExists ? fs.statSync(clientJarPath).size >= 50 * 1024 : false

    let reason = ''
    if (!jsonExists && !isModpack) reason = mt('mc.jsonFileMissing')
    else if (!jarExists && !isModpack) reason = mt('mc.jarFileMissing')
    else if (!jarValid && !isModpack) reason = mt('mc.jarTooSmall')

    return {
      success: true,
      installed: isModpack || (jsonExists && jarExists && jarValid),
      dirExists,
      jsonExists: jsonExists || isModpack,
      jarExists,
      jarValid,
      isModpack,
      reason
    }
  } catch (error: any) {
    return { success: false, error: error.message, installed: false }
  }
})

// 检查资源完整性并修复缺失资源
ipcMain.handle('check-and-fix-assets', async (event, versionId: string, directoryName?: string) => {
  try {
    const dirName = directoryName || versionId
    const minecraftDir = getMinecraftDir()
    const versionDir = path.join(minecraftDir, 'versions', dirName)
    const versionJsonPath = path.join(versionDir, `${dirName}.json`)

    if (!fs.existsSync(versionJsonPath)) {
      return { success: false, error: mt('mc.versionJsonNotExist') }
    }

    const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))

    if (!versionJson.assetIndex) {
      return { success: false, error: mt('mc.noAssetIndex') }
    }

    const assetsDir = path.join(minecraftDir, 'assets')
    const indexesDir = path.join(assetsDir, 'indexes')
    const objectsDir = path.join(assetsDir, 'objects')
    const indexFile = path.join(indexesDir, `${versionJson.assetIndex.id}.json`)

    if (!fs.existsSync(indexFile)) {
      console.log(`[Main] 资源索引文件不存在，开始下载`)
      await downloadFile(versionJson.assetIndex.url, indexFile, undefined, undefined, 3)
    }

    const assetIndexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'))
    
    if (!assetIndexData.objects) {
      return { success: false, error: mt('mc.assetIndexEmpty') }
    }

    const assetObjects = Object.entries(assetIndexData.objects)
    const totalAssets = assetObjects.length
    let missingCount = 0
    let mismatchedCount = 0

    const assetsToDownload: { hash: string; virtualPath: string; path: string; size: number }[] = []

    for (const [virtualPath, assetInfo] of assetObjects) {
      const info = assetInfo as { hash: string; size: number }
      const realHash = info.hash
      const subDir = realHash.substring(0, 2)
      const objectDir = path.join(objectsDir, subDir)
      if (!fs.existsSync(objectDir)) {
        fs.mkdirSync(objectDir, { recursive: true })
      }

      const objectPath = path.join(objectDir, realHash)

      if (!fs.existsSync(objectPath)) {
        missingCount++
        assetsToDownload.push({ hash: realHash, virtualPath, path: objectPath, size: info.size })
      } else if (fs.statSync(objectPath).size !== info.size) {
        mismatchedCount++
        assetsToDownload.push({ hash: realHash, virtualPath, path: objectPath, size: info.size })
      } else {
        // 大小一致也可能是内容损坏（download 中途断流可能写坏），逐文件核对 SHA-1
        const actualHash = await sha1FileAsync(objectPath)
        if (actualHash !== realHash) {
          mismatchedCount++
          assetsToDownload.push({ hash: realHash, virtualPath, path: objectPath, size: info.size })
        }
      }
    }

    console.log(`[Main] 资源检查完成: 总计 ${totalAssets}, 缺失 ${missingCount}, 大小不匹配 ${mismatchedCount}`)

    if (assetsToDownload.length === 0) {
      return { 
        success: true, 
        total: totalAssets, 
        missing: 0, 
        mismatched: 0, 
        fixed: 0,
        message: mt('mc.assetsIntact')
      }
    }

    console.log(`[Main] 开始修复 ${assetsToDownload.length} 个资源文件...`)

    const assetUrlBases = orderByDownloadSource([
      'https://resources.download.minecraft.net/',
      'https://bmclapi2.bangbang93.com/assets/',
      'https://download.mcbbs.net/assets/'
    ])

    const downloadAssetWithFallback = async (item: typeof assetsToDownload[0]) => {
      const subDir = item.hash.substring(0, 2)
      let all404 = true
      for (let baseIndex = 0; baseIndex < assetUrlBases.length; baseIndex++) {
        const base = assetUrlBases[baseIndex]
        const usesSubDir = base.includes('minecraft.net')
        const url = usesSubDir
          ? `${base}${subDir}/${item.hash}`
          : `${base}${item.hash}`
        try {
          // 同样带上 SHA-1 校验，坏文件不会覆盖后又被当成“修复成功”
          await downloadFile(url, item.path, undefined, undefined, 3, undefined, undefined, true, item.size, item.hash)
          return true
        } catch (err: any) {
          if (err.message && err.message.includes('404')) {
            continue
          }
          all404 = false
        }
      }
      if (all404) {
        console.warn(`[Main] 资源在所有源都不存在(404): ${item.hash}，跳过`)
      }
      return false
    }

    let fixedCount = 0
    const maxConcurrent = 8
    const downloadQueue = [...assetsToDownload]
    const totalToFix = assetsToDownload.length

    const downloadNext = async () => {
      while (downloadQueue.length > 0) {
        const item = downloadQueue.pop()
        if (!item) break

        if (await downloadAssetWithFallback(item)) {
          fixedCount++
        }

        // 实时推送修复进度，供前端全局显示（切换界面也不丢失）
        try {
          const done = totalToFix - downloadQueue.length
          event.sender.send('check-assets-progress', {
            total: totalToFix,
            done,
            progress: Math.round((done / totalToFix) * 100),
            hash: item.hash,
            fixed: fixedCount
          })
        } catch {}

        if (event.sender.isDestroyed()) break
      }
    }

    const workers = Array(Math.min(maxConcurrent, assetsToDownload.length)).fill(null).map(downloadNext)
    await Promise.all(workers)

    console.log(`[Main] 资源修复完成: 成功修复 ${fixedCount}/${assetsToDownload.length} 个资源文件`)

    return {
      success: true,
      total: totalAssets,
      missing: missingCount,
      mismatched: mismatchedCount,
      fixed: fixedCount,
      message: mt('mc.assetsRepaired', { count: fixedCount })
    }
  } catch (error: any) {
    console.error(`[Main] 资源完整性检查失败:`, error)
    return { success: false, error: error.message }
  }
})

// 删除版本
ipcMain.handle('delete-version', async (event, versionId: string) => {
  try {
    console.log(`[Main] 开始删除版本: ${versionId}`)

    const minecraftDir = getMinecraftDir()
    const versionsDir = path.join(minecraftDir, 'versions')
    const versionDir = path.join(versionsDir, versionId)
    const versionJsonPath = path.join(versionDir, `${versionId}.json`)
    const assetsDir = path.join(minecraftDir, 'assets')

    // 递归删除目录的函数
    const deleteFolderRecursive = (folderPath: string): string[] => {
      const failedItems: string[] = []
      if (fs.existsSync(folderPath)) {
        try {
          const files = fs.readdirSync(folderPath)
          for (const file of files) {
            const curPath = path.join(folderPath, file)
            try {
              if (fs.lstatSync(curPath).isDirectory()) {
                const subResult = deleteFolderRecursive(curPath)
                if (subResult.length > 0) {
                  failedItems.push(...subResult)
                }
              } else {
                fs.unlinkSync(curPath)
              }
            } catch (e: any) {
              failedItems.push(`${curPath}: ${e.message}`)
            }
          }
          fs.rmdirSync(folderPath)
        } catch (e: any) {
          failedItems.push(`${folderPath}: ${e.message}`)
        }
      }
      return failedItems
    }

    let deletedVersion = false
    let deletedAssets = false
    const failedToDelete: string[] = []

    // 删除版本文件夹前，先读取当前版本的 assetIndex ID
    let currentAssetIndexId: string | undefined
    if (fs.existsSync(versionJsonPath)) {
      try {
        const currentJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
        currentAssetIndexId = currentJson.assetIndex?.id
      } catch {}
    }

    // 删除版本文件夹
    if (fs.existsSync(versionDir)) {
      const versionResult = deleteFolderRecursive(versionDir)
      if (versionResult.length === 0) {
        deletedVersion = true
        console.log(`[Main] 版本删除成功: ${versionDir}`)
      } else {
        failedToDelete.push(...versionResult)
      }
    }

    // 检查是否还有其他版本在使用相同的 assets
    let otherVersionsUsingAssets = false
    if (currentAssetIndexId && fs.existsSync(versionsDir)) {
      const versionFolders = fs.readdirSync(versionsDir).filter(f =>
        fs.statSync(path.join(versionsDir, f)).isDirectory() && f !== versionId
      )
      for (const otherVersion of versionFolders) {
        const otherJsonPath = path.join(versionsDir, otherVersion, `${otherVersion}.json`)
        if (fs.existsSync(otherJsonPath)) {
          try {
            const otherJson = JSON.parse(fs.readFileSync(otherJsonPath, 'utf-8'))
            if (otherJson.assetIndex && otherJson.assetIndex.id === currentAssetIndexId) {
              otherVersionsUsingAssets = true
              break
            }
          } catch {}
        }
      }
    }

    // 只有当没有其他版本使用相同资源时才删除assets
    if (!otherVersionsUsingAssets && assetsDir) {
      console.log(`[Main] 开始删除 assets 目录`)
      const assetsResult = deleteFolderRecursive(assetsDir)
      if (assetsResult.length === 0) {
        deletedAssets = true
        console.log(`[Main] assets 目录删除成功`)
      } else {
        failedToDelete.push(...assetsResult)
      }
    } else if (otherVersionsUsingAssets) {
      console.log(`[Main] 其他版本使用相同资源，跳过删除assets`)
    }

    if (failedToDelete.length > 0) {
      console.warn(`[Main] 部分文件删除失败:`, failedToDelete)
      return {
        success: deletedVersion,
        message: mt('mc.versionDeletedPartial'),
        failedItems: failedToDelete
      }
    }

    return { success: true, message: mt('mc.versionDeleted', { version: versionId }) }
  } catch (error: any) {
    console.error('[Main] 删除版本失败:', error)
    return { success: false, error: error.message || mt('mc.deleteFailed') }
  }
})

// 选择目录
ipcMain.handle('select-directory', async () => {
  try {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return ''
    }
    return result.filePaths[0]
  } catch (error: any) {
    console.error('[Main] 选择目录失败:', error)
    return ''
  }
})

// 选择文件
ipcMain.handle('select-file', async (_event, filters: { name: string; extensions: string[] }[]) => {
  try {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: filters || []
    })
    if (result.canceled || result.filePaths.length === 0) {
      return ''
    }
    return result.filePaths[0]
  } catch (error: any) {
    console.error('[Main] 选择文件失败:', error)
    return ''
  }
})

// 打开外部链接
ipcMain.handle('open-external', async (_event, url: string) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (error: any) {
    console.error('[Main] 打开外部链接失败:', error)
    return { success: false, error: error.message }
  }
})

// 窗口控制 IPC 处理器
ipcMain.handle('minimize-window', () => {
  if (win) {
    win.minimize()
  }
})

ipcMain.handle('maximize-window', () => {
  if (win) {
    win.maximize()
  }
})

ipcMain.handle('unmaximize-window', () => {
  if (win) {
    win.unmaximize()
  }
})

ipcMain.handle('close-window', () => {
  if (win) {
    win.close()
  }
})

// 清理残留的临时文件
function cleanupTempFiles() {
  try {
    const javaDownloadsDir = path.join(getMinecraftDir(), 'java-downloads')
    if (!fs.existsSync(javaDownloadsDir)) return
    
    const cleanDir = (dirPath: string) => {
      try {
        const files = fs.readdirSync(dirPath)
        for (const file of files) {
          if (file.startsWith('temp_')) {
            try {
              const filePath = path.join(dirPath, file)
              fs.unlinkSync(filePath)
              console.log(`[Main] 已清理残留临时文件: ${file}`)
            } catch (e: any) {
              if (e.code !== 'EPERM' && e.code !== 'EBUSY') {
                console.warn(`[Main] 无法删除临时文件 ${file}: ${e.message}`)
              }
            }
          }
        }
      } catch (e: any) {
        console.warn(`[Main] 无法读取目录 ${dirPath}: ${e.message}`)
      }
    }
    
    cleanDir(javaDownloadsDir)
    
    // 遍历子目录
    try {
      const entries = fs.readdirSync(javaDownloadsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          cleanDir(path.join(javaDownloadsDir, entry.name))
        }
      }
    } catch {}
  } catch (err) {
    console.warn('[Main] 清理临时文件时出错:', err)
  }
}

// 自动更新配置
let updateAvailable = false
let updateDownloaded = false

function setupAutoUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] 正在检查更新...')
    if (win) {
      win.webContents.send('update-status', { status: 'checking' })
    }
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] 发现新版本:', info.version)
    updateAvailable = true
    if (win) {
      win.webContents.send('update-status', { status: 'available', version: info.version })
    }
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] 已是最新版本')
    if (win) {
      win.webContents.send('update-status', { status: 'up-to-date' })
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log('[AutoUpdater] 下载进度:', Math.round(progress.percent) + '%')
    if (win) {
      win.webContents.send('update-status', { status: 'downloading', progress: progress.percent })
    }
  })

  autoUpdater.on('update-downloaded', () => {
    console.log('[AutoUpdater] 下载完成')
    updateDownloaded = true
    if (win) {
      win.webContents.send('update-status', { status: 'downloaded' })
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] 更新错误:', err.message)
    if (win) {
      win.webContents.send('update-status', { status: 'error', error: err.message })
    }
  })
}

function checkForUpdates() {
  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[AutoUpdater] 开发模式下跳过更新检查')
    return
  }
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[AutoUpdater] 检查更新失败:', err.message)
  })
}

function downloadUpdate() {
  if (updateAvailable && !updateDownloaded) {
    autoUpdater.downloadUpdate().catch((err) => {
      console.error('[AutoUpdater] 下载更新失败:', err.message)
    })
  }
}

function installUpdate() {
  if (updateDownloaded) {
    autoUpdater.quitAndInstall(false, true)
  }
}

// IPC 处理更新相关请求
ipcMain.handle('check-for-updates', async () => {
  checkForUpdates()
  return { checking: true }
})

ipcMain.handle('download-update', async () => {
  downloadUpdate()
  return { downloading: true }
})

ipcMain.handle('install-update', async () => {
  installUpdate()
  return { installing: true }
})

ipcMain.handle('get-app-version', async () => {
  return { version: app.getVersion() }
})

// 复制日志：返回文本由渲染层写剪贴板，主进程负责读取并裁剪
ipcMain.handle('get-launcher-log', async () => {
  try {
    return { success: true, text: readLogsForCopy(), filePath: getLogFilePath(), dir: getLogDir() }
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) }
  }
})

// 打开日志目录：排查问题时直接跳到日志所在文件夹
ipcMain.handle('open-log-dir', async () => {
  try {
    const dir = getLogDir()
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    await shell.openPath(dir)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// 单实例锁：只允许运行一个启动器
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 第二个实例启动时，聚焦到已有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  console.log('App is ready')
  
  // 确保默认游戏目录存在
  try {
    getMinecraftDir()
  } catch (e) {
    console.warn('[Main] 初始化游戏目录失败:', e)
  }
  
  // 尽早加载并应用已保存的代理设置：
  // 让启动器的第一次更新检查、测速等出网请求就能走代理（渲染进程稍后才同步设置）
  try {
    loadProxyConfigFromFile(proxyConfigPath())
    applySessionProxy()
  } catch (e) {
    console.warn('[Main] 初始化代理设置失败:', e)
  }
  
  cleanupTempFiles()
  setupAutoUpdater()
  createWindow()
  setTimeout(() => {
    checkForUpdates()
  }, 3000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

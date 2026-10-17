import { app } from 'electron'
import { appendFileSync, mkdirSync, statSync, unlinkSync, readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

// 启动器自身日志落盘。
// 之前所有输出只走 console.log/console.error（stdout），打包后没有终端可看，
// 导致下载/安装失败完全无法定位——只能靠猜。
// 这里把主进程的控制台输出同步写入日志文件，并保留最近若干天。

const LOG_DIR = join(app.getPath('userData'), 'launcher-logs')
const KEEP_DAYS = 14
let logFile = ''

function currentLogFile(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return join(LOG_DIR, `launcher-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.log`)
}

function purgeOldLogs() {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000
    for (const f of readdirSync(LOG_DIR)) {
      if (!f.endsWith('.log')) continue
      const p = join(LOG_DIR, f)
      try {
        if (statSync(p).mtimeMs < cutoff) unlinkSync(p)
      } catch {}
    }
  } catch {}
}

export function initFileLogger(): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    logFile = currentLogFile()
    purgeOldLogs()
  } catch {
    return
  }

  const stamp = () => new Date().toISOString()
  const write = (level: string, args: unknown[]) => {
    const parts: string[] = []
    for (const a of args) {
      if (typeof a === 'string') parts.push(a)
      else if (a instanceof Error) parts.push(`${a.message}\n${a.stack || ''}`)
      else {
        try { parts.push(JSON.stringify(a)) } catch { parts.push(String(a)) }
      }
    }
    try { appendFileSync(logFile, `[${stamp()}] [${level}] ${parts.join(' ')}\n`) } catch {}
  }

  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      write(level === 'debug' ? 'debug' : level.toUpperCase(), args)
      original(...args)
    }
  }

  // 未捕获异常/未处理拒绝也要落盘，否则崩溃现场就没了
  process.on('uncaughtException', (err) => { write('FATAL', [err instanceof Error ? err : String(err)]) })
  process.on('unhandledRejection', (err) => { write('FATAL', [err instanceof Error ? err : String(err)]) })

  write('INFO', [`启动器日志已启用: ${logFile}`])
}

export function getLogFilePath(): string {
  return logFile || currentLogFile()
}

export function getLogDir(): string {
  return LOG_DIR
}

// 复制日志用：把最近的日志内容拼成一段纯文本，带上版本/系统信息头部，方便直接贴到反馈渠道。
// 限制总长度，避免日志很大时把剪贴板撑爆（Windows 剪贴板上限约 2MB 文本）。
const COPY_MAX_BYTES = 512 * 1024

export function readLogsForCopy(maxBytes = COPY_MAX_BYTES): string {
  const header = [
    `ZNCraft Launcher 日志`,
    `版本: ${app.getVersion()}`,
    `Electron: ${process.versions.electron}  Node: ${process.versions.node}  Chrome: ${process.versions.chrome}`,
    `系统: ${process.platform} ${process.arch}`,
    `日志目录: ${LOG_DIR}`,
    ''
  ].join('\n')

  let files: string[] = []
  try {
    if (logFile && existsSync(logFile)) files.push(logFile)
    // 今天的日志优先；不存在时退回最近的历史日志
    if (files.length === 0) {
      const rest = readdirSync(LOG_DIR)
        .filter((f) => f.endsWith('.log'))
        .map((f) => join(LOG_DIR, f))
        .filter((p) => existsSync(p))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
      if (rest.length > 0) files = [rest[0]]
    }
  } catch {
    return header + '\n(无法读取日志目录)'
  }

  if (files.length === 0) return header + '\n(没有日志文件)'

  const body: string[] = []
  let total = 0
  for (const f of files) {
    try {
      let content = readFileSync(f, 'utf-8')
      const name = f.split(/[\\/]/).pop()
      const head = `===== ${name} =====`
      // 超出预算就从最早的行开始丢，只保留尾部（错误通常在最后）
      if (total + Buffer.byteLength(content, 'utf-8') > maxBytes) {
        const lines = content.split('\n')
        while (lines.length > 0 && total + Buffer.byteLength(lines.join('\n'), 'utf-8') > maxBytes) {
          lines.shift()
        }
        content = `...(已省略较早内容)\n` + lines.join('\n')
      }
      body.push(head + '\n' + content)
      total += Buffer.byteLength(content, 'utf-8')
      if (total >= maxBytes) break
    } catch {}
  }

  return header + body.join('\n')
}
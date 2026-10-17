/**
 * UTF-8 终端包装器（跨平台）
 *
 * 背景：
 *   中文 Windows 的 cmd / PowerShell 默认控制台代码页是 936(GBK)，
 *   而 Node / Vite / Electron 输出的是 UTF-8 字节。字节被按 GBK 解读，
 *   终端里的中文日志就会变成「乱码」（例如 ���Ĳ���）。
 *
 * 解决：
 *   在真正启动命令之前，先把「当前控制台」的代码页切到 65001(UTF-8)，
 *   之后同一控制台下的 vite / electron 输出就能被正确解读，中文不再乱码。
 *   非 Windows 平台无需处理，命令原样透传。
 *
 * 用法：
 *   node scripts/utf8-run.js <命令> [参数...]
 *   （package.json 的 dev / build / preview 已改为经由此包装器执行）
 */
const { spawn, spawnSync } = require('child_process')
const path = require('path')

const rawArgs = process.argv.slice(2)
if (rawArgs.length === 0) {
  console.error('[utf8-run] 用法: node scripts/utf8-run.js <命令> [参数...]')
  process.exit(1)
}

if (process.platform === 'win32') {
  // chcp 修改的是「当前控制台」的代码页；同控制台下后续进程都会沿用，
  // 因此这里切换一次，随后启动的 vite / electron 输出即为 UTF-8。
  // 注意：必须直接调用 chcp.com，经 cmd(shell:true) 中转时设置不会生效。
  try {
    spawnSync('chcp.com', ['65001'], { stdio: 'ignore' })
  } catch {
    // 切不了也无所谓（例如没有控制台的 CI 环境），继续执行即可
  }
}

// 把本地 node_modules/.bin 放到 PATH 最前面，保证脱离 npm 直接运行也能找到 vite 等命令
const binDir = path.resolve(__dirname, '..', 'node_modules', '.bin')
const env = { ...process.env }
const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path'
env[pathKey] = binDir + path.delimiter + (env[pathKey] || '')

// 简单命令按原样拼接，交给 shell 解析（Windows 下需要 shell 才能执行 .cmd）
const command = rawArgs.join(' ')

const child = spawn(command, {
  stdio: 'inherit',
  shell: true,
  windowsHide: false,
  env
})

child.on('error', (err) => {
  console.error('[utf8-run] 启动命令失败:', err && err.message ? err.message : err)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    // 让父进程以相同信号退出，保留 Ctrl+C 等行为
    process.kill(process.pid, signal)
    return
  }
  process.exit(code == null ? 0 : code)
})

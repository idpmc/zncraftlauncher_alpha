/**
 * 开源开发版（intl）构建入口
 *
 * 与国内发行版的唯一区别：开启 ZNCL_MC_DOWNLOAD=1，
 * 让 vite.config.ts 的 __ENABLE_MC_DOWNLOAD__ 为 true，
 * 从而把 src/main/download/ 打进产物。
 *
 * 用法：
 *   node scripts/build-intl.js            仅构建（out/）
 *   node scripts/build-intl.js --package  构建后打安装包（electron-builder）
 *
 * 风控红线：本脚本产出的包**只能**放在 GitHub Releases 等海外/社区渠道，
 * 不得投放到国内下载站、网盘、群文件等公开分发渠道。
 */
const { spawnSync } = require('child_process')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const withPackage = process.argv.includes('--package')

// 与 utf8-run.js 一致：先把当前控制台切到 UTF-8，避免中文日志乱码
if (process.platform === 'win32') {
  try {
    spawnSync('chcp.com', ['65001'], { stdio: 'ignore' })
  } catch {
    // 无控制台环境（CI）下切不了也无所谓
  }
}

const binDir = path.resolve(repoRoot, 'node_modules', '.bin')
const env = { ...process.env, ZNCL_MC_DOWNLOAD: '1' }
const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path'
env[pathKey] = binDir + path.delimiter + (env[pathKey] || '')

function run(args) {
  const result = spawnSync(process.execPath, [path.resolve(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), ...args], {
    cwd: repoRoot,
    env,
    stdio: 'inherit'
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('[build:intl] 开源开发版构建 —— 原版下载功能：开启')
run(['build'])

if (withPackage) {
  console.log('[build:intl] 开始打包（electron-builder）')
  const result = spawnSync('npx', ['electron-builder'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

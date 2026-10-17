#!/usr/bin/env node
/**
 * 打包前检查代码签名证书是否就绪。
 *
 * electron-builder 读取 CSC_LINK / CSC_KEY_PASSWORD 两个环境变量。
 * 密码绝不能写进 package.json 或提交进仓库，所以只从环境变量取。
 *
 * 单独拆成脚本的原因：electron-builder 在无证书时是「静默跳过签名」的
 * （winPackager.js: cscInfo == null 且 sign == null → return false），
 * 不会报错。所以「以为签了其实没签」是最容易发生且最难发现的错误。
 * 这里显式拦一道。
 */

const fs = require('fs')
const path = require('path')

const link = process.env.CSC_LINK
const password = process.env.CSC_KEY_PASSWORD

function fail(msg) {
  console.error('\n[x] ' + msg + '\n')
  console.error('需要设置两个环境变量后再打包：\n')
  console.error('  证书文件（PFX / CER，含私钥；不要把密码写在命令行里，\n')
  console.error('  历史记录会留在 shell 历史中）：\n')
  console.error('    setx CSC_LINK "D:\\certs\\zncl.pfx"\n')
  console.error('    setx CSC_KEY_PASSWORD "<你的证书密码>"\n')
  console.error('  注意：setx 只对「新开的」命令行/IDE 生效，需要重开终端。\n')
  console.error('  仅本次生效（PowerShell）：\n')
  console.error('    $env:CSC_LINK = "D:\\certs\\zncl.pfx"\n')
  console.error('    $env:CSC_KEY_PASSWORD = "<你的证书密码>"\n')
  console.error('  仅本次生效（cmd）：\n')
  console.error('    set CSC_LINK=D:\\certs\\zncl.pfx && set CSC_KEY_PASSWORD=<你的证书密码>\n')
  process.exit(1)
}

if (!link) {
  fail('未设置 CSC_LINK —— 没有证书路径，跳过签名直接打包等于白签。')
}

if (!password) {
  fail('未设置 CSC_KEY_PASSWORD —— 证书有密码保护，缺少密码无法签名。')
}

if (!fs.existsSync(link)) {
  console.error('\n[x] CSC_LINK 指向的文件不存在：' + link + '\n')
  process.exit(1)
}

const ext = path.extname(link).toLowerCase()
if (ext !== '.pfx' && ext !== '.p12') {
  console.warn('[!] 证书不是 .pfx/.p12（当前为 ' + ext + '）。')
  console.warn('    electron-builder 支持 .pfx / .p12；.cer 只含公钥，无法签名。\n')
}

const size = fs.statSync(link).size
console.log('[ok] 证书文件就绪：' + link + '（' + size.toLocaleString() + ' 字节）')
console.log('[ok] CSC_KEY_PASSWORD 已设置（长度 ' + password.length + '）')

// ---------------------------------------------------------------------
// 前置条件检查：winCodeSign 能否解包
//
// 签名用的 signtool.exe 和资源编辑用的 rcedit.exe 都来自 winCodeSign 包，
// 该包内含 macOS 的符号链接。非提权进程要创建符号链接，需要系统开启
// 「开发人员模式」，否则解包失败：
//   ERROR: Cannot create symbolic link : 客户端没有所需的权限
// electron-builder 会重试 3 次后整包构建失败。
//
// 对应配置：package.json 里 signAndEditExecutable: false 时不碰 winCodeSign，
// 所以普通 npm run package 不需要这个权限；package:signed 通过
// --config.win.signAndEditExecutable=true 打开它，才需要下面的条件。
// ---------------------------------------------------------------------
const os = require('os')
const probeDir = path.join(os.tmpdir(), 'zncl-symlink-probe-' + process.pid)
let symlinkOk = true
try {
  fs.mkdirSync(probeDir, { recursive: true })
  fs.symlinkSync(os.tmpdir(), path.join(probeDir, 'link'), 'junction')
  fs.unlinkSync(path.join(probeDir, 'link'))
} catch (e) {
  symlinkOk = false
} finally {
  try {
    fs.rmSync(probeDir, { recursive: true, force: true })
  } catch (_) {}
}

if (!symlinkOk) {
  console.error('\n[x] 当前进程无法创建符号链接，winCodeSign 解包会失败，签名无法进行。\n')
  console.error('    两个解决办法，任选其一：\n')
  console.error('    A) 用「以管理员身份运行」的 PowerShell 执行 npm run package:signed')
  console.error('       （提权进程自带 SeCreateSymbolicLinkPrivilege）\n')
  console.error('    B) 开启开发人员模式（一次性，之后普通终端即可）：\n')
  console.error('       reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock" /t REG_DWORD /f /v AllowDevelopmentWithoutDevLicense /d 1\n')
  process.exit(1)
}

console.log('[ok] 符号链接可用，winCodeSign 可正常解包')
console.log('')
console.log('    打包完成后请核对签名：')
console.log('      npm run verify:signature\n')
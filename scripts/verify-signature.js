#!/usr/bin/env node
/**
 * 核对打包产物的签名状态。
 *
 * 两个包都要查：
 *   - 安装包 Setup.exe（用户双击的第一个文件，SmartScreen 看的就是它）
 *   - win-unpacked\ZNCraftLauncher.exe（以及同目录其它 exe）
 *
 * Authenticode 的验证只能在 Windows 上做，这里通过 PowerShell 调用。
 */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const releaseDir = path.resolve(__dirname, '..', '..', 'release')
const expectedVersion = require('../package.json').version
const setupName = 'ZNCraftLauncher-' + expectedVersion + '-Setup.exe'
const setupPath = path.join(releaseDir, setupName)

if (process.platform !== 'win32') {
  console.error('[x] Authenticode 验证只能在 Windows 上进行')
  process.exit(1)
}

if (!fs.existsSync(setupPath)) {
  console.error('[x] 找不到安装包：' + setupPath)
  console.error('    期望文件名由 package.json 的 version 推导：' + expectedVersion)
  process.exit(1)
}

function signatureOf(file) {
  const ps =
    '$ErrorActionPreference = "Stop"; ' +
    '$s = Get-AuthenticodeSignature -LiteralPath ' +
    "'" + file.replace(/'/g, "''") + "'" +
    '; ' +
    '$h = (Get-FileHash -LiteralPath ' +
    "'" + file.replace(/'/g, "''") + "'" +
    ' -Algorithm SHA256).Hash; ' +
    '[PSCustomObject]@{ Status = $s.Status.ToString(); ' +
    'Subject = $(if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { "" }); ' +
    'NotAfter = $(if ($s.SignerCertificate) { $s.SignerCertificate.NotAfter.ToString("yyyy-MM-dd") } else { "" }); ' +
    'Timestamp = $(if ($s.TimeStamperCertificate) { $s.TimeStamperCertificate.Subject } else { "" }); ' +
    'SHA256 = $h } | ConvertTo-Json -Compress'

  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8' }
  )
  return JSON.parse(out.trim())
}

const targets = [setupPath]

const unpacked = path.join(releaseDir, 'win-unpacked')
if (fs.existsSync(unpacked)) {
  for (const f of fs.readdirSync(unpacked)) {
    if (f.toLowerCase().endsWith('.exe')) targets.push(path.join(unpacked, f))
  }
}

let unsigned = 0
for (const t of targets) {
  const rel = path.relative(path.dirname(releaseDir), t)
  const info = signatureOf(t)
  const signed = info.Status === 'Valid'
  if (!signed) unsigned++

  console.log('=== ' + rel + ' ===')
  console.log('  签名状态 : ' + info.Status + (signed ? '' : '   <-- 未通过'))
  console.log('  签名者   : ' + (info.Subject || '(无)'))
  console.log('  证书到期 : ' + (info.NotAfter || '-'))
  console.log('  时间戳   : ' + (info.Timestamp ? '有（签名在证书过期后依然有效）' : '无'))
  console.log('  SHA256   : ' + info.SHA256)
  console.log('')
}

if (unsigned > 0) {
  console.log('结果：' + unsigned + ' / ' + targets.length + ' 个文件未通过签名验证。')
  console.log('')
  console.log('无签名的必然结果（这不是 bug）：')
  console.log('  · SmartScreen 蓝窗「Windows 已保护你的电脑」，只有「不运行」')
  console.log('    用户必须点「更多信息 → 仍要运行」')
  console.log('  · 自签名证书的表现和不签名完全一样，不要用自签名糊弄')
  console.log('  · EV 证书自2024 年起也不再即时获得信誉，OV 即可')
  console.log('')
  console.log('临时绕过（每台机器一次）：')
  console.log('  Unblock-File -Path .\\' + setupName)
  console.log('')
  process.exit(1)
}

console.log('结果：全部 ' + targets.length + ' 个文件签名有效。')
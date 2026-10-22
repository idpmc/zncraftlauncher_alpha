/**
 * 客户端 jar / 资源完整性判据（主进程与单元测试共用）
 *
 * 背景（回退合规开关后暴露出来的缺陷）：
 * 1) 官方清单里有 21 个版本的 client.jar 本身就只有 26KB~876KB
 *    （a1.0.16=840KB、c0.0.11a=66KB、rd-132211=26KB …），
 *    用固定的 "1MB" 阈值判断"是否缺失"会让它们永远补不齐、永远启动不了；
 * 2) 只看体积又识别不出"下载中断留下的截断文件"，会被当成完整文件直接跳过下载，
 *    导致用户看到"安装成功"但实际 jar 是坏的，而且再点下载仍被跳过。
 *
 * 正解是以版本 json 里的 downloads.client.size（官方体积）作为权威判据；
 * 拿不到官方体积时才退回宽松阈值（只排除空文件/明显损坏）。
 */
import fs from 'fs'
import path from 'path'

/** 读取版本 json，解析失败返回 null（不抛） */
export function readVersionJsonSafe(jsonPath: string): any | null {
  try {
    if (!fs.existsSync(jsonPath)) return null
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  } catch {
    return null
  }
}

/** 官方客户端 jar 体积（字节）；取不到返回 null */
export function getExpectedClientSize(versionJson: any): number | null {
  const size = versionJson?.downloads?.client?.size
  return typeof size === 'number' && size > 0 ? size : null
}

/** 官方客户端 jar 的 sha1（版本 json 里就有，之前一直没用来校验） */
export function getExpectedClientSha1(versionJson: any): string | undefined {
  const sha1 = versionJson?.downloads?.client?.sha1
  return typeof sha1 === 'string' && sha1.length === 40 ? sha1 : undefined
}

/**
 * client.jar 是否"完整可用"。
 * @param expectedSize 官方体积；有则按体积判定（能识别截断），无则退回宽松阈值
 */
export function isClientJarUsable(jarPath: string, expectedSize: number | null | undefined): boolean {
  let size = 0
  try {
    if (!fs.existsSync(jarPath)) return false
    size = fs.statSync(jarPath).size
  } catch {
    return false
  }
  if (size <= 0) return false
  if (expectedSize) {
    // 容忍极小的写入误差；明显偏小即为下载中断的残缺文件
    // （阈值向下取整，避免浮点误差把"刚好 98%"的文件判成残缺）
    return size >= Math.floor(expectedSize * 0.98)
  }
  return size >= 10 * 1024
}

/**
 * 资源（assets）是否已就绪。
 * 整合包安装走的是"轻量版"下载（只有 json + jar），资源完全没下，
 * 而启动守卫又因为"jar 已存在且加载器已合并"而不触发补齐，
 * 结果整合包会以"零 vanilla 资源"启动（黑紫块 / 缺模型 / 语言回退英文）。
 */
export function isVersionAssetsReady(versionJson: any, minecraftDir: string): boolean {
  const indexId = versionJson?.assetIndex?.id
  if (!indexId) return true // 该版本没有资源需求
  const indexFile = path.join(minecraftDir, 'assets', 'indexes', `${indexId}.json`)
  if (!fs.existsSync(indexFile)) return false
  try {
    const parsed = JSON.parse(fs.readFileSync(indexFile, 'utf-8'))
    if (!parsed || typeof parsed !== 'object') return false
  } catch {
    return false
  }
  // 索引下载完但对象还没下（下载中断）也算未就绪
  try {
    const objectsDir = path.join(minecraftDir, 'assets', 'objects')
    if (!fs.existsSync(objectsDir)) return false
    if (fs.readdirSync(objectsDir).length === 0) return false
  } catch {
    return false
  }
  return true
}

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  readVersionJsonSafe,
  getExpectedClientSize,
  getExpectedClientSha1,
  isClientJarUsable,
  isVersionAssetsReady
} from './client-jar-integrity.ts'

// 官方清单里真实存在的"小体积"老版本 client.jar（实测 Mojang 官方数据）
const OFFICIAL_SMALL_JAR_SIZE = 860090 // a1.0.16 = 840KB
const OFFICIAL_TINY_JAR_SIZE = 67430 // c0.0.11a = 66KB
const OFFICIAL_MODERN_JAR_SIZE = 23028853 // 1.20.1 = 22MB

describe('客户端 jar 完整性判据', () => {
  let tmpDir: string

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zncl-jar-integrity-'))
  })

  after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  })

  const writeFile = (name: string, content: string | Buffer) => {
    const p = path.join(tmpDir, name)
    fs.writeFileSync(p, content)
    return p
  }

  describe('getExpectedClientSize', () => {
    it('取版本 json 里的官方体积', () => {
      const json = { downloads: { client: { size: 23028853, sha1: 'a'.repeat(40) } } }
      assert.equal(getExpectedClientSize(json), 23028853)
    })

    it('缺失或非法时返回 null', () => {
      assert.equal(getExpectedClientSize(null), null)
      assert.equal(getExpectedClientSize({}), null)
      assert.equal(getExpectedClientSize({ downloads: { client: {} } }), null)
      assert.equal(getExpectedClientSize({ downloads: { client: { size: 0 } } }), null)
      assert.equal(getExpectedClientSize({ downloads: { client: { size: 'x' } } }), null)
    })
  })

  describe('getExpectedClientSha1', () => {
    it('取 40 位 sha1', () => {
      const sha1 = 'b'.repeat(40)
      assert.equal(getExpectedClientSha1({ downloads: { client: { sha1 } } }), sha1)
    })

    it('缺失或长度不对时返回 undefined', () => {
      assert.equal(getExpectedClientSha1(null), undefined)
      assert.equal(getExpectedClientSha1({ downloads: { client: { sha1: 'short' } } }), undefined)
    })
  })

  describe('isClientJarUsable', () => {
    it('文件不存在 → 不可用', () => {
      assert.equal(isClientJarUsable(path.join(tmpDir, 'nope.jar'), OFFICIAL_MODERN_JAR_SIZE), false)
    })

    it('空文件 → 不可用', () => {
      const p = writeFile('empty.jar', '')
      assert.equal(isClientJarUsable(p, OFFICIAL_MODERN_JAR_SIZE), false)
      assert.equal(isClientJarUsable(p, null), false)
    })

    it('老版本官方 jar 本身就小于 1MB：按官方体积判定为可用（回归：以前用 1MB 阈值永远补不齐）', () => {
      const p = writeFile('a1.0.16.jar', Buffer.alloc(OFFICIAL_SMALL_JAR_SIZE, 1))
      // 老阈值（1MB）会误判成缺失 → 启动时反复报"找不到客户端文件"
      assert.ok(OFFICIAL_SMALL_JAR_SIZE < 1024 * 1024)
      assert.equal(isClientJarUsable(p, OFFICIAL_SMALL_JAR_SIZE), true)
      assert.equal(isClientJarUsable(p, OFFICIAL_TINY_JAR_SIZE), true)
    })

    it('下载中断留下的截断 jar → 不可用（回归：以前只看"是否 >= 1MB"，截断文件被当成完整文件永久跳过下载）', () => {
      const p = writeFile('truncated.jar', Buffer.alloc(Math.floor(OFFICIAL_MODERN_JAR_SIZE / 2), 1))
      assert.ok(fs.statSync(p).size >= 1024 * 1024) // 旧阈值会误判为"完整"
      assert.equal(isClientJarUsable(p, OFFICIAL_MODERN_JAR_SIZE), false)
    })

    it('体积接近官方值（>= 98%）时视为完整，容忍写入误差', () => {
      const p = writeFile('almost.jar', Buffer.alloc(Math.floor(OFFICIAL_MODERN_JAR_SIZE * 0.98), 1))
      assert.equal(isClientJarUsable(p, OFFICIAL_MODERN_JAR_SIZE), true)
    })

    it('拿不到官方体积时退回宽松阈值（只排除空文件/明显损坏）', () => {
      const ok = writeFile('noexpected.jar', Buffer.alloc(26 * 1024, 1))
      assert.equal(isClientJarUsable(ok, null), true)
      const tiny = writeFile('tiny.jar', Buffer.alloc(2 * 1024, 1))
      assert.equal(isClientJarUsable(tiny, null), false)
    })
  })

  describe('readVersionJsonSafe', () => {
    it('文件不存在 → null', () => {
      assert.equal(readVersionJsonSafe(path.join(tmpDir, 'nope.json')), null)
    })

    it('内容不是合法 JSON → null', () => {
      const p = writeFile('broken.json', '{ not json')
      assert.equal(readVersionJsonSafe(p), null)
    })

    it('正常 json → 解析结果', () => {
      const p = writeFile('ok.json', JSON.stringify({ id: '1.20.1' }))
      assert.deepEqual(readVersionJsonSafe(p), { id: '1.20.1' })
    })
  })

  describe('isVersionAssetsReady', () => {
    it('版本没有资源需求 → 视为就绪', () => {
      assert.equal(isVersionAssetsReady({}, tmpDir), true)
      assert.equal(isVersionAssetsReady(null, tmpDir), true)
    })

    it('资源索引文件不存在 → 未就绪（回归：整合包只下 json+jar，资源完全没下）', () => {
      const json = { assetIndex: { id: '5', url: 'http://x/5.json' } }
      assert.equal(isVersionAssetsReady(json, tmpDir), false)
    })

    it('资源索引存在但内容损坏 → 未就绪', () => {
      const indexesDir = path.join(tmpDir, 'assets', 'indexes')
      fs.mkdirSync(indexesDir, { recursive: true })
      fs.writeFileSync(path.join(indexesDir, '5.json'), '{ broken')
      assert.equal(isVersionAssetsReady({ assetIndex: { id: '5' } }, tmpDir), false)
    })

    it('索引可用但对象目录为空（下载中断）→ 未就绪', () => {
      const indexesDir = path.join(tmpDir, 'assets', 'indexes')
      fs.mkdirSync(indexesDir, { recursive: true })
      fs.writeFileSync(path.join(indexesDir, '5.json'), JSON.stringify({ objects: {} }))
      fs.mkdirSync(path.join(tmpDir, 'assets', 'objects'), { recursive: true })
      assert.equal(isVersionAssetsReady({ assetIndex: { id: '5' } }, tmpDir), false)
    })

    it('索引可用且对象已下载 → 就绪', () => {
      const indexesDir = path.join(tmpDir, 'assets', 'indexes')
      fs.mkdirSync(indexesDir, { recursive: true })
      fs.writeFileSync(path.join(indexesDir, '5.json'), JSON.stringify({ objects: { 'a/b': { hash: 'ab', size: 1 } } }))
      fs.mkdirSync(path.join(tmpDir, 'assets', 'objects', 'ab'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, 'assets', 'objects', 'ab', 'ab'), 'x')
      assert.equal(isVersionAssetsReady({ assetIndex: { id: '5' } }, tmpDir), true)
    })
  })
})

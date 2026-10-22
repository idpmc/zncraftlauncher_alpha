/**
 * src/stores/versions.ts 的通知横幅单元测试
 * 运行：npm test（node --test，Node 22.18+ 直接跑 TS，无需编译）
 *
 * 回归场景：下载过程中关闭横幅后，download-progress 高频事件会把横幅
 * 反复重新弹出（"关不掉了 会在弹出来"）。
 */
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useVersionsStore } from './versions.ts'

describe('下载通知横幅：关闭后不被进度事件复活', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  test('下载中关闭横幅后，后续 downloading 进度不再重新弹出', () => {
    const store = useVersionsStore()

    store.addNotification('1.20.1', '1.20.1', 'downloading', 0, '下载准备中')
    assert.equal(store.notifications.length, 1, '应先出现一条下载横幅')

    // 用户点 × 关闭
    const id = store.notifications[0].id
    store.removeNotification(id)
    assert.equal(store.notifications.length, 0, '关闭后横幅应消失')

    // 后续高频的进度事件
    store.addNotification('1.20.1', '1.20.1', 'downloading', 30, '下载中')
    store.addNotification('1.20.1', '1.20.1', 'downloading', 60, '下载中')
    assert.equal(store.notifications.length, 0, '关闭后不应被进度事件复活')
  })

  test('关闭下载横幅后，失败提示仍要能弹出（一次性结果不能被吞掉）', () => {
    const store = useVersionsStore()

    store.addNotification('1.20.1', '1.20.1', 'downloading', 0, '下载准备中')
    store.removeNotification(store.notifications[0].id)

    store.addNotification('1.20.1', '1.20.1', 'failed', 0, '下载失败')
    assert.equal(store.notifications.length, 1, '失败提示应正常弹出')
    assert.equal(store.notifications[0].type, 'failed')
  })

  test('关闭下载横幅后，完成提示仍要能弹出', () => {
    const store = useVersionsStore()

    store.addNotification('1.20.1', '1.20.1', 'downloading', 0, '下载准备中')
    store.removeNotification(store.notifications[0].id)

    store.addNotification('1.20.1', '1.20.1', 'completed', 100, '下载完成')
    assert.equal(store.notifications.length, 1, '完成提示应正常弹出')
    assert.equal(store.notifications[0].type, 'completed')
  })

  test('关闭的只是当前版本，不影响其他版本的横幅', () => {
    const store = useVersionsStore()

    store.addNotification('1.20.1', '1.20.1', 'downloading', 0, '下载准备中')
    store.removeNotification(store.notifications[0].id)

    store.addNotification('1.21', '1.21', 'downloading', 0, '下载准备中')
    assert.equal(store.notifications.length, 1, '其他版本的横幅应正常显示')
    assert.equal(store.notifications[0].versionId, '1.21')
  })

  test('未关闭时，进度事件只更新同一条横幅而不是新增', () => {
    const store = useVersionsStore()

    store.addNotification('1.20.1', '1.20.1', 'downloading', 0, '下载准备中')
    store.addNotification('1.20.1', '1.20.1', 'downloading', 50, '下载中')

    assert.equal(store.notifications.length, 1, '同一版本只应有一条横幅')
    assert.equal(store.notifications[0].progress, 50, '进度应被更新')
  })

  test('关闭失败提示不会连带屏蔽下载中的横幅', () => {
    const store = useVersionsStore()

    store.addNotification('1.20.1', '1.20.1', 'failed', 0, '下载失败')
    store.removeNotification(store.notifications[0].id)

    store.addNotification('1.20.1', '1.20.1', 'downloading', 0, '下载准备中')
    assert.equal(store.notifications.length, 1, '仅关闭 failed 横幅不应屏蔽后续下载横幅')
  })
})

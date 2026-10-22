import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useTelemetryStore } from './telemetry'
import { useDownloadsStore } from './downloads'
import { useSettingsStore } from './settings'
import { i18n } from '../locales'

export interface Version {
  id: string
  type: 'release' | 'snapshot' | 'old_alpha' | 'old_beta' | 'april_fools'
  releaseDate: string
  installed: boolean
  downloading?: boolean
  downloadPaused?: boolean
  downloadProgress?: number
  url?: string
  displayName?: string
  directoryName?: string
  loader?: string
  isModpack?: boolean
  packName?: string
  mcVersion?: string
}

export const useVersionsStore = defineStore('versions', () => {
  const versions = ref<Version[]>([])
  const isLoading = ref(false)
  const isDownloading = ref(false)
  const lastSyncTime = ref<Date | null>(null)

  const notifications = ref<{ id: string; versionId: string; versionName: string; type: 'downloading' | 'completed' | 'failed' | 'info'; progress: number; message?: string; timestamp: number }[]>([])

  // 用户手动关闭过的通知（按 versionId 记录），关闭后该下载的进度更新不再重新弹出
  const dismissedNotifications = new Set<string>()

  const addNotification = (versionId: string, versionName: string, type: 'downloading' | 'completed' | 'failed' | 'info', progress: number = 0, message?: string) => {
    // 用户已手动关闭该版本的下载横幅，忽略后续高频的进度更新，避免"关掉又弹出"
    // （completed / failed 属于一次性结果，仍需正常提示给用户）
    if (type === 'downloading' && dismissedNotifications.has(versionId)) return

    const id = `notif-${versionId}-${Date.now()}`
    
    const existing = notifications.value.find(n => n.versionId === versionId)
    if (existing) {
      existing.type = type
      existing.progress = progress
      existing.message = message
      existing.timestamp = Date.now()
      if (type === 'completed' || type === 'failed') {
        setTimeout(() => {
          const idx = notifications.value.findIndex(n => n.id === existing.id)
          if (idx > -1) notifications.value.splice(idx, 1)
        }, 5000)
      }
      return
    }

    notifications.value.push({ id, versionId, versionName, type, progress, message, timestamp: Date.now() })
    
    if (type === 'completed' || type === 'failed') {
      setTimeout(() => {
        const idx = notifications.value.findIndex(n => n.id === id)
        if (idx > -1) notifications.value.splice(idx, 1)
      }, 5000)
    }
  }

  const removeNotification = (id: string) => {
    const idx = notifications.value.findIndex(n => n.id === id)
    if (idx > -1) {
      const removed = notifications.value[idx]
      // 只记下"下载中"的横幅：关掉后不再被进度事件复活
      if (removed.type === 'downloading') dismissedNotifications.add(removed.versionId)
      notifications.value.splice(idx, 1)
    }
  }

  // ========== 资源完整性检查状态（全局，切换界面不丢失） ==========
  const assetCheckActive = ref(false)
  const assetCheckProgress = ref(0)
  const assetCheckTotal = ref(0)
  const assetCheckDone = ref(0)
  const assetCheckMessage = ref('')
  const assetCheckVersionId = ref('')

  const runAssetCheck = async (versionId: string, directoryName?: string) => {
    assetCheckActive.value = true
    assetCheckProgress.value = 0
    assetCheckDone.value = 0
    assetCheckTotal.value = 0
    assetCheckMessage.value = i18n.global.t('rt.stVersions.assetChecking')
    assetCheckVersionId.value = versionId

    const removeListener = window.electronAPI?.onCheckAssetsProgress?.((_e: unknown, data: { total: number; done: number; progress: number; hash: string; fixed: number }) => {
      assetCheckTotal.value = data.total
      assetCheckDone.value = data.done
      assetCheckProgress.value = data.progress
      assetCheckMessage.value = i18n.global.t('rt.stVersions.assetRepairing', { done: data.done, total: data.total })
    })

    try {
      const result = await window.electronAPI?.checkAndFixAssets(versionId, directoryName)
      if (result && result.success) {
        assetCheckProgress.value = 100
        assetCheckMessage.value = result.message || i18n.global.t('rt.stVersions.assetComplete')
      } else {
        assetCheckMessage.value = i18n.global.t('rt.stVersions.assetCheckFailed', { error: result?.error || i18n.global.t('rt.stVersions.unknownError') })
      }
      return result
    } finally {
      if (removeListener) removeListener()
      // 完成后稍作停留再关闭，让用户看到结果
      setTimeout(() => {
        assetCheckActive.value = false
        if (assetCheckProgress.value >= 100) {
          assetCheckMessage.value = ''
        }
      }, 3000)
    }
  }

  const installedCount = computed(() => versions.value.filter(v => v.installed).length)

  let isScanning = false
  let isVerifying = false
  let isSyncing = false

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const saveToLocalStorage = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem('mc-versions', JSON.stringify(versions.value))
        localStorage.setItem('mc-versions-sync-time', lastSyncTime.value?.toISOString() || new Date().toISOString())
      } catch (error) {
        console.error('保存版本到本地存储失败:', error)
      }
    }, 1000)
  }

  // 立即保存（用于关键状态变更，如下载开始/完成）
  const saveToLocalStorageNow = () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    try {
      localStorage.setItem('mc-versions', JSON.stringify(versions.value))
      localStorage.setItem('mc-versions-sync-time', lastSyncTime.value?.toISOString() || new Date().toISOString())
    } catch (error) {
      console.error('保存版本到本地存储失败:', error)
    }
  }

  // 辅助函数：获取版本的唯一操作键
  const getVersionKey = (v: Version) => v.directoryName || v.id

  // 注册全局下载进度监听器（仅注册一次，刷新后也能恢复监听）
  let globalListenersRegistered = false
  const registerGlobalDownloadListeners = () => {
    if (globalListenersRegistered || !window.electronAPI?.onDownloadProgress) return
    globalListenersRegistered = true

    // 监听下载进度 - 更新对应版本的进度
    window.electronAPI.onDownloadProgress((_event: unknown, data: { versionId: string; type: string; progress: number }) => {
      const cur = versions.value.find(v => getVersionKey(v) === data.versionId)
      if (!cur || !cur.downloading) return
      let weightedProgress = 0
      if (data.type === 'json') {
        weightedProgress = data.progress * 0.05
      } else if (data.type === 'jar') {
        weightedProgress = 5 + data.progress * 0.15
      } else if (data.type === 'libraries') {
        weightedProgress = 20 + data.progress * 0.80
      }
      cur.downloadProgress = Math.round(weightedProgress)
    })

    // 监听下载完成 - 标记版本状态（刷新后也能接收到完成事件）
    window.electronAPI.onDownloadComplete((_event: unknown, data: { versionId: string; success: boolean; error?: string }) => {
      const cur = versions.value.find(v => getVersionKey(v) === data.versionId)
      if (!cur) return
      if (data.success) {
        cur.installed = true
        cur.downloading = false
        cur.downloadPaused = false
        cur.downloadProgress = 100
      } else {
        cur.downloading = false
        cur.downloadPaused = false
        cur.downloadProgress = 0
      }
      // 如果当前没有其他下载，重置全局下载状态
      const stillDownloading = versions.value.some(v => v.downloading)
      if (!stillDownloading) {
        isDownloading.value = false
      }
      saveToLocalStorageNow()
    })

    // 监听下载暂停
    if (window.electronAPI.onDownloadPaused) {
      window.electronAPI.onDownloadPaused((_event: unknown, data: { versionId: string }) => {
        const cur = versions.value.find(v => getVersionKey(v) === data.versionId)
        if (cur) {
          cur.downloadPaused = true
          saveToLocalStorageNow()
        }
      })
    }

    // 监听下载继续
    if (window.electronAPI.onDownloadResumed) {
      window.electronAPI.onDownloadResumed((_event: unknown, data: { versionId: string }) => {
        const cur = versions.value.find(v => getVersionKey(v) === data.versionId)
        if (cur) {
          cur.downloadPaused = false
          saveToLocalStorageNow()
        }
      })
    }

    // 监听下载取消
    if (window.electronAPI.onDownloadCancelled) {
      window.electronAPI.onDownloadCancelled((_event: unknown, data: { versionId: string }) => {
        const cur = versions.value.find(v => getVersionKey(v) === data.versionId)
        if (cur) {
          cur.downloading = false
          cur.downloadPaused = false
          cur.downloadProgress = 0
        }
        const stillDownloading = versions.value.some(v => v.downloading)
        if (!stillDownloading) {
          isDownloading.value = false
        }
        saveToLocalStorageNow()
      })
    }
  }

  // 从 Minecraft 官网获取版本列表（带国内镜像 fallback）
  const fetchVersionsFromOfficial = async (): Promise<boolean> => {
    if (isSyncing) {
      console.log('[Versions] 已有同步正在进行中，跳过本次调用')
      return false
    }

    const hasDownloading = versions.value.some(v => v.downloading)
    if (hasDownloading) {
      console.log('[Versions] 有版本正在下载，跳过高官同步以避免重置下载状态')
      return false
    }

    isSyncing = true
    isLoading.value = true
    try {
      // 版本清单也遵循「下载源」策略：official 官方优先，其余镜像优先
      const preferMirror = useSettingsStore().settings.downloadSource !== 'official'
      const officialManifest = 'https://launchermeta.mojang.com/mc/game/version_manifest.json'
      const mirrorManifest = 'https://bmclapi2.bangbang93.com/mc/game/version_manifest.json'
      const mcbbsManifest = 'https://download.mcbbs.net/mc/game/version_manifest.json'
      const manifestUrls = preferMirror
        ? [mirrorManifest, mcbbsManifest, officialManifest]
        : [officialManifest, mirrorManifest, mcbbsManifest]

      let data: any = null
      let lastError: any = null

      for (const url of manifestUrls) {
        try {
          console.log(`[Versions] 尝试从 ${url} 获取版本列表...`)
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }
          data = await response.json()
          console.log(`[Versions] 成功从 ${url} 获取版本列表`)
          break
        } catch (err) {
          lastError = err
          console.warn(`[Versions] 从 ${url} 获取失败:`, err)
        }
      }

      if (!data) {
        throw lastError || new Error(i18n.global.t('rt.stVersions.versionListFailed'))
      }
      
      const officialVersions: Version[] = []
      
      // 处理正式版
      data.versions.forEach((v: any) => {
        let type: Version['type'] = 'release'
        
        if (v.type === 'snapshot') {
          type = 'snapshot'
        } else if (v.type === 'old_alpha') {
          type = 'old_alpha'
        } else if (v.type === 'old_beta') {
          type = 'old_beta'
        } else if (v.id.includes('w') || v.id.includes('pre') || v.id.includes('rc')) {
          // 愚人节版本检测
          if (v.id.includes('23w13a_or_b') || v.id.includes('22w13oneBlockAtATime') || 
              v.id.includes('20w14infinite') || v.id.includes('3D Shareware') ||
              v.id.includes('1.RV-Pre1') || v.id.includes('15w14a') ||
              v.id.includes('2.0') || v.id.includes('1.5red')) {
            type = 'april_fools'
          }
        }
        
        officialVersions.push({
          id: v.id,
          type: type,
          releaseDate: v.releaseTime ? v.releaseTime.split('T')[0] : new Date().toISOString().split('T')[0],
          installed: false,
          url: v.url
        })
      })
      
      // 保留自定义实例的静态元数据（directoryName与id不同的条目），但动态状态由磁盘扫描决定
      const previousBaseVersions = new Map<string, Version>()
      const customInstances: Version[] = []

      for (const v of versions.value) {
        if (v.directoryName && v.directoryName !== v.id) {
          customInstances.push({
            ...v,
            installed: false,
            downloading: false,
            downloadPaused: false,
            downloadProgress: 0
          })
        } else {
          previousBaseVersions.set(v.id, v)
        }
      }

      // 只在 mergedVersions 中保存基础版本，自定义实例由磁盘扫描决定
      // 旧的自定义实例不在此保留，扫描会根据磁盘实际状态重新添加
      const mergedVersions: Version[] = officialVersions.map(v => {
        const prev = previousBaseVersions.get(v.id)
        return {
          ...v,
          installed: false,
          downloading: false,
          downloadPaused: false,
          downloadProgress: 0,
          displayName: prev?.displayName,
          directoryName: prev?.directoryName,
          loader: prev?.loader
        }
      })

      versions.value = [...mergedVersions]
      
      console.log('[Versions] 已从官网同步版本列表，动态状态已重置，自定义实例将由磁盘扫描决定')
      
      lastSyncTime.value = new Date()
      
      saveToLocalStorageNow()
      
      return true
    } catch (error) {
      console.error('获取官方版本失败:', error)
      // 尝试从本地存储加载
      loadFromLocalStorage()
      return false
    } finally {
      isLoading.value = false
      isSyncing = false
    }
  }

  // 判断目录名是否是启动器自动生成的（不是用户自定义的）
  const isAutoGeneratedDirName = (dirName: string, versionId: string): boolean => {
    if (dirName === versionId) return true
    const autoPattern = new RegExp(`^${versionId.replace(/\./g, '\\.')}-\\d{8}(-\\d+)?$`)
    return autoPattern.test(dirName)
  }

  // 从本地存储加载（只加载静态元数据，动态状态由磁盘扫描决定）
  const loadFromLocalStorage = () => {
    try {
      const saved = localStorage.getItem('mc-versions')
      if (saved) {
        const parsed = JSON.parse(saved)
        // 只保留静态元数据，清除动态状态（这些由磁盘扫描决定）
        versions.value = parsed.map((v: Version) => ({
          id: v.id,
          type: v.type,
          releaseDate: v.releaseDate,
          url: v.url,
          directoryName: v.directoryName,
          displayName: v.displayName,
          loader: v.loader,
          isModpack: v.isModpack,
          packName: v.packName,
          mcVersion: v.mcVersion,
          installed: false,
          downloading: false,
          downloadPaused: false,
          downloadProgress: 0
        }))
      }
      const syncTime = localStorage.getItem('mc-versions-sync-time')
      if (syncTime) {
        lastSyncTime.value = new Date(syncTime)
      }

      // 修复自动生成目录名被误标为自命名的问题
      let fixedDisplayName = false
      for (const v of versions.value) {
        const dirName = v.directoryName || v.id
        if (v.directoryName && isAutoGeneratedDirName(dirName, v.id)) {
          if (v.displayName && v.displayName !== v.id && v.displayName === dirName) {
            console.log(`[Versions] 修复自动生成目录名的显示名称: ${dirName} -> ${v.id}`)
            v.displayName = v.id
            fixedDisplayName = true
          }
        }
      }
      if (fixedDisplayName) {
        saveToLocalStorageNow()
      }
    } catch (error) {
      console.error('从本地存储加载版本失败:', error)
    }
  }

  // 初始化 - 优先从本地加载，如果没有则从官网获取
  const verifyInstalledVersions = async () => {
    if (!window.electronAPI?.checkVersionInstalled) return
    if (isVerifying) {
      console.log('[Versions] 已有验证正在进行中，跳过本次调用')
      return
    }

    isVerifying = true
    console.log('[Versions] 开始验证已安装版本的文件存在性...')
    try {
      const versionsToVerify = versions.value.filter(v => v.installed || (v.downloading && v.downloadProgress >= 100))
      let changed = false

      for (const version of versionsToVerify) {
        const dirName = version.directoryName || version.id
        try {
          const result = await window.electronAPI.checkVersionInstalled(version.id, dirName)
          if (result.success && !result.installed) {
            console.warn(`[Versions] 版本文件缺失，标记为未安装: ${dirName} (原因: ${result.reason || '未知'})`)
            version.installed = false
            version.downloadProgress = 0
            version.downloadPaused = false
            version.downloading = false
            changed = true
          } else if (result.success && result.installed) {
            if (version.downloading || !version.installed) {
              console.log(`[Versions] 版本 ${dirName} 文件完整，清理卡死的下载状态`)
              version.installed = true
              version.downloading = false
              version.downloadPaused = false
              version.downloadProgress = 100
              changed = true
            }
          }
        } catch (err) {
          console.warn(`[Versions] 检查版本失败: ${dirName}`, err)
        }
      }

      if (changed) {
        console.log('[Versions] 检测到文件缺失的版本，已更新状态')
        saveToLocalStorageNow()
      } else {
        console.log('[Versions] 所有已安装版本文件验证通过')
      }
    } finally {
      isVerifying = false
    }
  }

  // 重置所有版本的已安装状态（切换游戏目录时使用）
  const resetInstalledStatus = () => {
    let changed = false
    for (const v of versions.value) {
      if (v.installed || v.downloading || v.downloadPaused) {
        v.installed = false
        v.downloading = false
        v.downloadPaused = false
        v.downloadProgress = 0
        changed = true
      }
    }
    if (changed) {
      saveToLocalStorageNow()
      console.log('[Versions] 已重置所有版本的安装状态（切换游戏目录）')
    }
  }

  // 扫描当前游戏目录下已安装的版本
  const scanInstalledVersions = async (resetBeforeScan = false) => {
    if (!window.electronAPI?.scanInstalledVersions) return
    if (isScanning) {
      console.log('[Versions] 已有扫描正在进行中，跳过本次调用')
      return
    }

    isScanning = true
    console.log('[Versions] ====== 开始扫描 ======')

    if (resetBeforeScan) {
      resetInstalledStatus()
    }

    console.log('[Versions] 开始扫描当前游戏目录下的已安装版本...')
    try {
      const result = await window.electronAPI.scanInstalledVersions()
      if (!result.success || !result.versions || result.versions.length === 0) {
        console.log('[Versions] 没有在当前目录下找到已安装的版本，清除所有自定义实例并标记基础版本为未安装')
        const versionsToRemove: Version[] = []
        for (const v of versions.value) {
          if (v.directoryName && v.directoryName !== v.id) {
            versionsToRemove.push(v)
          } else {
            v.installed = false
            v.downloadProgress = 0
            v.downloadPaused = false
            v.downloading = false
          }
        }
        for (const v of versionsToRemove) {
          const idx = versions.value.indexOf(v)
          if (idx >= 0) versions.value.splice(idx, 1)
        }
        saveToLocalStorageNow()
        return
      }

      console.log(`[Versions] 扫描到 ${result.versions.length} 个已安装版本`)
      let changed = false

      for (const scanned of result.versions) {
        const existing = versions.value.find(v => 
          (v.directoryName || v.id) === scanned.directoryName
        )

        if (existing) {
          if (!existing.installed || existing.downloading) {
            console.log(`[Versions] 发现已安装版本: ${scanned.directoryName}，标记为已安装`)
            existing.installed = true
            existing.downloading = false
            existing.downloadPaused = false
            existing.downloadProgress = 100
            changed = true
          }
          // 更新整合包标记（兼容旧数据：此前安装的整合包没有 isModpack）
          if (scanned.isModpack && !existing.isModpack) {
            existing.isModpack = true
            existing.packName = scanned.packName || existing.packName
            existing.mcVersion = scanned.mcVersion || existing.mcVersion
            existing.displayName = scanned.packName || existing.displayName
            changed = true
          }
        } else {
          console.log(`[Versions] 发现新版本: ${scanned.directoryName} (${scanned.versionId})，添加到列表`)
          const baseVersion = versions.value.find(v => v.id === scanned.versionId)
          const isAutoName = isAutoGeneratedDirName(scanned.directoryName, scanned.versionId)
          const newVersion: Version = {
            id: scanned.versionId,
            type: baseVersion?.type || 'release',
            releaseDate: baseVersion?.releaseDate || new Date().toISOString().split('T')[0],
            installed: true,
            downloadProgress: 100,
            url: baseVersion?.url,
            // 整合包优先使用包名显示
            displayName: scanned.isModpack && scanned.packName
              ? scanned.packName
              : (isAutoName ? scanned.versionId : scanned.directoryName),
            directoryName: scanned.directoryName,
            loader: baseVersion?.loader,
            isModpack: scanned.isModpack || undefined,
            packName: scanned.packName,
            mcVersion: scanned.mcVersion
          }
          
          if (baseVersion) {
            const baseIndex = versions.value.findIndex(v => v.id === scanned.versionId && (!v.directoryName || v.directoryName === scanned.versionId))
            if (baseIndex >= 0) {
              versions.value.splice(baseIndex + 1, 0, newVersion)
            } else {
              versions.value.push(newVersion)
            }
          } else {
            versions.value.unshift(newVersion)
          }
          changed = true
        }
      }

      const scannedDirNames = new Set(result.versions.map((v: any) => v.directoryName))
      
      const versionsToRemove: Version[] = []
      for (const v of versions.value) {
        const dirName = v.directoryName || v.id
        const onDisk = scannedDirNames.has(dirName)
        
        if (!onDisk) {
          if (v.directoryName && v.directoryName !== v.id) {
            console.log(`[Versions] 自定义实例 ${dirName} 不在磁盘上，从列表中移除`)
            versionsToRemove.push(v)
            changed = true
          } else if (v.installed && !v.downloading) {
            console.log(`[Versions] 版本 ${dirName} 不在磁盘上，标记为未安装`)
            v.installed = false
            v.downloadProgress = 0
            v.downloadPaused = false
            v.downloading = false
            changed = true
          }
        }
      }
      
      for (const v of versionsToRemove) {
        const idx = versions.value.indexOf(v)
        if (idx >= 0) versions.value.splice(idx, 1)
      }

      if (changed) {
        saveToLocalStorageNow()
      }
    } catch (error) {
      console.error('[Versions] 扫描已安装版本失败:', error)
    } finally {
      isScanning = false
      console.log(`[Versions] ====== 扫描完成，已安装版本数: ${installedCount.value} ======`)
    }
  }

  const initVersions = async () => {
    loadFromLocalStorage()

    const hasDownloading = versions.value.some(v => v.downloading)

    const shouldSync = !lastSyncTime.value ||
      (new Date().getTime() - lastSyncTime.value.getTime()) > 3600000

    if (!hasDownloading && (shouldSync || versions.value.length === 0)) {
      await fetchVersionsFromOfficial()
    }

    // 无论官网同步是否成功，都必须扫描磁盘来确认实际安装状态
    await scanInstalledVersions(true)
  }

  const lazyInitVersions = () => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => {
        initVersions()
      }, { timeout: 2000 })
    } else {
      setTimeout(() => {
        initVersions()
      }, 500)
    }
  }

  // 手动同步
  const syncVersions = async () => {
    return await fetchVersionsFromOfficial()
  }
  
  // 安装版本（支持自定义实例名称和加载器）
  const installVersion = async (params: {
    versionId: string
    directoryName: string
    displayName?: string
    loader?: string
  }): Promise<boolean> => {
    const telemetryStore = useTelemetryStore()
    const downloadsStore = useDownloadsStore()
    const { versionId, directoryName, displayName, loader } = params

    // 检查目录名是否已存在
    const existingVersion = versions.value.find(v => getVersionKey(v) === directoryName)
    
    // 如果已存在且正在下载，不允许重复下载
    if (existingVersion && existingVersion.downloading) {
      console.warn(`[Versions] 版本 "${directoryName}" 正在下载中，跳过安装`)
      return false
    }

    // 如果已存在且已安装（文件存在），不允许重复下载
    if (existingVersion && existingVersion.installed) {
      console.warn(`[Versions] 版本 "${directoryName}" 已安装，跳过安装`)
      return false
    }

    // 查找基础版本
    let baseVersion = versions.value.find(v => v.id === versionId)

    if (!baseVersion) return false

    let version = existingVersion

    // 如果版本记录存在但文件已删除，重置状态
    if (version) {
      version.installed = false
      version.downloading = false
      version.downloadProgress = 0
      version.displayName = displayName || version.displayName || directoryName
      version.loader = loader || version.loader
    } else {
      // 创建新实例
      version = {
        ...baseVersion,
        directoryName,
        displayName: displayName || directoryName,
        loader,
        installed: false,
        downloading: false,
        downloadProgress: 0
      }
      // 在原版本后面插入新实例，这样新实例会出现在原版本旁边
      const baseIndex = versions.value.findIndex(v => v.id === versionId && (!v.directoryName || v.directoryName === versionId))
      if (baseIndex >= 0) {
        versions.value.splice(baseIndex + 1, 0, version)
      } else {
        versions.value.push(version)
      }
    }

    if (version.installed || version.downloading) return false

    // 设置下载状态（这会触发UI更新显示下载进度条）
    version.downloading = true
    version.downloadProgress = 0
    version.displayName = displayName || version.displayName || directoryName
    version.loader = loader || version.loader
    isDownloading.value = true

    const versionDisplayName = version.displayName || directoryName

    // 重新发起下载时恢复该版本的通知
    dismissedNotifications.delete(directoryName)

    // 添加到统一的下载任务
    downloadsStore.addTask({
      id: `version-${directoryName}`,
      name: versionDisplayName,
      category: 'version',
      status: 'downloading',
      subType: versionId
    })

    addNotification(directoryName, versionDisplayName, 'downloading', 0, i18n.global.t('rt.stVersions.downloadPreparing'))

    // 立即保存状态，确保刷新前 downloading:true 已写入 localStorage
    saveToLocalStorageNow()

    // 触发跳转到主页事件（必须在设置状态之后）
    window.dispatchEvent(new CustomEvent('version-download-started', { detail: { versionId, directoryName } }))

    try {
      // 使用 IPC 调用主进程下载
      if (baseVersion?.url && window.electronAPI?.downloadVersion) {
        // 设置下载进度监听
        const removeListener = window.electronAPI.onDownloadProgress((event, data) => {
          if (data.versionId === directoryName) {
            const cur = versions.value.find(v => getVersionKey(v) === directoryName)
            if (!cur) return
            // 根据下载类型调整进度权重
            let weightedProgress = 0
            if (data.type === 'json') {
              weightedProgress = data.progress * 0.02
            } else if (data.type === 'jar') {
              weightedProgress = 2 + data.progress * 0.08
            } else if (data.type === 'libraries') {
              weightedProgress = 10 + data.progress * 0.40
            } else if (data.type === 'assets') {
              weightedProgress = 50 + data.progress * 0.50
            }
            const finalProgress = Math.round(weightedProgress)
            cur.downloadProgress = finalProgress

            // 更新统一的下载任务进度
            const speed = data.speed || 0
            const downloadedBytes = data.downloadedBytes || Math.round((finalProgress / 100) * (data.totalBytes || 0))
            const totalBytes = data.totalBytes || 0
            downloadsStore.updateProgress(
              `version-${directoryName}`,
              finalProgress,
              speed,
              downloadedBytes,
              totalBytes
            )

            addNotification(directoryName, versionDisplayName, 'downloading', finalProgress, i18n.global.t('rt.stVersions.downloading'))
          }
        })

        const result = await window.electronAPI.downloadVersion(versionId, baseVersion.url, directoryName)

        // 移除监听器
        removeListener()

        const cur = versions.value.find(v => getVersionKey(v) === directoryName)
        if (result.success) {
          // 下载完成后验证文件是否真的存在
          let fileExists = true
          if (window.electronAPI?.checkVersionInstalled) {
            const verifyResult = await window.electronAPI.checkVersionInstalled(versionId, directoryName)
            fileExists = verifyResult.success && verifyResult.installed
            if (!fileExists) {
              console.warn(`[Versions] 下载完成但文件验证失败: ${directoryName}`)
            }
          }

          if (cur && fileExists) {
            cur.installed = true
            cur.downloading = false
            cur.downloadProgress = 100
            downloadsStore.setStatus(`version-${directoryName}`, 'completed')
            addNotification(directoryName, versionDisplayName, 'completed', 100, i18n.global.t('rt.stVersions.downloadComplete'))
          } else if (cur) {
            cur.downloading = false
            cur.downloadProgress = 0
            downloadsStore.setStatus(`version-${directoryName}`, 'failed', i18n.global.t('rt.stVersions.fileVerifyFailed'))
          }

          // 保存状态到本地存储
          saveToLocalStorage()
        } else {
          throw new Error(result.error || i18n.global.t('rt.stVersions.downloadFailed'))
        }
      } else {
        // 如果没有 URL 或 API，使用模拟下载
        for (let i = 0; i <= 100; i += 5) {
          await new Promise(resolve => setTimeout(resolve, 100))
          const cur = versions.value.find(v => getVersionKey(v) === directoryName)
          if (cur) cur.downloadProgress = i
        }
        const cur = versions.value.find(v => getVersionKey(v) === directoryName)
        if (cur) {
          cur.installed = true
          cur.downloading = false
          cur.downloadProgress = 100
        }
      }

      saveToLocalStorage()

      return true
    } catch (error: any) {
      console.error('安装版本失败:', error)
      const cur = versions.value.find(v => getVersionKey(v) === directoryName)
      if (cur) cur.downloading = false
      downloadsStore.setStatus(`version-${directoryName}`, 'failed', error?.message || i18n.global.t('rt.stVersions.downloadFailed'))
      addNotification(directoryName, versionDisplayName, 'failed', 0, error?.message || i18n.global.t('rt.stVersions.downloadFailedNetwork'))
      telemetryStore.trackDownloadFailed(versionId, (error as any)?.message || '下载失败')
      return false
    } finally {
      const stillDownloading = versions.value.some(v => v.downloading)
      isDownloading.value = stillDownloading
    }
  }

  // 暂停下载（使用 directoryName 作为唯一键）
  const pauseDownload = async (directoryName: string): Promise<boolean> => {
    const version = versions.value.find(v => getVersionKey(v) === directoryName)
    if (!version || !version.downloading || version.downloadPaused) return false

    try {
      if (window.electronAPI?.pauseDownload) {
        const result = await window.electronAPI.pauseDownload(directoryName)
        if (result.success) {
          version.downloadPaused = true
          saveToLocalStorageNow()
          return true
        }
        return false
      }
      return false
    } catch (error) {
      console.error('暂停下载失败:', error)
      return false
    }
  }

  // 继续下载（使用 directoryName 作为唯一键）
  const resumeDownload = async (directoryName: string): Promise<boolean> => {
    const version = versions.value.find(v => getVersionKey(v) === directoryName)
    if (!version || !version.downloading || !version.downloadPaused) return false

    try {
      if (window.electronAPI?.resumeDownload) {
        const result = await window.electronAPI.resumeDownload(directoryName)
        if (result.success) {
          version.downloadPaused = false
          saveToLocalStorageNow()
          return true
        }
        return false
      }
      return false
    } catch (error) {
      console.error('继续下载失败:', error)
      return false
    }
  }

  // 取消下载（使用 directoryName 作为唯一键）
  const cancelDownload = async (directoryName: string): Promise<boolean> => {
    const version = versions.value.find(v => getVersionKey(v) === directoryName)
    if (!version || !version.downloading) return false

    try {
      if (window.electronAPI?.cancelDownload) {
        const result = await window.electronAPI.cancelDownload(directoryName)
        if (result.success) {
          version.downloading = false
          version.downloadPaused = false
          version.downloadProgress = 0

          const stillDownloading = versions.value.some(v => v.downloading)
          if (!stillDownloading) {
            isDownloading.value = false
          }

          saveToLocalStorageNow()
          return true
        }
        return false
      }
      return false
    } catch (error) {
      console.error('取消下载失败:', error)
      return false
    }
  }

  // 卸载版本（使用 directoryName 作为唯一键）
  const uninstallVersion = async (directoryName: string): Promise<boolean> => {
    const version = versions.value.find(v => getVersionKey(v) === directoryName)
    if (!version || !version.installed) return false

    try {
      // 调用主进程删除实际文件
      if (window.electronAPI?.deleteVersion) {
        const result = await window.electronAPI.deleteVersion(directoryName)
        if (!result.success) {
          console.error('删除版本文件失败:', result.error)
          return false
        }
      }

      version.installed = false
      version.downloadProgress = 0

      saveToLocalStorage()

      return true
    } catch (error) {
      console.error('卸载版本失败:', error)
      return false
    }
  }

  // 强制清除所有下载状态（应急功能）
  const forceClearAllDownloadStates = () => {
    versions.value.forEach(v => {
      if (v.downloading) {
        v.downloading = false
        v.downloadPaused = false
        v.downloadProgress = 0
      }
    })
    isDownloading.value = false
    saveToLocalStorageNow()
    console.log('[Versions Store] 所有下载状态已强制清除')
  }

  // 启动游戏（使用 directoryName 作为唯一键）
  const launchGame = async (directoryName: string, username?: string): Promise<{ success: boolean; error?: string }> => {
    const telemetryStore = useTelemetryStore()
    const settingsStore = useSettingsStore()
    try {
      const version = versions.value.find(v => getVersionKey(v) === directoryName)
      const versionId = version?.id || directoryName
      // 传递 Java 设置：用户配置的 Java 路径、自定义 JVM 参数、
      // 是否允许不推荐的 Java 版本（23/24/25）、是否自动下载缺失的 Java
      const result = await window.electronAPI?.launchGame(versionId, username, directoryName, {
        javaPath: settingsStore.settings.javaPath || undefined,
        customJavaArgs: settingsStore.settings.customJavaArgs || undefined,
        skipJavaCheck: settingsStore.settings.skipJavaCheck || undefined,
        autoDownloadJava: settingsStore.settings.autoDownloadJava
      })
      const finalResult = result || { success: false, error: i18n.global.t('rt.stVersions.cannotConnectLauncher') }
      
      if (finalResult.success) {
        telemetryStore.trackGameLaunchSuccess(versionId)
      } else {
        telemetryStore.trackGameLaunchFailed(versionId, finalResult.error || '未知错误')
      }
      
      return finalResult
    } catch (error: any) {
      const version = versions.value.find(v => getVersionKey(v) === directoryName)
      telemetryStore.trackGameLaunchFailed(version?.id || directoryName, error.message || '启动游戏失败')
      console.error('启动游戏失败:', error)
      return { success: false, error: error.message || i18n.global.t('rt.stVersions.launchGameFailed') }
    }
  }

  // 检查 Java
  const checkJava = async (): Promise<{ installed: boolean; path?: string | null }> => {
    try {
      const settingsStore = useSettingsStore()
      // 同样传 skipJavaCheck：只装了 Java 25 且用户允许新版本时，
      // 不应该在这里报「未找到 Java 21」
      const result = await window.electronAPI?.checkJava(settingsStore.settings.skipJavaCheck)
      return result || { installed: false }
    } catch (error) {
      console.error('检查 Java 失败:', error)
      return { installed: false }
    }
  }

  // 计算属性
  const releaseVersions = computed(() => 
    versions.value.filter(v => v.type === 'release')
  )
  
  const snapshotVersions = computed(() => 
    versions.value.filter(v => v.type === 'snapshot')
  )
  
  const oldVersions = computed(() => 
    versions.value.filter(v => v.type === 'old_alpha' || v.type === 'old_beta')
  )
  
  const aprilFoolsVersions = computed(() => 
    versions.value.filter(v => v.type === 'april_fools')
  )
  
  const installedVersions = computed(() => 
    versions.value.filter(v => v.installed)
  )

  // 获取已安装版本数量
  const getInstalledCount = () => installedCount.value

  // 删除版本（别名，与组件中的方法名保持一致）
  const deleteVersion = uninstallVersion

  return {
    versions,
    isLoading,
    isDownloading,
    lastSyncTime,
    notifications,
    assetCheckActive,
    assetCheckProgress,
    assetCheckTotal,
    assetCheckDone,
    assetCheckMessage,
    assetCheckVersionId,
    runAssetCheck,
    releaseVersions,
    snapshotVersions,
    oldVersions,
    aprilFoolsVersions,
    installedVersions,
    initVersions,
    lazyInitVersions,
    syncVersions,
    installVersion,
    uninstallVersion,
    deleteVersion,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    launchGame,
    checkJava,
    getInstalledCount,
    addNotification,
    removeNotification,
    saveToLocalStorageNow,
    forceClearAllDownloadStates,
    verifyInstalledVersions,
    resetInstalledStatus,
    scanInstalledVersions
  }
})
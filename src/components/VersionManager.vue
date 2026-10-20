<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { useVersionsStore } from '../stores/versions'
import { useSettingsStore } from '../stores/settings'
import { useAccountsStore } from '../stores/accounts'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { locale } = useI18n()
const versionsStore = useVersionsStore()
const settingsStore = useSettingsStore()
const accountsStore = useAccountsStore()
const selectedVersion = ref<string | null>(null)
const searchQuery = ref('')
const debouncedSearch = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedSearch.value = val
  }, 200)
})

const filterType = ref<'all' | 'release' | 'snapshot' | 'april_fools' | 'old'>('all')
const launching = ref(false)
const launchMessage = ref('')
const launchSuccess = ref(false)

// 游戏日志 - 使用 shallowRef 减少响应式开销
const gameLogs = shallowRef<{ level: string; message: string; timestamp: string }[]>([])
const showGameLog = ref(false)
const gameLogPanelHeight = ref(200)
let removeGameLogListener: (() => void) | null = null
// 日志节流
let logBuffer: { level: string; message: string; timestamp: string }[] = []
let logFlushTimer: ReturnType<typeof setTimeout> | null = null
// 启动状态监听
let removeLaunchStatusListener: (() => void) | null = null
// 崩溃监听
let removeCrashListener: (() => void) | null = null

onUnmounted(() => {
  if (removeGameLogListener) {
    removeGameLogListener()
  }
  if (removeLaunchStatusListener) {
    removeLaunchStatusListener()
  }
  if (removeCrashListener) {
    removeCrashListener()
  }
  if (logFlushTimer) {
    clearTimeout(logFlushTimer)
  }
})

// 下载配置弹窗（名称 + 加载器）
const showLoaderModal = ref(false)
const pendingBaseVersionId = ref('')
const pendingDirectoryName = ref('')
const customDisplayName = ref('')
const selectedLoaders = ref<string[]>([])
const showVersionSettingsModal = ref(false)
const selectedVersionForSettings = ref<Version | null>(null)

const modLoaderOptions = [
  { id: 'forge', name: 'Forge', desc: 'versionsUi.loader.forgeDesc', conflicts: ['fabric', 'quilt'] },
  { id: 'neoforge', name: 'NeoForge', desc: 'versionsUi.loader.neoforgeDesc', conflicts: ['fabric', 'quilt'] },
  { id: 'fabric', name: 'Fabric', desc: 'versionsUi.loader.fabricDesc', conflicts: ['forge', 'neoforge', 'quilt'], requires: ['fabric_api'] },
  { id: 'fabric_api', name: 'Fabric API', desc: 'versionsUi.loader.fabricApiDesc', conflicts: ['qsl', 'qfapi'], requiredBy: ['fabric'] },
  { id: 'quilt', name: 'Quilt', desc: 'versionsUi.loader.quiltDesc', conflicts: ['forge', 'neoforge', 'fabric'], requires: ['qsl', 'qfapi'] },
  { id: 'qsl', name: 'QSL', desc: 'versionsUi.loader.qslDesc', conflicts: ['fabric_api'], requiredBy: ['quilt'] },
  { id: 'qfapi', name: 'QFAPI', desc: 'versionsUi.loader.qfapiDesc', conflicts: ['fabric_api'], requiredBy: ['quilt'] }
]

const getConflicts = (loaderId: string): string[] => {
  const loader = modLoaderOptions.find(l => l.id === loaderId)
  return loader?.conflicts || []
}

const getRequired = (loaderId: string): string[] => {
  const loader = modLoaderOptions.find(l => l.id === loaderId)
  return loader?.requires || []
}

const isConflicting = (loaderId: string): boolean => {
  return selectedLoaders.value.some(selected => {
    const selectedLoader = modLoaderOptions.find(l => l.id === selected)
    return selectedLoader?.conflicts.includes(loaderId)
  })
}

const getConflictingItems = (loaderId: string): string[] => {
  return selectedLoaders.value.filter(selected => {
    const selectedLoader = modLoaderOptions.find(l => l.id === selected)
    return selectedLoader?.conflicts.includes(loaderId)
  })
}

const toggleLoader = (loaderId: string) => {
  const index = selectedLoaders.value.indexOf(loaderId)
  if (index === -1) {
    // 检查是否有冲突
    if (isConflicting(loaderId)) {
      const conflicting = getConflictingItems(loaderId).map(id => {
        const loader = modLoaderOptions.find(l => l.id === id)
        return loader?.name
      }).join(', ')
      alert(t('versionsUi.loaderConflict', { loader: modLoaderOptions.find(l => l.id === loaderId)?.name, conflicting }))
      return
    }
    selectedLoaders.value.push(loaderId)
    // 如果选择了需要依赖的加载器，自动添加依赖
    const required = getRequired(loaderId)
    required.forEach(req => {
      if (!selectedLoaders.value.includes(req)) {
        selectedLoaders.value.push(req)
      }
    })
  } else {
    selectedLoaders.value.splice(index, 1)
    // 如果取消了加载器，取消其依赖项（如果没有其他加载器需要）
    const required = getRequired(loaderId)
    required.forEach(req => {
      // 检查是否还有其他已选项需要这个依赖
      const stillNeeded = selectedLoaders.value.some(selected => {
        const selectedLoader = modLoaderOptions.find(l => l.id === selected)
        return selectedLoader?.requires?.includes(req)
      })
      if (!stillNeeded) {
        const reqIndex = selectedLoaders.value.indexOf(req)
        if (reqIndex !== -1) {
          selectedLoaders.value.splice(reqIndex, 1)
        }
      }
    })
  }
}

const openLoaderModal = (versionId: string, existingDirectoryName?: string) => {
  pendingBaseVersionId.value = versionId
  // 如果已有目录名（重新下载的情况），使用它；否则生成一个唯一的默认目录名
  if (existingDirectoryName && existingDirectoryName !== versionId) {
    pendingDirectoryName.value = existingDirectoryName
    const existingVersion = versionsStore.versions.find(v => (v.directoryName || v.id) === existingDirectoryName)
    customDisplayName.value = existingVersion?.displayName || existingDirectoryName
  } else {
    // 检查是否已有同名基础版本
    const hasBase = versionsStore.versions.some(v => v.id === versionId && (!v.directoryName || v.directoryName === versionId))
    let baseName = hasBase ? `${versionId}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}` : versionId
    
    // 确保目录名唯一（防重名）
    let uniqueName = baseName
    let counter = 1
    while (versionsStore.versions.some(v => (v.directoryName || v.id) === uniqueName)) {
      uniqueName = `${baseName}-${counter}`
      counter++
    }
    
    pendingDirectoryName.value = uniqueName
    // 默认显示名称为版本号，用户可以修改
    customDisplayName.value = versionId
  }
  selectedLoaders.value = []
  showLoaderModal.value = true
}

const confirmInstall = async () => {
  if (!pendingBaseVersionId.value || !pendingDirectoryName.value) {
    showLoaderModal.value = false
    return
  }

  // 检查目录名是否已存在（防重名）
  const existingVersion = versionsStore.versions.find(v => (v.directoryName || v.id) === pendingDirectoryName.value)
  if (existingVersion) {
    launchMessage.value = t('versionsUi.errorDirExists', { name: pendingDirectoryName.value })
    launchSuccess.value = false
    return
  }

  showLoaderModal.value = false
  // 确定主要加载器（取第一个非依赖项）
  const mainLoader = selectedLoaders.value.find(id => !['fabric_api', 'qsl', 'qfapi'].includes(id))
  await versionsStore.installVersion({
    versionId: pendingBaseVersionId.value,
    directoryName: pendingDirectoryName.value,
    displayName: customDisplayName.value || pendingDirectoryName.value,
    loader: mainLoader
  })
  launchMessage.value = t('versionsUi.versionDownloadStarted', { name: customDisplayName.value || pendingDirectoryName.value })
  launchSuccess.value = true
  setTimeout(() => {
    launchMessage.value = ''
  }, 3000)
}

const cancelInstall = () => {
  showLoaderModal.value = false
  pendingBaseVersionId.value = ''
  pendingDirectoryName.value = ''
  customDisplayName.value = ''
  selectedLoaders.value = []
}

const filteredVersions = computed(() => {
  const query = debouncedSearch.value.toLowerCase()
  const allVersions = versionsStore.versions.filter(v => {
    const matchesSearch = query === '' || v.id.toLowerCase().includes(query) || 
                         (v.displayName && v.displayName.toLowerCase().includes(query))
    const matchesFilter = filterType.value === 'all' ||
      (filterType.value === 'release' && v.type === 'release') ||
      (filterType.value === 'snapshot' && v.type === 'snapshot') ||
      (filterType.value === 'april_fools' && v.type === 'april_fools') ||
      (filterType.value === 'old' && (v.type === 'old_alpha' || v.type === 'old_beta'))
    return matchesSearch && matchesFilter
  })

  const customVersions = allVersions.filter(v => 
    v.directoryName && v.directoryName !== v.id
  )
  const baseVersions = allVersions.filter(v => 
    !v.directoryName || v.directoryName === v.id
  )

  return [...customVersions, ...baseVersions]
})

// 虚拟滚动：只渲染可见部分的版本，避免 500+ DOM 元素同时存在
const visibleCount = ref(50)
const visibleVersions = computed(() => filteredVersions.value.slice(0, visibleCount.value))

// 滚动加载更多
const versionsContainerRef = ref<HTMLElement | null>(null)
const onVersionsScroll = () => {
  const el = versionsContainerRef.value
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
    if (visibleCount.value < filteredVersions.value.length) {
      visibleCount.value = Math.min(visibleCount.value + 50, filteredVersions.value.length)
    }
  }
}

// 筛选/搜索变化时重置可见数量
watch([debouncedSearch, filterType], () => {
  visibleCount.value = 50
  if (versionsContainerRef.value) versionsContainerRef.value.scrollTop = 0
})

// 辅助函数：获取版本的唯一键
const getVersionKey = (v: any) => v.directoryName || v.id

const selectVersion = (directoryName: string) => {
  selectedVersion.value = directoryName
}

const downloadVersion = async (versionId: string, existingDirectoryName?: string) => {
  if (typeof __ENABLE_MC_DOWNLOAD__ !== 'undefined' && !__ENABLE_MC_DOWNLOAD__) {
    const url = locale.value === 'zh' ? 'https://www.minecraft.net/zh-hans/download' : 'https://www.minecraft.net/en-us/download'
    if ((window as any).electronAPI?.openBrowser) {
      ;(window as any).electronAPI.openBrowser(url)
      return
    }
    window.open(url, '_blank')
    return
  }
  openLoaderModal(versionId, existingDirectoryName)
}

const togglePauseDownload = async (directoryName: string) => {
  const version = versionsStore.versions.find(v => getVersionKey(v) === directoryName)
  if (!version || !version.downloading) return

  if (version.downloadPaused) {
    await versionsStore.resumeDownload(directoryName)
  } else {
    await versionsStore.pauseDownload(directoryName)
  }
}

const handleCancelDownload = async (directoryName: string) => {
  const confirmed = confirm(t('versionsUi.confirmCancelDownload'))
  if (!confirmed) return
  await versionsStore.cancelDownload(directoryName)
}

const deleteVersion = async (directoryName: string) => {
  const version = versionsStore.versions.find(v => getVersionKey(v) === directoryName)
  const displayName = version?.displayName || directoryName
  // 确认删除
  const confirmed = confirm(t('versionsUi.confirmDeleteVersion', { name: displayName }))
  if (!confirmed) return

  const success = await versionsStore.deleteVersion(directoryName)
  if (success) {
    launchMessage.value = t('versionsUi.versionDeleted', { name: displayName })
    launchSuccess.value = true
    setTimeout(() => {
      launchMessage.value = ''
    }, 5000)
  } else {
    launchMessage.value = t('versionsUi.deleteFailedManual')
    launchSuccess.value = false
    setTimeout(() => {
      launchMessage.value = ''
    }, 5000)
  }
}

const launchGame = async () => {
  if (!selectedVersion.value) {
    launchMessage.value = t('versionsUi.selectVersionFirst')
    launchSuccess.value = false
    return
  }

  const directoryName = selectedVersion.value
  const version = versionsStore.versions.find(v => getVersionKey(v) === directoryName)
  if (!version) {
    launchMessage.value = t('versionsUi.errorVersionNotFound')
    launchSuccess.value = false
    return
  }

  if (!version.installed) {
    const displayName = version.displayName || version.id
    launchMessage.value = t('versionsUi.errorVersionNotInstalled', { name: displayName })
    launchSuccess.value = false
    return
  }

  // 检查 Java
  const javaCheck = await versionsStore.checkJava()
  if (!javaCheck.installed) {
    launchMessage.value = t('versionsUi.errorJavaNotFound')
    launchSuccess.value = false
    return
  }

  launching.value = true
  launchMessage.value = t('versionsUi.launchingGame')

  // 获取离线账号的用户名
  const offlineUsername = accountsStore.currentAccount?.username

  try {
    const result = await versionsStore.launchGame(directoryName, offlineUsername)
    if (result.success) {
      const displayName = version.displayName || version.id
      launchMessage.value = offlineUsername
        ? t('versionsUi.launchSuccessPlayer', { name: displayName, player: offlineUsername })
        : t('versionsUi.launchSuccess', { name: displayName })
      launchSuccess.value = true

      const shouldShowSponsor = settingsStore.incrementLaunchCount()
      if (shouldShowSponsor) {
        window.dispatchEvent(new CustomEvent('show-sponsor-dialog'))
      }
    } else {
      launchMessage.value = t('versionsUi.launchFailed', { error: result.error || t('versionsUi.unknownError') })
      launchSuccess.value = false
    }
    setTimeout(() => {
      launchMessage.value = ''
    }, 3000)
  } catch (error: any) {
    launchMessage.value = t('versionsUi.launchFailed', { error: error.message || t('versionsUi.unknownError') })
    launchSuccess.value = false
  } finally {
    launching.value = false
  }
}

const getVersionTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    'release': t('versionsUi.typeRelease'),
    'snapshot': t('versionsUi.typeSnapshot'),
    'april_fools': t('versionsUi.typeAprilFools'),
    'old_alpha': t('versionsUi.typeOld'),
    'old_beta': t('versionsUi.typeOld')
  }
  return labels[type] || type
}

const getVersionBadgeClass = (type: string) => {
  const classes: Record<string, string> = {
    'release': 'release',
    'snapshot': 'snapshot',
    'april_fools': 'april-fools',
    'old_alpha': 'old',
    'old_beta': 'old'
  }
  return classes[type] || 'release'
}

const showVersionSettings = (version: Version) => {
  selectedVersionForSettings.value = version
  showVersionSettingsModal.value = true
}

const closeVersionSettings = () => {
  showVersionSettingsModal.value = false
  selectedVersionForSettings.value = null
}

const isCheckingAssets = computed(() => versionsStore.assetCheckActive)

const checkAndFixAssets = async () => {
  const version = selectedVersionForSettings.value
  if (!version) return

  if (versionsStore.assetCheckActive) return

  const dirName = version.directoryName || version.id
  const result = await versionsStore.runAssetCheck(version.id, dirName)

  if (result && result.success) {
    launchMessage.value = versionsStore.assetCheckMessage || t('versionsUi.assetCheckDone')
    launchSuccess.value = true
  } else {
    launchMessage.value = t('versionsUi.assetCheckFailed', { error: result?.error || t('versionsUi.unknownError') })
    launchSuccess.value = false
  }

  setTimeout(() => {
    launchMessage.value = ''
  }, 5000)
}

const openVersionFolder = async (version: Version) => {
  const dirName = version.directoryName || version.id
  await window.electronAPI?.openVersionDir(version.id, dirName)
  closeVersionSettings()
}

const openSavesFolder = async () => {
  // 版本隔离：打开当前版本的存档目录
  const dirName = selectedVersionForSettings.value
    ? (selectedVersionForSettings.value.directoryName || selectedVersionForSettings.value.id)
    : undefined
  await window.electronAPI?.openSavesDir(dirName)
  closeVersionSettings()
}

const openMinecraftFolder = async () => {
  await window.electronAPI?.openMinecraftDir()
  closeVersionSettings()
}

onMounted(async () => {
  // 仅在版本列表为空或未在下载时初始化，避免重置下载状态
  if (versionsStore.versions.length === 0 || !versionsStore.isDownloading) {
    await versionsStore.initVersions()
  } else {
    // 即使不初始化，也验证已安装版本的文件是否存在
    await versionsStore.verifyInstalledVersions()
  }

  // 如果启用了游戏日志，设置监听器
  if (settingsStore.settings.enableGameLog && window.electronAPI?.onGameLog) {
    removeGameLogListener = window.electronAPI.onGameLog((event, data) => {
      addGameLog(data.level, data.message, data.timestamp)
    })
  }

  // 监听启动状态（自动补齐文件时的进度提示），实时更新启动按钮下方文案
  if (window.electronAPI?.onGameLaunchStatus) {
    removeLaunchStatusListener = window.electronAPI.onGameLaunchStatus((event, data) => {
      if (launching.value) {
        launchMessage.value = data.message || t('versionsUi.preparingGameFiles')
        launchSuccess.value = false
      }
    })
  }

  // 监听游戏崩溃/异常退出，给出可操作提示（原生崩溃码如 0xC0000005 没有 Java 堆栈）
  if (window.electronAPI?.onGameCrash) {
    removeCrashListener = window.electronAPI.onGameCrash((event, data) => {
      launching.value = false
      launchSuccess.value = false
      if (data?.nativeHint) {
        launchMessage.value = t('versionsUi.crashNative', { code: data.exitCode, hint: data.nativeHint })
      } else if (data?.exitCode) {
        launchMessage.value = t('versionsUi.crashGeneric', { code: data.exitCode })
      }
    })
  }
})

const syncVersions = async () => {
  const success = await versionsStore.syncVersions()
  if (success) {
    launchMessage.value = t('versionsUi.syncSuccess')
    launchSuccess.value = true
  } else {
    launchMessage.value = t('versionsUi.syncFailed')
    launchSuccess.value = false
  }
  setTimeout(() => {
    launchMessage.value = ''
  }, 3000)
}

// 添加游戏日志 - 使用节流减少更新频率
const addGameLog = (level: string, message: string, timestamp: string) => {
  if (!settingsStore.settings.enableGameLog) return

  // 根据日志级别过滤
  const logLevel = settingsStore.settings.logLevel
  if (logLevel === 'error' && level !== 'error') return
  if (logLevel === 'warning' && level === 'info') return

  logBuffer.push({ level, message, timestamp })

  // 节流：每50ms批量更新
  if (!logFlushTimer) {
    logFlushTimer = setTimeout(() => {
      if (logBuffer.length === 0) return

      gameLogs.value = [...gameLogs.value, ...logBuffer].slice(-500)
      logBuffer = []
      logFlushTimer = null
    }, 50)
  }
}

// 清除游戏日志
const clearGameLogs = () => {
  gameLogs.value = []
}

// 切换游戏日志面板
const toggleGameLog = () => {
  showGameLog.value = !showGameLog.value
  if (showGameLog.value && window.electronAPI?.onGameLog) {
    removeGameLogListener = window.electronAPI.onGameLog((event, data) => {
      addGameLog(data.level, data.message, data.timestamp)
    })
  }
}
</script>

<template>
  <div class="version-manager">
    <div class="manager-header">
      <div class="header-title">
        <h2>{{ t('versions.title') }}</h2>
        <p>{{ t('versions.installed') }} {{ versionsStore.versions.length }} {{ t('common.all') }} · {{ versionsStore.getInstalledCount() }} {{ t('versions.install') }}</p>
      </div>
      <div class="header-actions">
        <button 
          v-if="settingsStore.settings.enableGameLog"
          class="log-btn"
          :class="{ active: showGameLog }"
          @click="toggleGameLog"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          {{ t('versionsUi.log') }}
          <span v-if="gameLogs.length > 0" class="log-count">{{ gameLogs.length }}</span>
        </button>
        <button
          class="sync-btn"
          :class="{ loading: versionsStore.isLoading }"
          @click="syncVersions"
          :disabled="versionsStore.isLoading"
        >
          <svg v-if="!versionsStore.isLoading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
          </svg>
          <span v-else class="spinner"></span>
          {{ versionsStore.isLoading ? t('common.loading') : t('versions.sync') }}
        </button>
        <button
          class="sync-btn"
          @click="versionsStore.verifyInstalledVersions()"
          :title="t('versionsUi.refreshInstalledTitle')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
          </svg>
          {{ t('versionsUi.refreshStatus') }}
        </button>
        <button
          class="launch-btn"
          :class="{ launching: launching, disabled: !selectedVersion }"
          @click="launchGame"
          :disabled="!selectedVersion || launching"
        >
          <svg v-if="!launching" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span v-else class="spinner"></span>
          {{ launching ? t('versions.launching') : t('versions.launchGame') }}
        </button>
      </div>
    </div>

    <div v-if="launchMessage" class="launch-message" :class="{ success: launchSuccess, error: !launchSuccess }">
      {{ launchMessage }}
    </div>
    
    <div class="toolbar">
      <div class="search-input-wrapper">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input 
          v-model="searchQuery"
          type="text" 
          :placeholder="t('versions.searchVersion')" 
          class="search-input"
        />
      </div>
      
      <div class="filter-tabs">
        <button 
          v-for="filter in [
            { id: 'all', label: t('common.all') },
            { id: 'release', label: t('versions.filter.release') },
            { id: 'snapshot', label: t('versions.filter.snapshot') },
            { id: 'april_fools', label: t('versions.filter.aprilFools') },
            { id: 'old', label: t('versions.filter.old') }
          ]"
          :key="filter.id"
          class="filter-tab"
          :class="{ active: filterType === filter.id }"
          @click="filterType = filter.id as any"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>
    
    <div class="versions-container" ref="versionsContainerRef" @scroll.passive="onVersionsScroll">
      <div
        v-for="version in visibleVersions"
        :key="getVersionKey(version)"
        class="version-item"
        :class="{ 
          selected: selectedVersion === getVersionKey(version),
          custom: version.directoryName && version.directoryName !== version.id
        }"
        @click="selectVersion(getVersionKey(version))"
      >
        <div class="version-info">
          <div class="version-header">
            <span v-if="version.isModpack" class="modpack-badge">{{ t('versionsUi.modpack') }}</span>
            <span class="version-badge" :class="getVersionBadgeClass(version.type)">
              <template v-if="version.directoryName && version.directoryName !== version.id">
                <span v-if="version.displayName && version.displayName !== version.id" class="custom-badge">{{ t('versionsUi.customName') }}</span>
                <span v-else-if="version.loader" class="custom-badge">{{ version.loader }}</span>
              </template>
              {{ getVersionTypeLabel(version.type) }}
            </span>
            <span class="version-id">
              <template v-if="version.directoryName && version.directoryName !== version.id">
                <span>{{ version.displayName || version.directoryName }}</span>
              </template>
              <template v-else>
                {{ version.id }}
              </template>
            </span>
          </div>
          <div class="version-meta">
            <span v-if="version.isModpack && version.mcVersion" class="base-version">MC: {{ version.mcVersion }}</span>
            <span v-else-if="version.directoryName && version.directoryName !== version.id" class="base-version">{{ t('versionsUi.baseVersion', { id: version.id }) }}</span>
            <span>{{ t('versionsUi.releasedOn', { date: version.releaseDate }) }}</span>
            <span v-if="version.loader && (!version.directoryName || version.directoryName === version.id)" class="loader-badge">{{ version.loader }}</span>
            <span v-if="version.installed" class="installed-badge">{{ t('versions.installed') }}</span>
          </div>
          
          <!-- 下载进度条 -->
          <div v-if="version.downloading && version.downloadProgress !== undefined" class="download-progress">
            <div class="progress-bar">
              <div class="progress-fill" :class="{ paused: version.downloadPaused }" :style="{ width: version.downloadProgress + '%' }"></div>
            </div>
            <span class="progress-text">{{ version.downloadProgress }}%</span>
          </div>
        </div>
        
        <div class="version-actions">
          <button
            v-if="!version.installed && !version.downloading && (!version.directoryName || version.directoryName === version.id)"
            class="action-btn download-btn"
            @click.stop="downloadVersion(version.id, getVersionKey(version))"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            {{ (typeof __ENABLE_MC_DOWNLOAD__ !== 'undefined' && !__ENABLE_MC_DOWNLOAD__) ? t('versionsUi.downloadGame') : t('versionsUi.download') }}
          </button>
          <div v-else-if="version.downloading" class="download-actions">
            <button
              class="action-btn pause-btn"
              @click.stop="togglePauseDownload(getVersionKey(version))"
            >
              <svg v-if="!version.downloadPaused" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
              <span class="btn-text">{{ version.downloadPaused ? t('versionsUi.resume') : t('versionsUi.pause') }}</span>
            </button>
            <button
              class="action-btn cancel-btn"
              @click.stop="handleCancelDownload(getVersionKey(version))"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              <span class="btn-text">{{ t('versionsUi.cancel') }}</span>
            </button>
          </div>
          <div v-else class="installed-actions">
            <button
              class="action-btn folder-btn"
              :title="t('versions.openVersionFolder')"
              @click.stop="openVersionFolder(version)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button
              v-if="!version.isModpack && (!version.directoryName || version.directoryName === version.id)"
              class="action-btn new-instance-btn"
              @click.stop="downloadVersion(version.id)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              {{ t('versionsUi.newInstance') }}
            </button>
            <button
              class="action-btn settings-btn"
              @click.stop="showVersionSettings(version)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              {{ t('versionsUi.settings') }}
            </button>
          </div>
        </div>
      </div>
      
      <div v-if="filteredVersions.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.05 7a7.002 7.002 0 0 1 13.9 2m-13.9 2a7.002 7.002 0 0 0 13.9 2" />
        </svg>
        <p>{{ t('versions.noResults') }}</p>
      </div>
    </div>

    <!-- 下载配置弹窗（名称 + 加载器） -->
    <div v-if="showLoaderModal" class="modal-overlay" @click.self="cancelInstall">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ t('versionsUi.downloadConfig') }}</h3>
          <button class="close-btn" @click="cancelInstall">×</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc">{{ t('versionsUi.downloadConfigDesc', { version: pendingBaseVersionId, dir: pendingDirectoryName }) }}</p>
          <div class="name-input-group">
            <label>{{ t('versionsUi.displayName') }}</label>
            <input
              v-model="customDisplayName"
              type="text"
              :placeholder="t('versionsUi.displayNamePlaceholder')"
              class="name-input"
            />
          </div>
          <div class="loader-notice">
            <span class="notice-icon">⚠️</span>
            <span>{{ t('versions.mutuallyExclusiveHint') }}</span>
          </div>
          <div class="loader-options">
            <div
              v-for="loader in modLoaderOptions"
              :key="loader.id"
              class="loader-option"
              :class="{ 
                selected: selectedLoaders.includes(loader.id),
                conflicting: isConflicting(loader.id) && !selectedLoaders.includes(loader.id),
                autoadded: loader.requires?.some((r: string) => selectedLoaders.includes(r)) && !loader.requires?.includes(loader.id as any) && !selectedLoaders.includes(loader.id)
              }"
              @click="toggleLoader(loader.id)"
            >
              <div class="loader-checkbox">
                <span v-if="selectedLoaders.includes(loader.id)">✓</span>
              </div>
              <div class="loader-info">
                <span class="loader-name">{{ loader.name }}</span>
                <span class="loader-desc">{{ t(loader.desc) }}</span>
                <div class="loader-tags" v-if="loader.requires?.length || loader.conflicts?.length">
                  <span v-if="loader.requires?.length" class="tag tag-required">
                    {{ t('versionsUi.requires', { list: loader.requires.map((r: string) => modLoaderOptions.find(l => l.id === r)?.name).join(', ') }) }}
                  </span>
                  <span v-if="isConflicting(loader.id) && !selectedLoaders.includes(loader.id)" class="tag tag-conflict">
                    {{ t('versionsUi.conflictsWith', { list: getConflictingItems(loader.id).map(id => modLoaderOptions.find(l => l.id === id)?.name).join(', ') }) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="cancelInstall">{{ t('versionsUi.cancel') }}</button>
          <button class="btn btn-primary" @click="confirmInstall">
            {{ t('versionsUi.confirmInstall') }}{{ selectedLoaders.length > 0 ? t('versionsUi.confirmInstallCount', { n: selectedLoaders.length }) : '' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showVersionSettingsModal" class="modal-overlay" @click="closeVersionSettings">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ t('versions.versionSettings') }} - {{ selectedVersionForSettings?.displayName || selectedVersionForSettings?.id }}</h3>
          <button class="modal-close" @click="closeVersionSettings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="settings-list">
            <div class="settings-item">
              <button class="settings-action-btn" @click="openVersionFolder(selectedVersionForSettings!)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>{{ t('versionsUi.openVersionFolder') }}</span>
              </button>
            </div>
            <div class="settings-item">
              <button class="settings-action-btn" @click="openSavesFolder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2zM12 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                </svg>
                <span>{{ t('versionsUi.openSavesFolder') }}</span>
              </button>
            </div>
            <div class="settings-item">
              <button class="settings-action-btn" @click="openMinecraftFolder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span>{{ t('versionsUi.openGameDir') }}</span>
              </button>
            </div>
            <div class="settings-item">
              <button 
                class="settings-action-btn assets-btn" 
                @click="checkAndFixAssets"
                :disabled="isCheckingAssets"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>{{ isCheckingAssets ? t('versionsUi.checking') : t('versionsUi.checkAssets') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- {{ t('versions.gameLog') }} -->
    <div v-if="showGameLog" class="game-log-panel">
      <div class="log-header">
        <span class="log-title">{{ t('versions.gameLog') }}</span>
        <div class="log-actions">
          <button class="log-action-btn" @click="clearGameLogs" :title="t('versions.clearLog')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <button class="log-action-btn" @click="showGameLog = false" :title="t('versionsUi.close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <div class="log-content">
        <div 
          v-for="(log, index) in gameLogs" 
          :key="index"
          class="log-entry"
          :class="log.level"
        >
          <span class="log-time">{{ new Date(log.timestamp).toLocaleTimeString() }}</span>
          <span class="log-level">{{ log.level.toUpperCase() }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
        <div v-if="gameLogs.length === 0" class="log-empty">
          {{ t('versions.noLogs') }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.version-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.header-title h2 {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-title p {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.launch-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--success);
  border: none;
  border-radius: var(--border-radius);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.launch-btn:hover:not(:disabled) {
  background: #45a049;
}

.launch-btn:active:not(:disabled) {
  opacity: 0.85;
}

.launch-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sync-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.sync-btn:hover:not(:disabled) {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
}

.sync-btn:active:not(:disabled) {
  opacity: 0.85;
}

.sync-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.launch-btn svg {
  width: 16px;
  height: 16px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.launch-message {
  padding: 10px 16px;
  border-radius: var(--border-radius-sm);
  margin-bottom: 16px;
  font-size: 13px;
  flex-shrink: 0;
}

.launch-message.success {
  background: rgba(76, 175, 80, 0.2);
  color: var(--success);
  border: 1px solid var(--success);
}

.launch-message.error {
  background: rgba(244, 67, 54, 0.2);
  color: var(--error);
  border: 1px solid var(--error);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
  gap: 16px;
}

.search-input-wrapper {
  position: relative;
  flex: 1;
  max-width: 300px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 10px 12px 10px 38px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: all var(--transition-fast);
}

.search-input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.filter-tabs {
  display: flex;
  gap: 8px;
}

.filter-tab {
  padding: 8px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.filter-tab:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.filter-tab.active {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
}

.versions-container {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: var(--bg-card);
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  border: 2px solid transparent;
}

.version-item:hover {
  background: var(--bg-hover);
}

.version-item.selected {
  border-color: var(--accent-primary);
  background: var(--accent-glow);
}

.version-item.custom {
  border-left: 3px solid var(--accent-secondary);
}

.custom-label {
  color: var(--accent-secondary);
  font-weight: 600;
  margin-right: 4px;
}

.version-info {
  flex: 1;
  min-width: 0;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.version-badge {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
}

.custom-badge {
  background: #1b5e20;
  color: white;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  text-transform: none;
}

.modpack-badge {
  background: rgba(100, 181, 246, 0.18);
  color: #4fc3f7;
  border: 1px solid rgba(79, 195, 247, 0.45);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0.5px;
}

.version-badge.release {
  background: var(--success);
  color: white;
}

.version-badge.snapshot {
  background: #ff9800;
  color: white;
}

.version-badge.april-fools {
  background: #ff6b9d;
  color: white;
}

.version-badge.old {
  background: #9b59b6;
  color: white;
}

.version-id {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.version-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.installed-badge {
  padding: 2px 8px;
  background: var(--success);
  color: white;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.base-version {
  padding: 2px 8px;
  background: var(--bg-secondary);
  color: var(--text-muted);
  border-radius: 4px;
  font-size: 11px;
}

.loader-badge {
  padding: 2px 8px;
  background: #9b59b6;
  color: white;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.download-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-primary);
  transition: width 0.3s ease;
}

.progress-fill.paused {
  background: #ff9800;
}

.progress-text {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 35px;
}

.version-actions {
  flex-shrink: 0;
}

.download-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.action-btn {
  padding: 8px 16px;
  border: none;
  border-radius: var(--border-radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  min-width: 70px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.action-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.btn-text {
  white-space: nowrap;
}

.pause-btn, .cancel-btn {
  padding: 8px 14px;
  min-width: auto;
}

.pause-btn {
  background: var(--accent-primary);
  color: white;
  border: 1px solid var(--accent-primary);
}

.pause-btn:hover {
  background: var(--accent-secondary);
  border-color: var(--accent-secondary);
}

.cancel-btn {
  background: transparent;
  color: var(--error);
  border: 1px solid var(--error);
}

.cancel-btn:hover {
  background: var(--error);
  color: white;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.download-btn {
  background: var(--accent-primary);
  color: white;
}

.download-btn:hover:not(:disabled) {
  background: var(--accent-secondary);
}

.downloading-btn {
  background: var(--bg-secondary);
  color: var(--text-muted);
}

.delete-btn {
  background: transparent;
  color: var(--error);
  border: 1px solid var(--error);
}

.delete-btn:hover {
  background: var(--error);
  color: white;
}

.new-instance-btn {
  background: var(--accent-primary);
  color: white;
}

.new-instance-btn:hover {
  background: var(--accent-secondary);
}

.settings-btn {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.settings-btn:hover {
  background: var(--border-color);
}

.folder-btn {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.folder-btn:hover {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  padding: 60px 40px;
}

.empty-state svg {
  width: 64px;
  height: 64px;
  margin-bottom: 20px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 15px;
}

/* 模组加载器选择弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-card);
  border-radius: var(--border-radius);
  width: 480px;
  max-width: 90%;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-header .close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.modal-header .close-btn:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 20px;
  max-height: 400px;
  overflow-y: auto;
}

.name-input-group {
  margin-bottom: 16px;
}

.name-input-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.name-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color var(--transition-fast);
  box-sizing: border-box;
}

.name-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.modal-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.loader-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loader-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.loader-option:hover {
  border-color: var(--accent-primary);
}

.loader-option.selected {
  border-color: var(--accent-primary);
  background: var(--accent-glow);
}

.loader-option.conflicting {
  opacity: 0.5;
  border-color: var(--error);
}

.loader-option.conflicting:hover {
  border-color: var(--error);
  cursor: not-allowed;
}

.loader-option.autoadded {
  border-style: dashed;
  border-color: var(--accent-secondary);
}

.loader-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: var(--border-radius-sm);
  margin-bottom: 16px;
  font-size: 12px;
  color: #ffc107;
}

.notice-icon {
  font-size: 14px;
}

.loader-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
}

.tag-required {
  background: rgba(33, 150, 243, 0.2);
  color: #2196f3;
}

.tag-conflict {
  background: rgba(244, 67, 54, 0.2);
  color: #f44336;
}

.loader-checkbox {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--accent-primary);
  transition: all 0.2s ease;
}

.loader-option.selected .loader-checkbox {
  border-color: var(--accent-primary);
  background: var(--accent-primary);
  color: white;
}

.loader-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.loader-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.loader-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

.btn {
  padding: 8px 16px;
  border-radius: var(--border-radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--accent-primary);
  border: 1px solid var(--accent-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--accent-secondary);
}

/* 版本设置弹窗样式 */
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-item {
  display: flex;
}

.settings-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-action-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
}

.settings-action-btn svg {
  width: 18px;
  height: 18px;
  color: var(--accent-primary);
}

.modal-close {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-muted);
  transition: color 0.2s;
}

.modal-close:hover {
  color: var(--text-primary);
}

.modal-close svg {
  width: 20px;
  height: 20px;
}

/* 游戏日志面板样式 */
.game-log-panel {
  position: fixed;
  bottom: 0;
  left: 220px;
  right: 0;
  height: 200px;
  background: var(--bg-card);
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.log-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.log-actions {
  display: flex;
  gap: 8px;
}

.log-action-btn {
  width: 28px;
  height: 28px;
  padding: 4px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.log-action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.log-action-btn svg {
  width: 16px;
  height: 16px;
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
}

.log-entry {
  display: flex;
  gap: 12px;
  padding: 4px 8px;
  border-radius: 2px;
  margin-bottom: 2px;
}

.log-entry:hover {
  background: var(--bg-hover);
}

.log-entry.info {
  color: var(--text-primary);
}

.log-entry.warn {
  color: #ffc107;
  background: rgba(255, 193, 7, 0.1);
}

.log-entry.error {
  color: #f44336;
  background: rgba(244, 67, 54, 0.1);
}

.log-time {
  color: var(--text-muted);
  flex-shrink: 0;
}

.log-level {
  font-weight: 600;
  flex-shrink: 0;
  width: 50px;
}

.log-entry.info .log-level {
  color: #2196f3;
}

.log-entry.warn .log-level {
  color: #ffc107;
}

.log-entry.error .log-level {
  color: #f44336;
}

.log-message {
  flex: 1;
  word-break: break-all;
}

.log-empty {
  color: var(--text-muted);
  text-align: center;
  padding: 40px;
}

/* 日志按钮样式 */
.log-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.log-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.log-btn.active {
  background: var(--accent-glow);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.log-btn svg {
  width: 16px;
  height: 16px;
}

.log-count {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  background: var(--accent-primary);
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
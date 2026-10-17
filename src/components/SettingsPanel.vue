<script setup lang="ts">
// 版本号来自 package.json（由 vite define 注入）
const APP_LABEL = __APP_LABEL__
import { ref, onMounted, onUnmounted, onBeforeUnmount, computed, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useVersionsStore } from '../stores/versions'
import { useAIStore } from '../stores/ai'
import { useDownloadsStore } from '../stores/downloads'
import { localeList, setLocale, getLocale } from '../locales'
import { useI18n } from 'vue-i18n'
import AccountManager from './AccountManager.vue'
import LegalDialog from './LegalDialog.vue'

const { t } = useI18n()
const settingsStore = useSettingsStore()
const versionsStore = useVersionsStore()
const aiStore = useAIStore()
const currentLocale = ref(getLocale())
const selectedSection = ref('game')
const legalDialogType = ref<'user-agreement' | 'privacy-policy' | 'special-notice' | null>(null)

const sections = computed(() => [
  { id: 'game', label: t('settings.categories.game') },
  { id: 'java', label: t('settings.categories.java') },
  { id: 'launch', label: t('settings.categories.launch') },
  { id: 'account', label: t('tabs.account') },
  { id: 'ai', label: t('ai.title') },
  { id: 'appearance', label: t('settings.categories.appearance') },
  { id: 'advanced', label: t('settings.categories.advanced') },
  { id: 'about', label: t('settings.about') },
  { id: 'credits', label: t('settings.credits') }
])

const aiProviders = computed(() => [
  {
    id: 'deepseek',
    name: t('settingsUi.provider.deepseek.name'),
    free: t('settingsUi.provider.deepseek.free'),
    url: 'https://platform.deepseek.com/',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { value: 'deepseek-chat', label: t('settingsUi.provider.deepseek.modelChat') },
      { value: 'deepseek-reasoner', label: t('settingsUi.provider.deepseek.modelReasoner') }
    ]
  },
  {
    id: 'doubao',
    name: t('settingsUi.provider.doubao.name'),
    free: t('settingsUi.provider.doubao.free'),
    url: 'https://console.volcengine.com/ark/',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { value: 'doubao-1-5-pro-32k-250115', label: t('settingsUi.provider.doubao.modelPro') },
      { value: 'doubao-1-5-lite-32k-250115', label: t('settingsUi.provider.doubao.modelLite') }
    ],
    note: t('settingsUi.provider.doubao.note')
  },
  {
    id: 'qwen',
    name: t('settingsUi.provider.qwen.name'),
    free: t('settingsUi.provider.qwen.free'),
    url: 'https://dashscope.console.aliyun.com/',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { value: 'qwen-plus', label: t('settingsUi.provider.qwen.modelPlus') },
      { value: 'qwen-turbo', label: t('settingsUi.provider.qwen.modelTurbo') },
      { value: 'qwen-long', label: t('settingsUi.provider.qwen.modelLong') }
    ]
  },
  {
    id: 'kimi',
    name: t('settingsUi.provider.kimi.name'),
    free: t('settingsUi.provider.kimi.free'),
    url: 'https://platform.moonshot.cn/',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { value: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
      { value: 'moonshot-v1-32k', label: 'moonshot-v1-32k' }
    ]
  },
  {
    id: 'glm',
    name: t('settingsUi.provider.glm.name'),
    free: t('settingsUi.provider.glm.free'),
    url: 'https://open.bigmodel.cn/',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { value: 'glm-4.7-flash', label: t('settingsUi.provider.glm.modelFlash') },
      { value: 'glm-4.7-flashx', label: t('settingsUi.provider.glm.modelFlashX') },
      { value: 'glm-4-flash', label: t('settingsUi.provider.glm.model4Flash') },
      { value: 'glm-4-air', label: t('settingsUi.provider.glm.model4Air') },
      { value: 'glm-4', label: t('settingsUi.provider.glm.model4') }
    ]
  },
  {
    id: 'openai',
    name: t('settingsUi.provider.openai.name'),
    free: t('settingsUi.provider.openai.free'),
    url: 'https://platform.openai.com/',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { value: 'gpt-4o-mini', label: t('settingsUi.provider.openai.model4oMini') },
      { value: 'gpt-4o', label: t('settingsUi.provider.openai.model4o') },
      { value: 'gpt-4', label: 'gpt-4' }
    ]
  },
  {
    id: 'custom',
    name: t('settingsUi.provider.custom.name'),
    free: t('settingsUi.provider.custom.free'),
    url: '',
    baseUrl: '',
    models: []
  }
])

const selectedProviderId = ref('deepseek')

const currentProvider = computed(() => {
  return aiProviders.value.find(p => p.id === selectedProviderId.value) || aiProviders.value[0]
})

const selectProvider = (providerId: string) => {
  selectedProviderId.value = providerId
  const provider = aiProviders.value.find(p => p.id === providerId)
  if (provider && provider.baseUrl) {
    aiStore.config.baseUrl = provider.baseUrl
    if (provider.models.length > 0) {
      aiStore.config.model = provider.models[0].value
    }
  }
}

const openProviderUrl = (url: string) => {
  if (url && window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url)
  } else if (url) {
    window.open(url, '_blank')
  }
}

// Java 下载相关
const javaVersions = computed(() => [
  { version: '25', name: t('settingsUi.java.name25'), size: 220, recommend: false, discouraged: true, warning: t('settingsUi.java.warnTooNew') },
  { version: '24', name: 'Java 24', size: 210, recommend: false, discouraged: true, warning: t('settingsUi.java.warnTooNew') },
  { version: '23', name: 'Java 23', size: 200, recommend: false, discouraged: true, warning: t('settingsUi.java.warnLinkage') },
  { version: '22', name: 'Java 22', size: 195, recommend: false, discouraged: false, warning: '' },
  { version: '21', name: t('settingsUi.java.name21'), size: 180, recommend: true, discouraged: false, warning: '' },
  { version: '17', name: t('settingsUi.java.name17'), size: 170, recommend: true, discouraged: false, warning: '' },
  { version: '11', name: t('settingsUi.java.name11'), size: 150, recommend: false, discouraged: false, warning: '' },
  { version: '8', name: t('settingsUi.java.name8'), size: 100, recommend: false, discouraged: false, warning: '' }
])
const downloadingJava = ref<string | null>(null)
const javaDownloadProgress = ref(0)
const javaDownloadSpeed = ref(0)
const javaDownloadStatus = ref('')
const installedJavaVersions = ref<{version: string; path: string}[]>([])

const selectJavaPath = async () => {
  const path = await (window as any).electron.selectFile([{ name: 'Java', extensions: ['exe', 'jar'] }])
  if (path) {
    settingsStore.settings.javaPath = path
  }
}

const showAddDirModal = ref(false)
const newDirName = ref('')
const newDirPath = ref('')

// ===== 下载代理（HTTP / SOCKS5）：节点由用户自行提供，启动器不内置任何节点 =====
const proxyTesting = ref(false)
const proxyTestResult = ref<{ ok: boolean; text: string } | null>(null)

const testProxyConfig = async () => {
  if (!window.electronAPI?.testProxy) return
  proxyTesting.value = true
  proxyTestResult.value = null
  try {
    const s = settingsStore.settings
    const r = await window.electronAPI.testProxy({
      enabled: true,
      type: s.proxyType,
      host: s.proxyHost,
      port: Number(s.proxyPort) || 7890,
      username: s.proxyUsername,
      password: s.proxyPassword
    })
    if (r && r.ok) {
      proxyTestResult.value = { ok: true, text: t('settingsUi.proxyTestOk', { ms: r.ms, speed: Math.round(r.kbs || 0) }) }
    } else {
      proxyTestResult.value = { ok: false, text: t('settingsUi.proxyTestFail', { err: r?.error || 'unknown' }) }
    }
  } catch (e: any) {
    proxyTestResult.value = { ok: false, text: t('settingsUi.proxyTestFail', { err: e?.message || String(e) }) }
  } finally {
    proxyTesting.value = false
  }
}

const openAddDirModal = () => {
  newDirName.value = ''
  newDirPath.value = ''
  showAddDirModal.value = true
}

const closeAddDirModal = () => {
  showAddDirModal.value = false
}

const browseNewDirPath = async () => {
  const path = await (window as any).electron.selectDirectory()
  if (path) {
    newDirPath.value = path
    if (!newDirName.value) {
      // 自动用目录名作为名称
      const parts = path.split(/[\\/]/)
      newDirName.value = parts[parts.length - 1] || t('settingsUi.newDirectory')
    }
  }
}

const addNewDir = async () => {
  if (!newDirName.value.trim() || !newDirPath.value.trim()) return
  const entry = settingsStore.addGameDir(newDirName.value.trim(), newDirPath.value.trim())
  if (entry) {
    // 自动切换到新添加的目录
    await switchGameDir(entry.id)
  }
  closeAddDirModal()
}

const javaDownloadLogs = ref<string[]>([])
const javaDownloadLogsContainer = ref<HTMLElement | null>(null)
let removeJavaDownloadLogListener: (() => void) | null = null

const deleteGameDir = (id: string) => {
  const dir = settingsStore.gameDirs.find(d => d.id === id)
  if (dir && confirm(t('settingsUi.confirmDeleteDir', { name: dir.name }))) {
    settingsStore.removeGameDir(id)
    // 如果删除的是当前选中的，切换回默认并同步
    if (settingsStore.currentGameDir) {
      window.electronAPI?.setGameDir(settingsStore.currentGameDir.path)
    }
  }
}

const applySettings = () => {
  settingsStore.saveSettings()
}

// 渐变预设
const gradientPresets = computed(() => [
  // 深色渐变
  { label: t('settingsUi.gradient.deepNight'), value: 'linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 50%, #16213e 100%)' },
  { label: t('settingsUi.gradient.violetDream'), value: 'linear-gradient(135deg, #1a0a2e 0%, #4a1a6b 50%, #8b2f5c 100%)' },
  { label: t('settingsUi.gradient.oceanHeart'), value: 'linear-gradient(135deg, #001f3f 0%, #003366 50%, #004080 100%)' },
  { label: t('settingsUi.gradient.forestSecret'), value: 'linear-gradient(135deg, #0d2818 0%, #1a4d2e 50%, #2d6a4f 100%)' },
  { label: t('settingsUi.gradient.emberFlame'), value: 'linear-gradient(135deg, #2d0a0a 0%, #5c1a1a 50%, #8b2f2f 100%)' },
  { label: t('settingsUi.gradient.frostRealm'), value: 'linear-gradient(135deg, #0a1a2d 0%, #1a3a5c 50%, #2f5c8b 100%)' },
  // 浅色渐变
  { label: t('settingsUi.gradient.morningSunlight'), value: 'linear-gradient(135deg, #fff5e6 0%, #ffe4cc 50%, #ffd9b3 100%)' },
  { label: t('settingsUi.gradient.skyBlue'), value: 'linear-gradient(135deg, #e6f3ff 0%, #cce7ff 50%, #b3dbff 100%)' },
  { label: t('settingsUi.gradient.freshMint'), value: 'linear-gradient(135deg, #e6fff5 0%, #ccffeb 50%, #b3ffe0 100%)' },
  { label: t('settingsUi.gradient.cherryBlossom'), value: 'linear-gradient(135deg, #ffe6f0 0%, #ffcce0 50%, #ffb3d1 100%)' },
  { label: t('settingsUi.gradient.lavenderPurple'), value: 'linear-gradient(135deg, #f0e6ff 0%, #e0ccff 50%, #d1b3ff 100%)' },
  { label: t('settingsUi.gradient.lemonYellow'), value: 'linear-gradient(135deg, #fffde6 0%, #fffacc 50%, #fff7b3 100%)' },
  { label: t('settingsUi.gradient.coralOrange'), value: 'linear-gradient(135deg, #ffe8e6 0%, #ffd1cc 50%, #ffbab3 100%)' },
  { label: t('settingsUi.gradient.mintGreen'), value: 'linear-gradient(135deg, #e8fff0 0%, #d1ffe0 50%, #baffd1 100%)' }
])

// 选择背景图片
const selectBackgroundImage = async () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e: any) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        settingsStore.settings.backgroundImage = e.target?.result as string
      }
      reader.readAsDataURL(file)
    }
  }
  input.click()
}

// 全量刷新已安装的 Java 列表
//
// 注意：不能用 checkJava() 的结果填充列表，它只返回自动挑选的那一个版本
// （例如装有 17/21/25 时永远只返回 21，刷新后其他版本会「消失」）
//
// 必须放在 setup 顶层作用域，不能塞进 onMounted —— downloadJava 和
// deleteJava 都要调用它，而 const 不会提升、也不跨函数作用域。
// 之前它被误放在 onMounted 内部，导致这两处抛
// ReferenceError: refreshInstalledJava is not defined，
// 而且错误被 downloadJava 的 catch 捕获，弹成「下载出错:...」，看着像下载本身失败。
const refreshInstalledJava = async () => {
  if (!window.electronAPI?.listJavas) return
  try {
    const result = await window.electronAPI.listJavas()
    const list = result?.list || []
    const seen = new Set<string>()
    const parsed: { version: string; path: string }[] = []
    for (const item of list) {
      if (!item?.path) continue
      const key = item.path.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      parsed.push({ version: String(item.version), path: item.path })
    }
    parsed.sort((a, b) => (parseInt(b.version) || 0) - (parseInt(a.version) || 0))
    installedJavaVersions.value = parsed
  } catch (e) {
    console.error('[Settings] 获取已安装的 Java 列表失败:', e)
  }
}

// 下载 Java
const downloadJava = async (version: string) => {
  if (!window.electronAPI?.downloadJava) {
    alert(t('settingsUi.downloadUnavailable'))
    return
  }
  const downloadsStore = useDownloadsStore()

  downloadingJava.value = version
  javaDownloadProgress.value = 0
  javaDownloadSpeed.value = 0
  javaDownloadStatus.value = t('settingsUi.preparingDownload')

  downloadsStore.addTask({
    id: `java-${version}`,
    name: `Java ${version}`,
    category: 'java',
    status: 'downloading'
  })

  // 设置进度监听
  const removeListener = window.electronAPI.onJavaDownloadProgress((event, data) => {
    if (data.version === version) {
      javaDownloadProgress.value = data.progress
      javaDownloadSpeed.value = data.speed || 0
      // 主进程上报的 speed 统一为 字节/秒，直接用（不要再乘 1024）
      const speedBytes = data.speed || 0
      downloadsStore.updateProgress(
        `java-${version}`,
        data.progress,
        speedBytes,
        Math.round((data.progress / 100) * (data.totalBytes || 0)),
        data.totalBytes || 0
      )
      if (data.status === 'downloading') {
        const speedStr = data.speed > 0 ? ` (${downloadsStore.formatSpeed(data.speed)})` : ''
        javaDownloadStatus.value = t('settingsUi.downloading', { progress: data.progress }) + speedStr
      } else if (data.status === 'extracting') {
        javaDownloadStatus.value = t('settingsUi.extracting')
        downloadsStore.setStatus(`java-${version}`, 'downloading', t('settingsUi.extracting'))
      } else if (data.status === 'completed') {
        javaDownloadStatus.value = t('settingsUi.completed')
      }
    }
  })

  // 设置日志监听
  // 注意：读取历史日志失败不能中断整个下载流程——这里一旦抛错而下方 try/finally
  // 未执行，状态就会永远卡在「准备下载...」。必须独立容错。
  javaDownloadLogs.value = []
  try {
    if (window.electronAPI?.getJavaDownloadLogs) {
      const logs = await window.electronAPI.getJavaDownloadLogs(version)
      javaDownloadLogs.value = Array.isArray(logs) ? logs : []
    }
  } catch (e) {
    console.error('[Settings] 读取 Java 下载日志失败:', e)
  }
  if (window.electronAPI?.onJavaDownloadLog) {
    removeJavaDownloadLogListener = window.electronAPI.onJavaDownloadLog((event, d) => {
      if (d.version === version) {
        javaDownloadLogs.value.push(d.line)
        if (javaDownloadLogs.value.length > 2000) {
          javaDownloadLogs.value.splice(0, javaDownloadLogs.value.length - 1000)
        }
        nextTick(() => {
          const el = javaDownloadLogsContainer.value
          if (el) el.scrollTop = el.scrollHeight
        })
      }
    })
  }

  try {
    const result = await window.electronAPI.downloadJava(version)
    removeListener()
    if (removeJavaDownloadLogListener) {
      removeJavaDownloadLogListener()
      removeJavaDownloadLogListener = null
    }
    if (window.electronAPI?.clearJavaDownloadLogs) {
      window.electronAPI.clearJavaDownloadLogs(version)
    }

    if (result.success) {
      downloadsStore.setStatus(`java-${version}`, 'completed')
      alert(t('settingsUi.javaInstallSuccess', { version }))
      // 重新全量扫描，确保列表与磁盘实际状态一致（而非手动追加一条）
      await refreshInstalledJava()
    } else {
      if (result.error === '下载已取消') {
        javaDownloadStatus.value = t('settingsUi.downloadCancelled')
        downloadsStore.setStatus(`java-${version}`, 'cancelled')
      } else {
        downloadsStore.setStatus(`java-${version}`, 'failed', result.error)
        alert(t('settingsUi.downloadFailed', { error: result.error }))
      }
    }
  } catch (error: any) {
    downloadsStore.setStatus(`java-${version}`, 'failed', error.message)
    alert(t('settingsUi.downloadError', { error: error.message }))
  } finally {
    if (removeJavaDownloadLogListener) {
      removeJavaDownloadLogListener()
      removeJavaDownloadLogListener = null
    }
    if (window.electronAPI?.clearJavaDownloadLogs) {
      window.electronAPI.clearJavaDownloadLogs(version)
    }
    downloadingJava.value = null
    javaDownloadProgress.value = 0
    javaDownloadSpeed.value = 0
    setTimeout(() => {
      if (!downloadingJava.value) {
        javaDownloadStatus.value = ''
      }
    }, 2000)
  }
}

// 取消下载
const cancelJavaDownload = async () => {
  if (!window.electronAPI?.cancelJavaDownload) return
  const downloadsStore = useDownloadsStore()
  const result = await window.electronAPI.cancelJavaDownload()
  if (result.success) {
    if (downloadingJava.value) {
      downloadsStore.setStatus(`java-${downloadingJava.value}`, 'cancelled')
    }
    downloadingJava.value = null
    javaDownloadProgress.value = 0
    javaDownloadSpeed.value = 0
    javaDownloadStatus.value = t('settingsUi.cancelled')
    setTimeout(() => { javaDownloadStatus.value = '' }, 2000)
  }
}

// 删除已安装的 Java
const deleteJava = async (version: string) => {
  if (!window.electronAPI?.deleteJava) {
    alert(t('settingsUi.deleteUnavailable'))
    return
  }
  
  if (!confirm(t('settingsUi.confirmDeleteJava', { version }))) return
  
  try {
    const result = await window.electronAPI.deleteJava(version)
    if (result.success) {
      await refreshInstalledJava()
      alert(t('settingsUi.javaDeleted', { version }))
    } else {
      alert(t('settingsUi.deleteFailed', { error: result.error }))
    }
  } catch (error: any) {
    alert(t('settingsUi.deleteError', { error: error.message }))
  }
}

let handleSelectSection: ((e: Event) => void) | null = null

onMounted(async () => {
  // 根据已保存的 baseUrl 自动匹配服务商
  const savedBaseUrl = aiStore.config.baseUrl
  if (savedBaseUrl) {
    const matched = aiProviders.value.find(p => p.baseUrl && savedBaseUrl.startsWith(p.baseUrl))
    if (matched) {
      selectedProviderId.value = matched.id
    } else {
      selectedProviderId.value = 'custom'
    }
  }

  // 获取当前游戏目录并初始化多目录列表
  if (window.electronAPI?.getGameDir) {
    const defaultDir = await window.electronAPI.getGameDir()
    // 初始化默认目录
    settingsStore.initDefaultGameDir(defaultDir)
    // 如果当前选中了自定义目录，同步到主进程
    const currentDir = settingsStore.currentGameDir
    if (currentDir && currentDir.path && !currentDir.isDefault) {
      await window.electronAPI?.setGameDir(currentDir.path)
    } else {
      await window.electronAPI?.setGameDir(defaultDir)
    }
  }

  // 全量刷新已安装的 Java 列表
  await refreshInstalledJava()

  // 获取应用版本
  if (window.electronAPI?.getAppVersion) {
    const versionInfo = await window.electronAPI.getAppVersion()
    appVersion.value = versionInfo.version
  }

  // 监听更新状态
  if (window.electronAPI?.onUpdateStatus) {
    window.electronAPI.onUpdateStatus((event, data) => {
      updateStatus.value = data.status
      if (data.version) updateAvailableVersion.value = data.version
      if (data.progress) updateProgress.value = data.progress
      if (data.error) updateError.value = data.error
    })
  }

  // 获取系统内存信息
  await refreshSystemMemory()
  memoryRefreshTimer = setInterval(refreshSystemMemory, 3000)

  // 监听外部导航事件
  handleSelectSection = ((e: CustomEvent) => {
    const { section } = e.detail
    if (section) {
      selectedSection.value = section
    }
  }) as EventListener
  window.addEventListener('select-settings-section', handleSelectSection)
})

onUnmounted(() => {
  if (memoryRefreshTimer) {
    clearInterval(memoryRefreshTimer)
    memoryRefreshTimer = null
  }
  if (handleSelectSection) {
    window.removeEventListener('select-settings-section', handleSelectSection)
  }
})

// 更新相关
const appVersion = ref('')
const updateStatus = ref<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'>('idle')
const updateAvailableVersion = ref('')
const updateProgress = ref(0)
const updateError = ref('')

// 系统内存信息
const systemMemory = ref<{ total: number; used: number; free: number } | null>(null)
const memoryReserve = 4

const autoAllocatedMemory = computed(() => {
  if (!systemMemory.value) return 4
  return Math.max(2, Math.floor(systemMemory.value.total - memoryReserve))
})

const gameMemory = computed(() => {
  return settingsStore.settings.autoMemory ? autoAllocatedMemory.value : settingsStore.settings.maxMemory
})

const remainingMemory = computed(() => {
  if (!systemMemory.value) return 0
  return Math.max(0, parseFloat((systemMemory.value.total - gameMemory.value).toFixed(1)))
})

const memoryUsagePercent = computed(() => {
  if (!systemMemory.value) return 0
  return (systemMemory.value.used / systemMemory.value.total) * 100
})

const maxMemoryLimit = computed(() => {
  if (!systemMemory.value) return 16
  return Math.max(4, Math.floor(systemMemory.value.total - 1))
})

const refreshSystemMemory = async () => {
  if (window.electronAPI?.getSystemMemory) {
    systemMemory.value = await window.electronAPI.getSystemMemory()
  }
}

let memoryRefreshTimer: any = null

const checkForUpdates = async () => {
  if (window.electronAPI?.checkForUpdates) {
    updateStatus.value = 'checking'
    await window.electronAPI.checkForUpdates()
  }
}

// 日志复制
const logCopyState = ref<'idle' | 'copying' | 'done' | 'empty' | 'error'>('idle')
let logCopyResetTimer: any = null

const resetLogCopyState = () => {
  if (logCopyResetTimer) clearTimeout(logCopyResetTimer)
  logCopyResetTimer = setTimeout(() => { logCopyState.value = 'idle' }, 2500)
}

onBeforeUnmount(() => {
  if (logCopyResetTimer) clearTimeout(logCopyResetTimer)
})

const copyLauncherLog = async () => {
  if (!window.electronAPI?.getLauncherLog) return
  logCopyState.value = 'copying'
  try {
    const result = await window.electronAPI.getLauncherLog()
    if (!result?.success || !result.text) {
      logCopyState.value = 'empty'
    } else {
      await navigator.clipboard.writeText(result.text)
      logCopyState.value = 'done'
    }
  } catch {
    logCopyState.value = 'error'
  }
  resetLogCopyState()
}

const openLauncherLogDir = async () => {
  await window.electronAPI?.openLogDir?.()
}

const downloadUpdate = async () => {
  if (window.electronAPI?.downloadUpdate) {
    updateStatus.value = 'downloading'
    await window.electronAPI.downloadUpdate()
  }
}

const installUpdate = async () => {
  if (window.electronAPI?.installUpdate) {
    await window.electronAPI.installUpdate()
  }
}

const handleForceResetDownloads = async () => {
  if (!confirm(t('settingsUi.confirmForceReset'))) {
    return
  }

  try {
    const result = await window.electronAPI.forceResetDownloads()
    if (result.success) {
      // 清除 store 内存中的下载状态并立即保存到 localStorage
      versionsStore.forceClearAllDownloadStates()
      
      alert(t('settingsUi.resetDone'))
      // 延迟刷新，确保 localStorage 写入完成
      setTimeout(() => {
        window.location.reload()
      }, 100)
    } else {
      alert(t('settingsUi.resetFailed', { error: result.error }))
    }
  } catch (error: any) {
    alert(t('settingsUi.operationFailed', { error: error.message }))
  }
}

const testAIConnection = async () => {
  try {
    const response = await fetch(`${aiStore.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiStore.config.apiKey}`
      },
      body: JSON.stringify({
        model: aiStore.config.model,
        messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
        max_tokens: 20
      })
    })

    if (response.ok) {
      alert(t('settingsUi.connSuccess'))
    } else {
      const data = await response.json().catch(() => ({}))
      alert(t('settingsUi.connFailed', { status: response.status, error: data?.error?.message || t('settingsUi.unknownError') }))
    }
  } catch (error: any) {
    alert(t('settingsUi.connFailedDetail', { error: error.message }))
  }
}

// 鸣谢数据
const credits = computed(() => ({
  openSource: [
    { name: 'Vue 3', desc: t('settingsUi.credit.vue3Desc'), url: 'https://vuejs.org' },
    { name: 'Electron', desc: t('settingsUi.credit.electronDesc'), url: 'https://www.electronjs.org' },
    { name: 'Vite', desc: t('settingsUi.credit.viteDesc'), url: 'https://vitejs.dev' },
    { name: 'Pinia', desc: t('settingsUi.credit.piniaDesc'), url: 'https://pinia.vuejs.org' },
    { name: 'TypeScript', desc: t('settingsUi.credit.typescriptDesc'), url: 'https://www.typescriptlang.org' },
    { name: 'Vue I18n', desc: t('settingsUi.credit.vueI18nDesc'), url: 'https://vue-i18n.intlify.dev' },
    { name: 'VueUse', desc: t('settingsUi.credit.vueuseDesc'), url: 'https://vueuse.org' },
    { name: 'Axios', desc: t('settingsUi.credit.axiosDesc'), url: 'https://axios-http.com' },
    { name: 'electron-updater', desc: t('settingsUi.credit.electronUpdaterDesc'), url: 'https://www.electron.build/auto-update' },
    { name: 'electron-builder', desc: t('settingsUi.credit.electronBuilderDesc'), url: 'https://www.electron.build' },
    { name: 'vite-plugin-electron', desc: t('settingsUi.credit.vitePluginElectronDesc'), url: 'https://github.com/electron-vite/vite-plugin-electron' },
    { name: '@vitejs/plugin-vue', desc: t('settingsUi.credit.vitejsPluginVueDesc'), url: 'https://github.com/vitejs/vite-plugin-vue' },
    { name: 'Sass', desc: t('settingsUi.credit.sassDesc'), url: 'https://sass-lang.com' },
    { name: 'vue-tsc', desc: t('settingsUi.credit.vueTscDesc'), url: 'https://github.com/vuejs/language-tools' }
  ],
  tools: [
    { name: 'Minecraft', desc: t('settingsUi.credit.minecraftDesc'), url: 'https://www.minecraft.net' },
    { name: 'Modrinth', desc: t('settingsUi.credit.modSourceDesc'), url: 'https://modrinth.com' },
    { name: 'CurseForge', desc: t('settingsUi.credit.modSourceDesc'), url: 'https://www.curseforge.com' },
    { name: 'MCBBS', desc: t('settingsUi.credit.communityDesc'), url: 'https://www.mcbbs.net' },
    { name: t('settingsUi.credit.mcbbsDownloadName'), desc: t('settingsUi.credit.mcbbsDownloadDesc'), url: 'https://download.mcbbs.net' },
    { name: 'KLPBBS', desc: t('settingsUi.credit.communityDesc'), url: 'https://www.klpbbs.com' },
    { name: 'MineBBS', desc: t('settingsUi.credit.communityDesc'), url: 'https://www.minebbs.com' },
    { name: t('settingsUi.credit.mcmodName'), desc: t('settingsUi.credit.mcmodDesc'), url: 'https://www.mcmod.cn' },
    { name: 'FRP', desc: t('settingsUi.credit.frpDesc'), url: 'https://github.com/fatedier/frp' },
    { name: 'EasyTier', desc: t('settingsUi.credit.easytierDesc'), url: 'https://github.com/EasyTier/EasyTier' },
    { name: 'PeerJS', desc: t('settingsUi.credit.peerjsDesc'), url: 'https://peerjs.com' },
    { name: t('settingsUi.credit.sakuraName'), desc: t('settingsUi.credit.sakuraDesc'), url: 'https://www.natfrp.com' },
    { name: t('settingsUi.credit.locyanName'), desc: t('settingsUi.credit.locyanDesc'), url: 'https://www.locyanfrp.cn' },
    { name: 'ChmlFrp', desc: t('settingsUi.credit.publicFrpDesc'), url: 'https://www.chmlfrp.cn' },
    { name: t('settingsUi.credit.mefrpName'), desc: t('settingsUi.credit.publicFrpDesc'), url: 'https://www.mefrp.cn' },
    { name: 'Eclipse Adoptium', desc: t('settingsUi.credit.adoptiumDesc'), url: 'https://adoptium.net' },
    { name: 'GitHub', desc: t('settingsUi.credit.githubDesc'), url: 'https://github.com' }
  ],
  special: [
    { name: t('settingsUi.credit.traeName'), desc: t('settingsUi.credit.traeDesc'), url: 'https://trae.cn' },
    { name: t('settingsUi.credit.youName'), desc: t('settingsUi.credit.youDesc'), url: '' }
  ]
}))

const openCreditsUrl = (url: string) => {
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url)
  } else if (url) {
    window.open(url, '_blank')
  }
}
</script>

<template>
  <div class="settings-panel-wrapper">
  <div class="settings-panel">
    <div class="panel-header">
      <h2>{{ t('settings.title') }}</h2>
      <button class="apply-btn" @click="applySettings">
        {{ t('settingsUi.applySettings') }}
      </button>
    </div>
    
    <div class="settings-container">
      <div class="settings-sidebar">
        <button
          v-for="section in sections"
          :key="section.id"
          class="sidebar-item"
          :class="{ active: selectedSection === section.id }"
          @click="selectedSection = section.id"
        >
          {{ section.label }}
        </button>
      </div>
      
      <div class="settings-content">
        <div v-if="selectedSection === 'game'" class="settings-section">
          <h3>{{ t('settings.categories.game') }}</h3>
          
          <div class="setting-item game-dirs-section">
            <label class="setting-label">
              <span>{{ t('settings.gameDir') }}</span>
              <span class="setting-desc">{{ t('settings.gameDirDesc') }}</span>
            </label>
            <div class="game-dirs-control">
              <div class="game-dirs-list">
                <div
                  v-for="dir in settingsStore.gameDirs"
                  :key="dir.id"
                  class="game-dir-item"
                  :class="{ active: settingsStore.currentGameDirId === dir.id }"
                >
                  <div class="dir-info" @click="switchGameDir(dir.id)">
                    <div class="dir-name">
                      <span v-if="dir.isDefault" class="default-badge">{{ t('settings.default') }}</span>
                      {{ dir.name }}
                    </div>
                    <div class="dir-path">{{ dir.path }}</div>
                  </div>
                  <div class="dir-actions">
                    <button
                      v-if="!dir.isDefault"
                      class="dir-action-btn delete"
                      @click="deleteGameDir(dir.id)"
                      :title="t('settingsUi.deleteThisDir')"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <button class="add-dir-btn" @click="openAddDirModal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {{ t('settingsUi.addGameDir') }}
              </button>
            </div>
          </div>
          
          <div class="memory-allocation-card">
            <h3 class="memory-card-title">{{ t('settingsUi.memoryAllocation') }}</h3>
            
            <div class="system-memory-section">
              <div class="memory-header">
                <span class="memory-label">{{ t('settingsUi.systemMemory') }}</span>
                <span class="memory-total">{{ systemMemory?.total?.toFixed(1) || '0.0' }} GB</span>
              </div>
              <div class="memory-progress-bar">
                <div class="memory-progress-fill" :style="{ width: memoryUsagePercent + '%' }"></div>
              </div>
              <div class="memory-subtext">
                <span>{{ t('settings.memoryUsed') }} {{ systemMemory?.used?.toFixed(1) || '0.0' }} GB</span>
                <span>{{ t('settings.memoryFree') }} {{ systemMemory?.free?.toFixed(1) || '0.0' }} GB</span>
              </div>
            </div>

            <div class="memory-mode-select">
              <label class="radio-option" :class="{ active: settingsStore.settings.autoMemory }">
                <input 
                  type="radio" 
                  :checked="settingsStore.settings.autoMemory"
                  @change="settingsStore.settings.autoMemory = true"
                />
                <span class="radio-custom"></span>
                <span class="radio-label">{{ t('settingsUi.autoConfigure') }}</span>
              </label>
              <label class="radio-option" :class="{ active: !settingsStore.settings.autoMemory }">
                <input 
                  type="radio" 
                  :checked="!settingsStore.settings.autoMemory"
                  @change="settingsStore.settings.autoMemory = false"
                />
                <span class="radio-custom"></span>
                <span class="radio-label">{{ t('settingsUi.custom') }}</span>
              </label>
            </div>

            <div v-if="settingsStore.settings.autoMemory" class="auto-memory-display">
              <span class="auto-memory-label">{{ t('settingsUi.autoAllocated') }}</span>
              <span class="auto-memory-value">{{ autoAllocatedMemory }} GB</span>
              <span class="auto-memory-hint">{{ t('settingsUi.autoAllocHint') }}</span>
            </div>

            <div v-if="!settingsStore.settings.autoMemory" class="custom-memory-slider">
              <div class="slider-header">
                <span>{{ t('settings.gameMemory') }}</span>
                <span class="slider-value">{{ settingsStore.settings.maxMemory }} GB</span>
              </div>
              <input 
                v-model.number="settingsStore.settings.maxMemory"
                type="range" 
                min="1" 
                :max="maxMemoryLimit"
                class="range-input"
              />
            </div>

            <div class="game-memory-summary">
              <div class="summary-item">
                <span class="summary-label">{{ t('settingsUi.gameAllocatedMemory') }}</span>
                <span class="summary-value">{{ gameMemory }} GB</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">{{ t('settingsUi.remainingAvailable') }}</span>
                <span class="summary-value remaining">{{ remainingMemory }} GB</span>
              </div>
            </div>
          </div>
          

        </div>

        <div v-else-if="selectedSection === 'about'" class="settings-section about-section">
          <h3>{{ t('settings.about') }}</h3>

          <div class="developer-card">
            <div class="developer-avatar">
              <span class="avatar-text">Z</span>
            </div>
            <div class="developer-info">
              <div class="developer-name">{{ t('settingsUi.developerYou') }}</div>
              <div class="developer-desc">{{ t('settingsUi.developerDesc') }}</div>
            </div>
          </div>

          <div class="about-launcher-card">
            <div class="launcher-icon">
              <span class="launcher-icon-text">ZN</span>
            </div>
            <div class="launcher-info">
              <div class="launcher-name">ZNCraft Launcher</div>
              <div class="launcher-version">{{ t('settingsUi.currentVersion', { v: appVersion || APP_LABEL }) }}</div>
            </div>
            <div class="launcher-actions">
              <div v-if="updateStatus === 'idle'" class="update-idle">
                <button class="action-btn primary" @click="checkForUpdates">
                  {{ t('settings.checkUpdates') }}
                </button>
              </div>
              <div v-else-if="updateStatus === 'checking'" class="update-checking">
                <span class="update-text">{{ t('settings.checkingUpdates') }}</span>
              </div>
              <div v-else-if="updateStatus === 'available'" class="update-available">
                <span class="update-text">{{ t('settings.updateAvailable') }}: v{{ updateAvailableVersion }}</span>
                <button class="action-btn primary" @click="downloadUpdate">
                  {{ t('settings.downloadUpdate') }}
                </button>
              </div>
              <div v-else-if="updateStatus === 'downloading'" class="update-downloading">
                <span class="update-text">{{ t('settings.downloadingUpdate') }}: {{ Math.round(updateProgress) }}%</span>
                <div class="progress-bar">
                  <div class="progress-fill" :style="{ width: updateProgress + '%' }"></div>
                </div>
              </div>
              <div v-else-if="updateStatus === 'downloaded'" class="update-downloaded">
                <span class="update-text">{{ t('settings.updateReady') }}</span>
                <button class="action-btn primary" @click="installUpdate">
                  {{ t('settings.installUpdate') }}
                </button>
              </div>
              <div v-else-if="updateStatus === 'up-to-date'" class="update-up-to-date">
                <span class="update-text">{{ t('settings.upToDate') }}</span>
              </div>
              <div v-else-if="updateStatus === 'error'" class="update-error">
                <span class="update-text error">{{ t('settings.updateError') }}: {{ updateError }}</span>
                <button class="action-btn" @click="checkForUpdates">{{ t('settings.retry') }}</button>
              </div>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.launcherLog') }}</span>
              <span class="setting-desc">{{ t('settings.launcherLogDesc') }}</span>
            </label>
            <div class="setting-control">
              <div class="legal-links">
                <button
                  class="legal-link-btn"
                  :disabled="logCopyState === 'copying'"
                  @click="copyLauncherLog"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  <span v-if="logCopyState === 'copying'">...</span>
                  <span v-else-if="logCopyState === 'done'">{{ t('settings.copyLogDone') }}</span>
                  <span v-else-if="logCopyState === 'empty'">{{ t('settings.copyLogEmpty') }}</span>
                  <span v-else-if="logCopyState === 'error'">{{ t('settings.copyLogFailed') }}</span>
                  <span v-else>{{ t('settings.copyLog') }}</span>
                </button>
                <button class="legal-link-btn" @click="openLauncherLogDir">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  {{ t('settings.openLogDir') }}
                </button>
              </div>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.legalInfo') }}</span>
              <span class="setting-desc">{{ t('settingsUi.legalReadHint') }}</span>
            </label>
            <div class="setting-control">
              <div class="legal-links">
                <button class="legal-link-btn" @click="legalDialogType = 'user-agreement'">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                  {{ t('settingsUi.userAgreement') }}
                </button>
                <button class="legal-link-btn" @click="legalDialogType = 'privacy-policy'">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  {{ t('settingsUi.privacyPolicy') }}
                </button>
                <button class="legal-link-btn" @click="legalDialogType = 'special-notice'">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  {{ t('settingsUi.specialNotice') }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="selectedSection === 'java'" class="settings-section">
          <h3>{{ t('settings.categories.java') }}</h3>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.javaSelect') }}</span>
              <span class="setting-desc">{{ t('settings.javaSelectDesc') }}</span>
            </label>
            <div class="setting-control">
              <select v-model="settingsStore.settings.javaPath" class="select-input">
                <option value="">{{ t('settings.javaAuto') }}</option>
                <option
                  v-if="settingsStore.settings.javaPath && !installedJavaVersions.some(j => j.path === settingsStore.settings.javaPath)"
                  :value="settingsStore.settings.javaPath"
                >{{ t('settings.javaCustom') }}: {{ settingsStore.settings.javaPath }}</option>
                <option v-for="j in installedJavaVersions" :key="j.path" :value="j.path">
                  Java {{ j.version }}
                </option>
              </select>
              <button class="browse-btn" @click="refreshInstalledJava">{{ t('settings.javaRefreshList') }}</button>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.javaAutoDownload') }}</span>
              <span class="setting-desc">{{ t('settings.javaAutoDownloadDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  v-model="settingsStore.settings.autoDownloadJava"
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.skipJavaCheck') }}</span>
              <span class="setting-desc">{{ t('settingsUi.skipJavaCheckDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  v-model="settingsStore.settings.skipJavaCheck"
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.javaPath') }}</span>
              <span class="setting-desc">{{ t('settings.javaPathDesc') }}</span>
            </label>
            <div class="setting-control">
              <input 
                :value="settingsStore.settings.javaPath"
                type="text" 
                readonly
                class="path-input"
              />
              <button class="browse-btn" @click="selectJavaPath">{{ t('settings.browse') }}</button>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.jvmArgs') }}</span>
              <span class="setting-desc">{{ t('settings.jvmArgsDesc') }}</span>
            </label>
            <div class="setting-control">
              <textarea 
                v-model="settingsStore.settings.jvmArgs"
                class="textarea-input"
                rows="4"
                placeholder="-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC..."
              ></textarea>
            </div>
          </div>
          
          <div class="java-download-section">
            <h4>{{ t('settings.downloadJava') }}</h4>
            <p class="section-desc">{{ t('settings.downloadJavaDesc') }}</p>
            
            <div class="java-versions-list">
              <div 
                v-for="java in javaVersions" 
                :key="java.version"
                class="java-version-item"
              >
                <div class="java-info">
                  <span class="java-name" :class="{ 'discouraged': java.discouraged }">
                    {{ java.name }}
                    <span v-if="java.recommend" class="recommend-tag">{{ t('settingsUi.recommended') }}</span>
                    <span v-if="java.discouraged" class="discouraged-tag" :title="java.warning">{{ t('settingsUi.discouraged') }}</span>
                  </span>
                  <span class="java-size">{{ t('settingsUi.javaSize', { n: java.size }) }}</span>
                  <span v-if="java.discouraged && java.warning" class="java-warning">{{ java.warning }}</span>
                </div>
                <div class="java-actions">
                  <button 
                    v-if="downloadingJava === java.version"
                    class="download-btn downloading"
                    @click="cancelJavaDownload"
                  >
                    <span class="spinner"></span>
                    {{ javaDownloadStatus }}
                    <span class="cancel-text">{{ t('settingsUi.clickToCancel') }}</span>
                  </button>
                  <button 
                    v-else-if="installedJavaVersions.some(j => j.version === java.version)"
                    class="download-btn installed"
                    disabled
                  >
                    {{ t('settingsUi.installed') }}
                  </button>
                  <button 
                    v-else
                    class="download-btn"
                    @click="downloadJava(java.version)"
                  >
                    {{ t('settingsUi.download') }}
                  </button>
                </div>
              </div>
            </div>
            
            <div v-if="installedJavaVersions.length > 0" class="installed-java-section">
              <h5>{{ t('settings.installedJava') }}</h5>
              <div class="installed-list">
                <div 
                  v-for="java in installedJavaVersions" 
                  :key="java.version"
                  class="installed-item"
                >
                  <div class="installed-info">
                    <span class="installed-version">Java {{ java.version }}</span>
                    <span class="installed-path">{{ java.path }}</span>
                  </div>
                  <button class="delete-btn" @click="deleteJava(java.version)" :title="t('settingsUi.deleteThisVersion')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div v-else-if="selectedSection === 'launch'" class="settings-section">
          <h3>{{ t('settings.categories.launch') }}</h3>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.showLogOnLaunch') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.showLogs"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.autoUpdate') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.autoUpdate"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.keepRunningAfterClose') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.keepGameOpen"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>
        
        <div v-else-if="selectedSection === 'account'" class="settings-section">
          <h3>{{ t('settingsUi.offlineAccountMgmt') }}</h3>
          <p class="section-desc">{{ t('settingsUi.offlineAccountDesc') }}</p>
          <AccountManager />
        </div>

        <div v-else-if="selectedSection === 'ai'" class="settings-section">
          <h3>{{ t('settingsUi.aiSettings') }}</h3>
          <p class="section-desc">{{ t('settingsUi.aiSettingsDesc') }}</p>

          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.enableAI') }}</span>
              <small>{{ t('settingsUi.enableAIHint') }}</small>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input type="checkbox" v-model="aiStore.config.enabled" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div v-if="aiStore.config.enabled" class="ai-config-group">
            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.selectProvider') }}</span>
                <small>{{ t('settingsUi.selectProviderHint') }}</small>
              </label>
              <div class="setting-control">
                <select v-model="selectedProviderId" @change="selectProvider(selectedProviderId)" class="select-input">
                  <option v-for="p in aiProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
            </div>

            <div v-if="currentProvider.url" class="ai-provider-card">
              <div class="provider-info">
                <div class="provider-name">{{ currentProvider.name }}</div>
                <div class="provider-free">{{ currentProvider.free }}</div>
                <div v-if="currentProvider.note" class="provider-note">⚠️ {{ currentProvider.note }}</div>
              </div>
              <button class="btn-primary-sm" @click="openProviderUrl(currentProvider.url)" type="button">
                {{ t('settingsUi.getKey') }}
              </button>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>API Key</span>
                <small>{{ t('settingsUi.apiKeyHint') }}</small>
              </label>
              <div class="setting-control">
                <input
                  type="password"
                  v-model="aiStore.config.apiKey"
                  placeholder="sk-..."
                  class="text-input"
                />
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>API Base URL</span>
                <small>{{ t('settingsUi.baseUrlHint') }}</small>
              </label>
              <div class="setting-control">
                <input
                  type="text"
                  v-model="aiStore.config.baseUrl"
                  placeholder="https://api.openai.com/v1"
                  class="text-input"
                />
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.model') }}</span>
                <small>{{ t('settingsUi.modelHint') }}</small>
              </label>
              <div class="setting-control">
                <select v-model="aiStore.config.model" class="select-input">
                  <template v-if="currentProvider.models.length > 0">
                    <option v-for="m in currentProvider.models" :key="m.value" :value="m.value">{{ m.label }}</option>
                  </template>
                  <template v-else>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="deepseek-chat">deepseek-chat</option>
                    <option value="qwen-plus">qwen-plus</option>
                    <option value="glm-4">glm-4</option>
                  </template>
                </select>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.temperature') }}</span>
                <small>{{ t('settingsUi.temperatureHint', { n: aiStore.config.temperature }) }}</small>
              </label>
              <div class="setting-control">
                <input
                  type="range"
                  v-model.number="aiStore.config.temperature"
                  min="0"
                  max="2"
                  step="0.1"
                  class="range-input"
                />
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.maxTokens') }}</span>
                <small>{{ t('settingsUi.maxTokensHint', { n: aiStore.config.maxTokens }) }}</small>
              </label>
              <div class="setting-control">
                <input
                  type="range"
                  v-model.number="aiStore.config.maxTokens"
                  min="256"
                  max="4096"
                  step="256"
                  class="range-input"
                />
              </div>
            </div>

            <div class="setting-item column">
              <label class="setting-label">
                <span>{{ t('settings.systemPrompt') }}</span>
                <small>{{ t('settingsUi.systemPromptHint') }}</small>
              </label>
              <div class="setting-control full-width">
                <textarea
                  v-model="aiStore.config.systemPrompt"
                  rows="6"
                  class="text-input"
                  :placeholder="t('settingsUi.systemPromptPlaceholder')"
                ></textarea>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.testConnection') }}</span>
                <small>{{ t('settingsUi.testConnectionHint') }}</small>
              </label>
              <div class="setting-control">
                <button class="btn-secondary" @click="testAIConnection" :disabled="aiStore.isLoading">
                  {{ aiStore.isLoading ? t('settingsUi.testing') : t('settingsUi.testConnection') }}
                </button>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.clearHistory') }}</span>
                <small>{{ t('settingsUi.clearHistoryHint') }}</small>
              </label>
              <div class="setting-control">
                <button class="btn-danger" @click="aiStore.clearMessages()">
                  {{ t('settingsUi.clearHistory') }}
                </button>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.resetConfig') }}</span>
                <small>{{ t('settingsUi.resetConfigHint') }}</small>
              </label>
              <div class="setting-control">
                <button class="btn-secondary" @click="aiStore.resetConfig()">
                  {{ t('settingsUi.resetDefault') }}
                </button>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            <p>{{ t('settingsUi.enableAIFirst') }}</p>
          </div>
        </div>
        
        <div v-else-if="selectedSection === 'appearance'" class="settings-section">
          <h3>{{ t('settings.categories.appearance') }}</h3>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.language') }}</span>
            </label>
            <div class="setting-control">
              <select v-model="currentLocale" @change="setLocale(currentLocale)" class="select-input">
                <option v-for="locale in localeList" :key="locale.id" :value="locale.id">
                  {{ locale.name }}
                </option>
              </select>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.theme') }}</span>
            </label>
            <div class="setting-control">
              <div class="theme-options">
                <button 
                  v-for="theme in ['dark', 'light', 'system']"
                  :key="theme"
                  class="theme-btn"
                  :class="{ active: settingsStore.settings.theme === theme }"
                  @click="settingsStore.settings.theme = theme"
                >
                  {{ theme === 'dark' ? t('settingsUi.themeDark') : theme === 'light' ? t('settingsUi.themeLight') : t('settingsUi.themeSystem') }}
                </button>
              </div>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.bgAutoTheme') }}</span>
              <span class="setting-desc">{{ t('settingsUi.bgAutoThemeDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.autoThemeByBackground"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.backgroundType') }}</span>
            </label>
            <div class="setting-control">
              <select v-model="settingsStore.settings.backgroundType" class="select-input">
                <option value="solid">{{ t('settings.solid') }}</option>
                <option value="gradient">{{ t('settings.gradient') }}</option>
                <option value="image">{{ t('settings.image') }}</option>
              </select>
            </div>
          </div>
          
          <div v-if="settingsStore.settings.backgroundType === 'solid'" class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.bgColor') }}</span>
            </label>
            <div class="setting-control">
              <input 
                v-model="settingsStore.settings.backgroundColor"
                type="color" 
                class="color-input"
              />
              <span class="color-value">{{ settingsStore.settings.backgroundColor }}</span>
            </div>
          </div>
          
          <div v-if="settingsStore.settings.backgroundType === 'gradient'" class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.gradientPresets') }}</span>
            </label>
            <div class="setting-control">
              <div class="gradient-presets">
                <button 
                  v-for="preset in gradientPresets"
                  :key="preset.value"
                  class="gradient-preset-btn"
                  :style="{ background: preset.value }"
                  :class="{ active: settingsStore.settings.backgroundGradient === preset.value }"
                  @click="settingsStore.settings.backgroundGradient = preset.value"
                >
                  {{ preset.label }}
                </button>
              </div>
            </div>
          </div>
          
          <div v-if="settingsStore.settings.backgroundType === 'image'" class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.backgroundImage') }}</span>
              <span class="setting-desc">{{ t('settings.backgroundImageDesc') }}</span>
            </label>
            <div class="setting-control">
              <input 
                :value="settingsStore.settings.backgroundImage"
                type="text" 
                readonly
                class="path-input"
                :placeholder="t('settings.noImageSelected')"
              />
              <button class="browse-btn" @click="selectBackgroundImage">{{ t('settings.browse') }}</button>
            </div>
          </div>
          


          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settingsUi.glassEffect') }}</span>
              <span class="setting-desc">{{ t('settingsUi.glassEffectDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  v-model="settingsStore.settings.glassEffect"
                  type="checkbox"
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.accentColor') }}</span>
              <span class="setting-desc">{{ t('settingsUi.accentColorDesc') }}</span>
            </label>
            <div class="setting-control">
              <input 
                v-model="settingsStore.settings.accentColor"
                type="color" 
                class="color-input"
              />
              <span class="color-value">{{ settingsStore.settings.accentColor }}</span>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.fontSize') }}</span>
            </label>
            <div class="setting-control">
              <div class="font-size-options">
                <button 
                  v-for="size in ['small', 'medium', 'large']"
                  :key="size"
                  class="font-size-btn"
                  :class="{ active: settingsStore.settings.fontSize === size }"
                  @click="settingsStore.settings.fontSize = size"
                >
                  {{ size === 'small' ? t('settingsUi.fontSmall') : size === 'medium' ? t('settingsUi.fontMedium') : t('settingsUi.fontLarge') }}
                </button>
              </div>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settingsUi.dockMode') }}</span>
              <span class="setting-desc">{{ t('settingsUi.dockModeDesc') }}</span>
            </label>
            <div class="setting-control">
              <select v-model="settingsStore.settings.sidebarStyle" class="select-input">
                <option value="default">{{ t('settingsUi.dockFixed') }}</option>
                <option value="auto">{{ t('settingsUi.dockAuto') }}</option>
                <option value="compact">{{ t('settingsUi.dockCompact') }}</option>
                <option value="icon-only">{{ t('settingsUi.dockIconOnly') }}</option>
              </select>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.sidebarPosition') }}</span>
              <span class="setting-desc">{{ t('settingsUi.sidebarPositionDesc') }}</span>
            </label>
            <div class="setting-control">
              <div class="sidebar-position-options">
                <button 
                  v-for="pos in [
                    { id: 'left', label: t('settingsUi.posLeft'), icon: '◀' },
                    { id: 'right', label: t('settingsUi.posRight'), icon: '▶' },
                    { id: 'top', label: t('settingsUi.posTop'), icon: '▲' },
                    { id: 'bottom', label: t('settingsUi.posBottom'), icon: '▼' }
                  ]"
                  :key="pos.id"
                  class="position-btn"
                  :class="{ active: settingsStore.settings.sidebarPosition === pos.id }"
                  @click="settingsStore.settings.sidebarPosition = pos.id as any"
                  :title="pos.label"
                >
                  <span class="position-icon">{{ pos.icon }}</span>
                  <span class="position-label">{{ pos.label }}</span>
                </button>
              </div>
            </div>
          </div>
          


          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.animEffect') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.animations"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.particleEffect') }}</span>
              <span class="setting-desc">{{ t('settingsUi.particleEffectDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.particleEffects"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.windowRadius') }}</span>
              <span class="setting-desc">{{ t('settingsUi.windowRadiusDesc') }}</span>
            </label>
            <div class="setting-control">
              <input 
                v-model.number="settingsStore.settings.cornerRadius"
                type="range" 
                min="0" 
                max="20" 
                class="range-input"
              />
              <span class="range-value">{{ settingsStore.settings.cornerRadius }}px</span>
            </div>
          </div>
        </div>
        
        <div v-else-if="selectedSection === 'advanced'" class="settings-section">
          <h3>{{ t('settingsUi.advanced') }}</h3>
          <p class="section-desc advanced-warning">{{ t('settingsUi.advancedWarning') }}</p>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settingsUi.javaDownloadPath') }}</span>
              <span class="setting-desc">{{ t('settingsUi.javaDownloadPathDesc') }}</span>
            </label>
            <div class="setting-control">
              <input 
                v-model="settingsStore.settings.javaDownloadPath"
                type="text" 
                class="path-input"
                :placeholder="t('settingsUi.placeholderDefaultPath')"
              />
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.downloadPath') }}</span>
              <span class="setting-desc">{{ t('settingsUi.gameDownloadPathDesc') }}</span>
            </label>
            <div class="setting-control">
              <input 
                v-model="settingsStore.settings.gameDownloadPath"
                type="text" 
                class="path-input"
                :placeholder="t('settingsUi.placeholderDefaultPath')"
              />
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.maxDownloadSpeed') }}</span>
              <span class="setting-desc">{{ t('settingsUi.maxDownloadSpeedDesc') }}</span>
            </label>
            <div class="setting-control">
              <input 
                v-model.number="settingsStore.settings.maxDownloadSpeed"
                type="range" 
                min="0" 
                max="100" 
                class="range-input"
              />
              <span class="range-value">{{ settingsStore.settings.maxDownloadSpeed === 0 ? t('settingsUi.unlimited') : settingsStore.settings.maxDownloadSpeed + ' MB/s' }}</span>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.downloadThreads') }}</span>
              <span class="setting-desc">{{ t('settingsUi.downloadThreadsDesc') }}</span>
            </label>
            <div class="setting-control">
              <input 
                v-model.number="settingsStore.settings.downloadThreads"
                type="range" 
                min="8" 
                max="128" 
                step="8"
                class="range-input"
              />
              <span class="range-value">{{ settingsStore.settings.downloadThreads }}</span>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.downloadSource') }}</span>
              <span class="setting-desc">{{ t('settingsUi.downloadSourceDesc') }}</span>
            </label>
            <div class="setting-control">
              <select v-model="settingsStore.settings.downloadSource" class="select-input">
                <option value="mirror">{{ t('settings.downloadSourceMirror') }}</option>
                <option value="official">{{ t('settings.downloadSourceOfficial') }}</option>
                <option value="auto">{{ t('settings.downloadSourceAuto') }}</option>
              </select>
            </div>
          </div>

          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.modrinthMirror') }}</span>
              <span class="setting-desc">{{ t('settingsUi.modrinthMirrorDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  v-model="settingsStore.settings.modrinthMirror"
                  type="checkbox"
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <!-- 下载代理（HTTP / SOCKS5） -->
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.downloadProxy') }}</span>
              <span class="setting-desc">{{ t('settingsUi.downloadProxyDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input
                  v-model="settingsStore.settings.proxyEnabled"
                  type="checkbox"
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <template v-if="settingsStore.settings.proxyEnabled">
            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.proxyAddress') }}</span>
                <span class="setting-desc">{{ t('settingsUi.proxyAddressDesc') }}</span>
              </label>
              <div class="setting-control proxy-controls">
                <select v-model="settingsStore.settings.proxyType" class="select-input proxy-type">
                  <option value="http">HTTP</option>
                  <option value="socks5">SOCKS5</option>
                </select>
                <input
                  v-model="settingsStore.settings.proxyHost"
                  class="text-input proxy-host"
                  :placeholder="t('settingsUi.proxyHostPlaceholder')"
                />
                <span class="proxy-colon">:</span>
                <input
                  v-model.number="settingsStore.settings.proxyPort"
                  class="text-input proxy-port"
                  type="number"
                  min="1"
                  max="65535"
                  placeholder="7890"
                />
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.proxyAuth') }}</span>
                <span class="setting-desc">{{ t('settingsUi.proxyAuthDesc') }}</span>
              </label>
              <div class="setting-control proxy-controls">
                <input
                  v-model="settingsStore.settings.proxyUsername"
                  class="text-input proxy-user"
                  :placeholder="t('settingsUi.proxyUserPlaceholder')"
                />
                <input
                  v-model="settingsStore.settings.proxyPassword"
                  class="text-input proxy-pass"
                  type="password"
                  :placeholder="t('settingsUi.proxyPassPlaceholder')"
                />
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.proxyTest') }}</span>
                <span class="setting-desc">{{ t('settingsUi.proxyTestDesc') }}</span>
              </label>
              <div class="setting-control proxy-controls">
                <button class="btn-secondary" :disabled="proxyTesting" @click="testProxyConfig">
                  {{ proxyTesting ? t('settingsUi.proxyTesting') : t('settings.proxyTest') }}
                </button>
                <span
                  v-if="proxyTestResult"
                  class="proxy-test-result"
                  :class="{ ok: proxyTestResult.ok, fail: !proxyTestResult.ok }"
                >{{ proxyTestResult.text }}</span>
              </div>
            </div>

            <div class="setting-item">
              <label class="setting-label">
                <span>{{ t('settings.proxyForGame') }}</span>
                <span class="setting-desc">{{ t('settingsUi.proxyForGameDesc') }}</span>
              </label>
              <div class="setting-control">
                <label class="toggle-switch">
                  <input
                    v-model="settingsStore.settings.proxyForGame"
                    type="checkbox"
                  />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            <p class="proxy-notice">{{ t('settingsUi.proxyNotice') }}</p>
          </template>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.autoInstallMods') }}</span>
              <span class="setting-desc">{{ t('settingsUi.autoInstallModsDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.autoInstallMods"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.onlineSearchMods') }}</span>
              <span class="setting-desc">{{ t('settingsUi.onlineSearchModsDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.internetSearch"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.backupBeforeUpdate') }}</span>
              <span class="setting-desc">{{ t('settingsUi.backupBeforeUpdateDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.backupBeforeUpdate"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.maxBackups') }}</span>
              <span class="setting-desc">{{ t('settingsUi.maxBackupsDesc') }}</span>
            </label>
            <div class="setting-control">
              <input 
                v-model.number="settingsStore.settings.maxBackups"
                type="range" 
                min="1" 
                max="20" 
                class="range-input"
              />
              <span class="range-value">{{ t('settingsUi.countItems', { n: settingsStore.settings.maxBackups }) }}</span>
            </div>
          </div>
          
          <div class="advanced-divider"></div>
          <h4>{{ t('settingsUi.gameCoreSettings') }}</h4>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.gcType') }}</span>
              <span class="setting-desc">{{ t('settingsUi.gcTypeDesc') }}</span>
            </label>
            <div class="setting-control">
              <select v-model="settingsStore.settings.gcType" class="select-input">
                <option value="G1GC">{{ t('settingsUi.gcG1') }}</option>
                <option value="ZGC">{{ t('settingsUi.gcZGC') }}</option>
                <option value="Shenandoah">{{ t('settingsUi.gcShenandoah') }}</option>
              </select>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settingsUi.fpsLimit') }}</span>
              <span class="setting-desc">{{ t('settingsUi.fpsLimitDesc') }}</span>
            </label>
            <div class="setting-control">
              <input 
                v-model.number="settingsStore.settings.fpsLimit"
                type="range" 
                min="0" 
                max="144" 
                step="15"
                class="range-input"
              />
              <span class="range-value">{{ settingsStore.settings.fpsLimit === 0 ? t('settingsUi.unlimited') : settingsStore.settings.fpsLimit + ' FPS' }}</span>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.customJavaArgs') }}</span>
              <span class="setting-desc">{{ t('settingsUi.customJavaArgsDesc') }}</span>
            </label>
            <div class="setting-control">
              <textarea 
                v-model="settingsStore.settings.customJavaArgs"
                class="textarea-input"
                rows="3"
                placeholder="-XX:+UseStringDeduplication ..."
              ></textarea>
            </div>
          </div>
          
          <div class="advanced-divider"></div>
          <h4>{{ t('settingsUi.logsAndDebug') }}</h4>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.enableGameLog') }}</span>
              <span class="setting-desc">{{ t('settingsUi.enableGameLogDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.enableGameLog"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.logLevel') }}</span>
              <span class="setting-desc">{{ t('settingsUi.logLevelDesc') }}</span>
            </label>
            <div class="setting-control">
              <select v-model="settingsStore.settings.logLevel" class="select-input">
                <option value="all">{{ t('settingsUi.logAll') }}</option>
                <option value="info">{{ t('settingsUi.logInfo') }}</option>
                <option value="warning">{{ t('settingsUi.logWarning') }}</option>
                <option value="error">{{ t('settingsUi.logError') }}</option>
              </select>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.quickEdit') }}</span>
              <span class="setting-desc">{{ t('settingsUi.quickEditDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.quickEdit"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.devMode') }}</span>
              <span class="setting-desc">{{ t('settingsUi.devModeDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.developerMode"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.experimental') }}</span>
              <span class="setting-desc">{{ t('settingsUi.experimentalDesc') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.experimentalFeatures"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="advanced-divider"></div>
          <h4>{{ t('settingsUi.launcherSection') }}</h4>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.anonymousData') }}</span>
              <span class="setting-desc">{{ t('settingsUi.anonymousDataDesc1') }}<strong>{{ t('settingsUi.anonymousDataDescBold') }}</strong>{{ t('settingsUi.anonymousDataDesc2') }}</span>
            </label>
            <div class="setting-control">
              <label class="toggle-switch">
                <input 
                  v-model="settingsStore.settings.enableTelemetry"
                  type="checkbox" 
                />
                <span class="slider"></span>
              </label>
            </div>
          </div>
          
          <div class="advanced-divider"></div>
          <h4 class="emergency-title">{{ t('settingsUi.emergency') }}</h4>
          
          <div class="setting-item">
            <label class="setting-label">
              <span>{{ t('settings.forceResetDownload') }}</span>
              <span class="setting-desc">{{ t('settingsUi.forceResetDesc') }}</span>
            </label>
            <div class="setting-control">
              <button 
                class="emergency-btn" 
                @click="handleForceResetDownloads"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                {{ t('settingsUi.resetAllDownloads') }}
              </button>
            </div>
          </div>
        </div>

        <div v-else-if="selectedSection === 'credits'" class="settings-section">
          <h3>{{ t('settingsUi.creditsTitle') }}</h3>
          <p class="section-desc">{{ t('settingsUi.creditsDesc') }}</p>

          <div class="credits-list-section">
            <h4 class="credits-category-title">{{ t('settingsUi.openSource') }}</h4>
            <div class="credits-list">
              <div 
                v-for="item in credits.openSource" 
                :key="item.name" 
                class="credit-list-item"
                @click="openCreditsUrl(item.url)"
              >
                <div class="credit-item-info">
                  <span class="credit-item-name">{{ item.name }}</span>
                  <span class="credit-item-desc">{{ item.desc }}</span>
                </div>
                <svg class="credit-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </div>
          </div>

          <div class="credits-list-section">
            <h4 class="credits-category-title">{{ t('settingsUi.toolsAndServices') }}</h4>
            <div class="credits-list">
              <div 
                v-for="item in credits.tools" 
                :key="item.name" 
                class="credit-list-item"
                @click="openCreditsUrl(item.url)"
              >
                <div class="credit-item-info">
                  <span class="credit-item-name">{{ item.name }}</span>
                  <span class="credit-item-desc">{{ item.desc }}</span>
                </div>
                <svg class="credit-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </div>
          </div>

          <div class="credits-list-section special">
            <h4 class="credits-category-title special-title">{{ t('settingsUi.specialThanks') }}</h4>
            <div class="credits-list special-list">
              <div 
                v-for="item in credits.special" 
                :key="item.name" 
                class="credit-list-item special-item"
                :class="{ clickable: item.url }"
                @click="item.url && openCreditsUrl(item.url)"
              >
                <div class="credit-item-info">
                  <span class="credit-item-name">{{ item.name }}</span>
                  <span class="credit-item-desc">{{ item.desc }}</span>
                </div>
                <svg v-if="item.url" class="credit-item-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <LegalDialog :type="legalDialogType" @close="legalDialogType = null" />

  <!-- 添加游戏目录弹窗 -->
  <div v-if="showAddDirModal" class="modal-overlay" @click.self="closeAddDirModal">
    <div class="modal">
      <div class="modal-header">
        <h3>{{ t('settingsUi.addGameDir') }}</h3>
        <button class="close-btn" @click="closeAddDirModal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>{{ t('settingsUi.dirNameLabel') }}</label>
          <input
            v-model="newDirName"
            type="text"
            :placeholder="t('settingsUi.dirNamePlaceholder')"
            maxlength="32"
          />
        </div>
        <div class="form-group">
          <label>{{ t('settingsUi.dirPathLabel') }}</label>
          <div class="path-picker">
            <input
              v-model="newDirPath"
              type="text"
              readonly
              :placeholder="t('settingsUi.selectFolderPlaceholder')"
            />
            <button class="browse-btn" @click="browseNewDirPath">{{ t('settingsUi.browseEllipsis') }}</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="cancel-btn" @click="closeAddDirModal">{{ t('settingsUi.cancel') }}</button>
        <button class="confirm-btn" @click="addNewDir" :disabled="!newDirName.trim() || !newDirPath.trim()">
          {{ t('settingsUi.add') }}
        </button>
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
.settings-panel-wrapper {
  width: 100%;
  height: 100%;
}

.settings-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.panel-header h2 {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.apply-btn {
  padding: 10px 20px;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--border-radius-sm);
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.apply-btn:hover {
  background: var(--accent-secondary);
  box-shadow: var(--shadow-glow);
}

.settings-container {
  flex: 1;
  display: flex;
  gap: 20px;
  overflow: hidden;
}

.settings-sidebar {
  width: 160px;
  flex-shrink: 0;
}

.sidebar-item {
  position: relative;
  display: block;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast);
  margin-bottom: 4px;
  overflow: hidden;
}

.sidebar-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 0;
  background: var(--accent-primary);
  border-radius: 0 3px 3px 0;
  transform: translateY(-50%);
  transition: height 0.18s ease;
}

.sidebar-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-item.active {
  background: var(--accent-soft);
  color: var(--accent-primary);
  font-weight: 500;
}

.sidebar-item.active::before {
  height: 18px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
}

.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--border-radius);
  padding: 24px;
}

.settings-section h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 24px;
}

.setting-item {
  margin-bottom: 24px;
}

.setting-item:last-child {
  margin-bottom: 0;
}

.setting-label {
  display: block;
  margin-bottom: 8px;
}

.setting-label span:first-child {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-desc {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ===== 下载代理（HTTP / SOCKS5） ===== */
.proxy-controls {
  flex-wrap: wrap;
}

.proxy-controls .text-input {
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.proxy-controls .text-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.proxy-type {
  width: 108px;
  flex: 0 0 auto;
}

.proxy-host {
  flex: 1 1 140px;
  min-width: 120px;
}

.proxy-colon {
  color: var(--text-muted);
  font-size: 13px;
}

.proxy-port {
  width: 92px;
  flex: 0 0 auto;
}

.proxy-user,
.proxy-pass {
  flex: 1 1 120px;
  min-width: 100px;
}

.proxy-test-result {
  font-size: 12px;
  line-height: 1.5;
}

.proxy-test-result.ok {
  color: #4ade80;
}

.proxy-test-result.fail {
  color: #f87171;
}

.proxy-notice {
  margin: 4px 0 24px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border-left: 3px solid var(--accent-primary);
  border-radius: var(--border-radius-sm);
}

.path-input {
  flex: 1;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.path-input:focus,
.select-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.browse-btn {
  padding: 10px 16px;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--border-radius-sm);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.browse-btn:hover {
  background: var(--accent-secondary);
}

.range-input {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--bg-secondary);
  border-radius: 3px;
  cursor: pointer;
}

.range-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: var(--accent-primary);
  border-radius: 50%;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.range-input::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: var(--shadow-glow);
}

.range-value {
  min-width: 60px;
  text-align: right;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 内存分配卡片 */
.memory-allocation-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: 20px;
  margin-bottom: 8px;
}

.memory-card-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 20px 0;
}

.system-memory-section {
  background: var(--bg-primary);
  border-radius: var(--border-radius-md);
  padding: 16px;
  margin-bottom: 16px;
}

.memory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.memory-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.memory-total {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.memory-progress-bar {
  width: 100%;
  height: 10px;
  background: var(--bg-hover);
  border-radius: 5px;
  overflow: hidden;
  margin-bottom: 10px;
}

.memory-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), #4a9eff);
  border-radius: 5px;
  transition: width 0.3s ease;
}

.memory-subtext {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-tertiary);
}

.memory-mode-select {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: var(--border-radius-sm);
  transition: all var(--transition-fast);
}

.radio-option input {
  display: none;
}

.radio-custom {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  position: relative;
  transition: all var(--transition-fast);
}

.radio-option.active .radio-custom {
  border-color: var(--accent-primary);
}

.radio-option.active .radio-custom::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  background: var(--accent-primary);
  border-radius: 50%;
}

.radio-label {
  font-size: 14px;
  color: var(--text-secondary);
  transition: color var(--transition-fast);
}

.radio-option.active .radio-label {
  color: var(--text-primary);
}

.auto-memory-display {
  background: var(--bg-primary);
  border-radius: var(--border-radius-md);
  padding: 14px 16px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.auto-memory-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.auto-memory-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent-primary);
}

.auto-memory-hint {
  font-size: 13px;
  color: var(--text-tertiary);
}

.custom-memory-slider {
  background: var(--bg-primary);
  border-radius: var(--border-radius-md);
  padding: 14px 16px;
  margin-bottom: 16px;
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.slider-header span:first-child {
  font-size: 14px;
  color: var(--text-secondary);
}

.slider-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.game-memory-summary {
  background: var(--bg-primary);
  border-radius: var(--border-radius-md);
  padding: 16px;
  display: flex;
  justify-content: space-between;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-label {
  font-size: 13px;
  color: var(--text-tertiary);
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent-primary);
}

.summary-value.remaining {
  color: var(--text-secondary);
}

.select-input {
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.textarea-input {
  width: 100%;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  resize: vertical;
}

.textarea-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--border-color);
  border-radius: 13px;
  transition: all var(--transition-fast);
}

.slider:before {
  position: absolute;
  content: '';
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.toggle-switch input:focus-visible + .slider {
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.toggle-switch input:checked + .slider {
  background: var(--accent-primary);
}

.toggle-switch input:checked + .slider:before {
  transform: translateX(22px);
}

.theme-options {
  display: flex;
  gap: 8px;
}

.theme-btn {
  padding: 8px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.theme-btn:hover {
  background: var(--bg-hover);
}

.theme-btn.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

/* Java 下载样式 */
.java-download-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

.java-download-section h4 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.section-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.java-versions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.java-version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--bg-card);
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
}

.java-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.java-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.recommend-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: linear-gradient(135deg, #4CAF50, #8BC34A);
  color: white;
  border-radius: 4px;
  font-weight: 600;
}

.cancel-text {
  font-size: 11px;
  opacity: 0.8;
  margin-left: 4px;
}

.java-size {
  font-size: 12px;
  color: var(--text-muted);
}

.java-name.discouraged {
  color: var(--text-secondary);
}

.discouraged-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
  border-radius: 4px;
  font-weight: 600;
}

.java-warning {
  font-size: 11px;
  color: #e74c3c;
  margin-top: 2px;
}

.download-btn {
  padding: 8px 20px;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--border-radius-sm);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-btn:hover:not(:disabled) {
  background: var(--accent-secondary);
  transform: translateY(-1px);
}

.download-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.download-btn.downloading {
  background: var(--text-muted);
}

.download-btn.installed {
  background: var(--success);
}

.spinner {
  width: 14px;
  height: 14px;
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

.installed-java-section {
  margin-top: 24px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--border-radius);
}

.installed-java-section h5 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.installed-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.installed-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--bg-card);
  border-radius: var(--border-radius-sm);
}

.installed-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.delete-btn {
  padding: 6px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.delete-btn:hover {
  background: var(--error);
  border-color: var(--error);
  color: white;
}

.delete-btn svg {
  width: 16px;
  height: 16px;
}

.installed-version {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.installed-path {
  font-size: 11px;
  color: var(--text-muted);
  word-break: break-all;
}

/* 颜色选择器 */
.color-input {
  width: 50px;
  height: 36px;
  border: none;
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  background: transparent;
}

.color-value {
  font-size: 13px;
  color: var(--text-secondary);
  font-family: monospace;
}

/* 渐变预设 */
.gradient-presets {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.gradient-preset-btn {
  padding: 20px 8px;
  border: 2px solid transparent;
  border-radius: var(--border-radius-sm);
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.gradient-preset-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.gradient-preset-btn.active {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary);
}

/* 字体大小选项 */
.font-size-options {
  display: flex;
  gap: 8px;
}

.font-size-btn {
  padding: 8px 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.font-size-btn:hover {
  background: var(--bg-hover);
}

.font-size-btn.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

/* 侧边栏位置选项 */
.sidebar-position-options {
  display: flex;
  gap: 8px;
}

.position-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  min-width: 56px;
}

.position-icon {
  font-size: 16px;
  line-height: 1;
}

.position-label {
  font-size: 11px;
}

.position-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.position-btn.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

/* 高级设置样式 */
.advanced-warning {
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: var(--border-radius-sm);
  padding: 12px 16px;
  color: #ffc107;
  margin-bottom: 24px;
}

.advanced-divider {
  height: 1px;
  background: var(--border-color);
  margin: 24px 0;
}

.settings-section h4 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 20px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border-color);
}

.update-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}

.update-text {
  font-size: 14px;
  color: var(--text-secondary);
}

.update-text.error {
  color: var(--error);
}

.legal-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.legal-link-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.legal-link-btn:hover {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
  background: var(--bg-secondary);
}

.legal-link-btn svg {
  width: 16px;
  height: 16px;
}

.developer-card,
.about-launcher-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  margin-bottom: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.developer-avatar,
.launcher-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.launcher-icon {
  border-radius: 14px;
}

.avatar-text,
.launcher-icon-text {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
}

.launcher-icon-text {
  font-size: 18px;
}

.developer-info,
.launcher-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.developer-name,
.launcher-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
}

.developer-desc,
.launcher-version {
  font-size: 13px;
  color: var(--text-secondary);
}

.launcher-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.progress-bar {
  width: 200px;
  height: 8px;
  background: var(--bg-hover);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
  transition: width 0.3s ease;
}

.update-available,
.update-downloaded {
  display: flex;
  align-items: center;
  gap: 12px;
}

.emergency-title {
  color: #ff6b6b !important;
}

.emergency-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
  border: none;
  border-radius: var(--border-radius-sm);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 2px 8px rgba(255, 107, 107, 0.3);
}

.emergency-btn:hover {
  background: linear-gradient(135deg, #ff5252, #e04848);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
}

.emergency-btn:active {
  transform: translateY(0);
}

.emergency-btn svg {
  width: 18px;
  height: 18px;
}

.game-dirs-section .game-dirs-control {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.game-dirs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
}

.game-dir-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.game-dir-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.12);
}

.game-dir-item.active {
  border-color: var(--accent-primary);
  background: rgba(0, 212, 255, 0.08);
}

.game-dir-item .dir-info {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.game-dir-item .dir-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.game-dir-item .default-badge {
  background: rgba(0, 212, 255, 0.2);
  color: var(--accent-primary);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.game-dir-item .dir-path {
  font-size: 12px;
  color: #888;
  font-family: 'Cascadia Mono', Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dir-actions {
  display: flex;
  gap: 6px;
  margin-left: 12px;
}

.dir-action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #ccc;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dir-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.dir-action-btn.delete:hover {
  background: rgba(255, 82, 82, 0.2);
  border-color: rgba(255, 82, 82, 0.4);
  color: #ff6b6b;
}

.dir-action-btn svg {
  width: 16px;
  height: 16px;
}

.add-dir-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: rgba(0, 212, 255, 0.1);
  border: 1px dashed rgba(0, 212, 255, 0.4);
  border-radius: 10px;
  color: var(--accent-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-dir-btn:hover {
  background: rgba(0, 212, 255, 0.18);
  border-color: rgba(0, 212, 255, 0.6);
}

.add-dir-btn svg {
  width: 18px;
  height: 18px;
}

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
  backdrop-filter: blur(4px);
}

.modal {
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 480px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.close-btn svg {
  width: 18px;
  height: 18px;
}

.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #ccc;
  margin-bottom: 8px;
}

.form-group input[type="text"] {
  width: 100%;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.form-group input[type="text"]:focus {
  border-color: var(--accent-primary);
  background: rgba(0, 212, 255, 0.05);
}

.path-picker {
  display: flex;
  gap: 8px;
}

.path-picker input {
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.cancel-btn {
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #ccc;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.confirm-btn {
  padding: 10px 24px;
  background: var(--accent-primary);
  border: none;
  border-radius: 8px;
  color: #000;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 8px 16px;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--accent-glow);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  padding: 8px 16px;
  background: rgba(244, 67, 54, 0.15);
  border: 1px solid rgba(244, 67, 54, 0.3);
  border-radius: 8px;
  color: #f44336;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-danger:hover {
  background: rgba(244, 67, 54, 0.25);
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-muted);
}

.ai-config-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-provider-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12));
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  margin: 4px 0 8px;
}

.ai-provider-card .provider-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-provider-card .provider-name {
  font-weight: 600;
  font-size: 14px;
  color: #fff;
}

.ai-provider-card .provider-free {
  font-size: 12px;
  color: #a5b4fc;
}

.ai-provider-card .provider-note {
  font-size: 11px;
  color: #fbbf24;
  margin-top: 2px;
}

.btn-primary-sm {
  padding: 8px 16px;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.btn-primary-sm:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.btn-primary-sm:active {
  transform: translateY(0);
}

.setting-item.column {
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.setting-item.column .setting-control.full-width {
  width: 100%;
}

/* 鸣谢页面 - 列表样式 */
.credits-list-section {
  margin-bottom: 24px;
}

.credits-category-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0 0 10px 0;
  padding: 0 4px;
}

.credits-list {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  overflow: hidden;
}

.credit-list-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  border-bottom: 1px solid var(--border-color);
}

.credit-list-item:last-child {
  border-bottom: none;
}

.credit-list-item:hover {
  background: var(--bg-tertiary);
}

.credit-item-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.credit-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.credit-item-desc {
  font-size: 11.5px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.credit-item-arrow {
  width: 16px;
  height: 16px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  margin-left: 8px;
}

.credits-list-section.special {
  margin-top: 8px;
}

.special-title {
  color: var(--accent-primary) !important;
  font-weight: 600 !important;
}

.special-item {
  background: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
  border-left: 3px solid var(--accent-primary);
  padding-left: 14px;
}

@supports not (background: color-mix(in srgb, red, blue)) {
  .special-item {
    background: rgba(80, 140, 255, 0.08);
  }
}

.special-item:not(.clickable) {
  cursor: default;
}

.special-item.clickable:hover {
  background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
}

@supports not (background: color-mix(in srgb, red, blue)) {
  .special-item.clickable:hover {
    background: rgba(80, 140, 255, 0.15);
  }
}
</style>

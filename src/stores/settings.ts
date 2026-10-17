import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { useVersionsStore } from './versions'
import { i18n } from '../locales'

export interface GameDirEntry {
  id: string
  name: string
  path: string
  isDefault?: boolean
}

export interface Settings {
  gameDirectory: string
  javaPath: string
  maxMemory: number
  minMemory: number
  autoMemory: boolean
  windowMode: 'windowed' | 'fullscreen' | 'borderless'
  jvmArgs: string
  showLogs: boolean
  autoUpdate: boolean
  keepGameOpen: boolean
  theme: 'dark' | 'light' | 'system'
  animations: boolean
  cornerRadius: number
  backgroundType: 'solid' | 'gradient' | 'image'
  backgroundColor: string
  backgroundGradient: string
  backgroundImage: string
  backgroundBlur: number
  backgroundOpacity: number
  fontSize: 'small' | 'medium' | 'large'
  sidebarStyle: 'default' | 'compact' | 'icon-only' | 'auto'
  sidebarPosition: 'left' | 'right' | 'top' | 'bottom'
  accentColor: string
  glassEffect: boolean
  particleEffects: boolean
  javaDownloadPath: string
  gameDownloadPath: string
  maxDownloadSpeed: number
  downloadSource: 'auto' | 'official' | 'mirror'
  downloadThreads: number
  modrinthMirror: boolean
  // 下载代理（HTTP / SOCKS5）：节点地址与账号由用户自行提供
  proxyEnabled: boolean
  proxyType: 'http' | 'socks5'
  proxyHost: string
  proxyPort: number
  proxyUsername: string
  proxyPassword: string
  proxyForGame: boolean
  autoInstallMods: boolean
  backupBeforeUpdate: boolean
  internetSearch: boolean
  maxBackups: number
  customJavaArgs: string
  gcType: 'G1GC' | 'ZGC' | 'Shenandoah'
  fpsLimit: number
  fullscreenResolution: string
  skipJavaCheck: boolean
  autoDownloadJava: boolean
  enableGameLog: boolean
  logLevel: 'all' | 'info' | 'warning' | 'error'
  showGameOverlay: boolean
  quickEdit: boolean
  developerMode: boolean
  experimentalFeatures: boolean
  autoThemeByBackground: boolean
  enableTelemetry: boolean
}

const SPONSOR_CHECKPOINTS = [5, 10, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 250, 300, 400, 500]

const DEFAULT_GAME_DIR_ID = '__default__'

export const useSettingsStore = defineStore('settings', () => {
  const gameLaunchCount = ref(0)
  const nextSponsorCheckpointIndex = ref(0)
  const hasSupportedSponsor = ref(false)
  const sponsorLink = 'https://afdian.com/'

  const gameDirs = ref<GameDirEntry[]>([])
  const currentGameDirId = ref<string>(DEFAULT_GAME_DIR_ID)

  const currentGameDir = computed(() => {
    return gameDirs.value.find(d => d.id === currentGameDirId.value) || gameDirs.value[0] || null
  })

  const loadGameDirs = () => {
    try {
      const saved = localStorage.getItem('zncl-game-dirs')
      if (saved) {
        gameDirs.value = JSON.parse(saved)
      }
      const savedCurrent = localStorage.getItem('zncl-current-game-dir-id')
      if (savedCurrent) {
        currentGameDirId.value = savedCurrent
      }
    } catch (e) {
      console.error('加载游戏目录列表失败:', e)
    }
  }

  const saveGameDirs = () => {
    try {
      localStorage.setItem('zncl-game-dirs', JSON.stringify(gameDirs.value))
      localStorage.setItem('zncl-current-game-dir-id', currentGameDirId.value)
    } catch (e) {
      console.error('保存游戏目录列表失败:', e)
    }
  }

  const addGameDir = (name: string, path: string): GameDirEntry | null => {
    const trimmedName = name.trim()
    const trimmedPath = path.trim()
    if (!trimmedName || !trimmedPath) return null
    const entry: GameDirEntry = {
      id: `gamedir_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: trimmedName,
      path: trimmedPath
    }
    gameDirs.value.push(entry)
    saveGameDirs()
    return entry
  }

  const removeGameDir = (id: string) => {
    if (id === DEFAULT_GAME_DIR_ID) return
    const idx = gameDirs.value.findIndex(d => d.id === id)
    if (idx !== -1) {
      gameDirs.value.splice(idx, 1)
      if (currentGameDirId.value === id) {
        currentGameDirId.value = DEFAULT_GAME_DIR_ID
      }
      saveGameDirs()
    }
  }

  const updateGameDir = (id: string, updates: Partial<GameDirEntry>) => {
    const entry = gameDirs.value.find(d => d.id === id)
    if (entry) {
      Object.assign(entry, updates)
      saveGameDirs()
    }
  }

  const selectGameDir = async (id: string) => {
    console.log(`[Settings] ========== 切换游戏目录开始: ${id} ==========`)
    currentGameDirId.value = id
    saveGameDirs()

    const dir = currentGameDir.value
    console.log(`[Settings] 当前目录信息:`, JSON.stringify(dir))
    
    if (dir && window.electronAPI?.setGameDir) {
      const setDirResult = await window.electronAPI.setGameDir(dir.isDefault ? '' : dir.path)
      console.log(`[Settings] 主进程目录设置结果:`, JSON.stringify(setDirResult))
    }

    const versionsStore = useVersionsStore()
    console.log(`[Settings] 开始重置并扫描新版本...`)
    await versionsStore.scanInstalledVersions(true)
    await versionsStore.verifyInstalledVersions()
    versionsStore.saveToLocalStorageNow()
    console.log(`[Settings] ========== 目录切换完成，已安装版本数: ${versionsStore.installedVersions.length} ==========`)
  }

  const initDefaultGameDir = (defaultPath: string) => {
    const existing = gameDirs.value.find(d => d.id === DEFAULT_GAME_DIR_ID)
    if (!existing) {
      gameDirs.value.unshift({
        id: DEFAULT_GAME_DIR_ID,
        name: i18n.global.t('rt.stSettings.defaultDir'),
        path: defaultPath,
        isDefault: true
      })
    } else {
      existing.path = defaultPath
      existing.isDefault = true
    }
    saveGameDirs()
  }

  const getNextCheckpoint = (): number | null => {
    if (hasSupportedSponsor.value) return null
    const checkpoints = SPONSOR_CHECKPOINTS
    while (nextSponsorCheckpointIndex.value < checkpoints.length) {
      const checkpoint = checkpoints[nextSponsorCheckpointIndex.value]
      if (gameLaunchCount.value < checkpoint) {
        return checkpoint
      }
      nextSponsorCheckpointIndex.value++
    }
    return null
  }

  const incrementLaunchCount = (): boolean => {
    gameLaunchCount.value++
    saveStats()
    const nextCheckpoint = getNextCheckpoint()
    if (nextCheckpoint !== null && gameLaunchCount.value >= nextCheckpoint) {
      nextSponsorCheckpointIndex.value++
      saveStats()
      return true
    }
    return false
  }

  const markAsSupported = () => {
    hasSupportedSponsor.value = true
    saveStats()
  }

  const saveStats = () => {
    try {
      localStorage.setItem('zncl-stats', JSON.stringify({
        gameLaunchCount: gameLaunchCount.value,
        nextSponsorCheckpointIndex: nextSponsorCheckpointIndex.value,
        hasSupportedSponsor: hasSupportedSponsor.value
      }))
    } catch (error) {
      console.error('保存统计数据失败:', error)
    }
  }

  const loadStats = () => {
    try {
      const saved = localStorage.getItem('zncl-stats')
      if (saved) {
        const parsed = JSON.parse(saved)
        gameLaunchCount.value = parsed.gameLaunchCount || 0
        nextSponsorCheckpointIndex.value = parsed.nextSponsorCheckpointIndex || 0
        hasSupportedSponsor.value = parsed.hasSupportedSponsor || false
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
    }
  }

  loadStats()
  loadGameDirs()

  const settings = ref<Settings>({
    gameDirectory: '',
    javaPath: '',
    maxMemory: 4,
    minMemory: 2,
    autoMemory: true,
    windowMode: 'windowed',
    jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M',
    showLogs: true,
    autoUpdate: true,
    keepGameOpen: false,
    theme: 'dark',
    animations: true,
    cornerRadius: 16,
    backgroundType: 'gradient',
    backgroundColor: '#0d0d0d',
    backgroundGradient: 'linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 50%, #16213e 100%)',
    backgroundImage: '',
    backgroundBlur: 0,
    backgroundOpacity: 1,
    fontSize: 'medium',
    sidebarStyle: 'default',
    sidebarPosition: 'left',
    accentColor: '#00d4ff',
    glassEffect: false,
    particleEffects: false,
    javaDownloadPath: '',
    gameDownloadPath: '',
    maxDownloadSpeed: 0,
    downloadSource: 'mirror',
    downloadThreads: 48,
    modrinthMirror: true,
    proxyEnabled: false,
    proxyType: 'http',
    proxyHost: '127.0.0.1',
    proxyPort: 7890,
    proxyUsername: '',
    proxyPassword: '',
    proxyForGame: false,
    autoInstallMods: false,
    backupBeforeUpdate: true,
    internetSearch: true,
    maxBackups: 5,
    customJavaArgs: '',
    gcType: 'G1GC',
    fpsLimit: 0,
    fullscreenResolution: '1920x1080',
    skipJavaCheck: false,
    autoDownloadJava: true,
    enableGameLog: true,
    logLevel: 'all',
    showGameOverlay: true,
    quickEdit: true,
    developerMode: false,
    experimentalFeatures: false,
    autoThemeByBackground: true,
    enableTelemetry: true
  })

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const saveSettings = () => {
    try {
      localStorage.setItem('zncl-settings', JSON.stringify(settings.value))
    } catch (error) {
      console.error('保存设置失败:', error)
    }
  }

  const loadSettings = () => {
    try {
      const saved = localStorage.getItem('zncl-settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        settings.value = { ...settings.value, ...parsed }
      }
    } catch (error) {
      console.error('加载设置失败:', error)
    }
  }

  // 把下载源策略同步给主进程（主进程负责实际下载，不知道前端设置）
  const syncDownloadSource = (mode?: string) => {
    try {
      const m = mode || settings.value.downloadSource
      if (m && window.electronAPI?.setDownloadSource) {
        window.electronAPI.setDownloadSource(m)
      }
    } catch (e) {
      console.warn('[Settings] 同步下载源失败:', e)
    }
  }

  // 把下载并发线程数同步给主进程
  const syncDownloadThreads = (n?: number) => {
    try {
      const v = n ?? settings.value.downloadThreads
      if (v && window.electronAPI?.setDownloadThreads) {
        window.electronAPI.setDownloadThreads(v)
      }
    } catch (e) {
      console.warn('[Settings] 同步下载线程数失败:', e)
    }
  }

  // 把 Modrinth 国内镜像开关同步给主进程
  const syncModrinthMirror = (enabled?: boolean) => {
    try {
      const v = enabled ?? settings.value.modrinthMirror
      if (window.electronAPI?.setModrinthMirror) {
        window.electronAPI.setModrinthMirror(!!v)
      }
    } catch (e) {
      console.warn('[Settings] 同步 Modrinth 镜像失败:', e)
    }
  }

  // 把下载代理配置同步给主进程（主进程负责实际出网，不知道前端设置）
  const syncProxy = () => {
    try {
      if (!window.electronAPI?.setProxy) return
      const s = settings.value
      window.electronAPI.setProxy({
        enabled: !!s.proxyEnabled,
        type: s.proxyType === 'socks5' ? 'socks5' : 'http',
        host: s.proxyHost || '',
        port: Number(s.proxyPort) || 7890,
        username: s.proxyUsername || '',
        password: s.proxyPassword || '',
        forGame: !!s.proxyForGame
      })
    } catch (e) {
      console.warn('[Settings] 同步代理设置失败:', e)
    }
  }

  const initSettings = () => {
    const run = () => {
      loadSettings()
      syncDownloadSource()
      syncDownloadThreads()
      syncModrinthMirror()
      syncProxy()
    }
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 1000 })
    } else {
      setTimeout(run, 300)
    }
  }

  initSettings()

  watch(settings, () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveSettings, 500)
  }, { deep: true })

  watch(() => settings.value.downloadSource, (v) => syncDownloadSource(v))
  watch(() => settings.value.downloadThreads, (v) => syncDownloadThreads(v))
  watch(() => settings.value.modrinthMirror, (v) => syncModrinthMirror(v))
  watch(() => [
    settings.value.proxyEnabled,
    settings.value.proxyType,
    settings.value.proxyHost,
    settings.value.proxyPort,
    settings.value.proxyUsername,
    settings.value.proxyPassword,
    settings.value.proxyForGame
  ], () => syncProxy())

  return {
    settings,
    saveSettings,
    loadSettings,
    gameLaunchCount,
    hasSupportedSponsor,
    sponsorLink,
    incrementLaunchCount,
    markAsSupported,
    getNextCheckpoint,
    gameDirs,
    currentGameDirId,
    currentGameDir,
    addGameDir,
    removeGameDir,
    updateGameDir,
    selectGameDir,
    initDefaultGameDir
  }
})
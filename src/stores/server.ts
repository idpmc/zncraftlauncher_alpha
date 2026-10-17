import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from './settings'
import { i18n } from '../locales'

export interface ServerLogEntry {
  level: string
  message: string
  timestamp: string
}

export const useServerStore = defineStore('server', () => {
  const isRunning = ref(false)
  const isDownloading = ref(false)
  const downloadProgress = ref(0)
  const downloadSpeed = ref(0)
  const logs = ref<ServerLogEntry[]>([])
  const currentVersionId = ref<string | null>(null)
  const maxMemory = ref('4G')

  const memoryOptions = ['2G', '4G', '6G', '8G', '12G', '16G']

  let removeLogListener: (() => void) | null = null
  let removeDownloadListener: (() => void) | null = null
  let removeStoppedListener: (() => void) | null = null

  const initListeners = () => {
    if (typeof window === 'undefined' || !window.electronAPI) return

    if (!removeLogListener && window.electronAPI.onServerLog) {
      removeLogListener = window.electronAPI.onServerLog((_event, data) => {
        logs.value.push({
          level: data.level,
          message: data.message,
          timestamp: data.timestamp
        })
        if (logs.value.length > 500) {
          logs.value = logs.value.slice(-500)
        }
      })
    }

    if (!removeDownloadListener && window.electronAPI.onServerDownloadProgress) {
      removeDownloadListener = window.electronAPI.onServerDownloadProgress((_event, data) => {
        downloadProgress.value = data.progress
        downloadSpeed.value = data.speed
      })
    }

    if (!removeStoppedListener && window.electronAPI.onServerStopped) {
      removeStoppedListener = window.electronAPI.onServerStopped(() => {
        isRunning.value = false
        currentVersionId.value = null
      })
    }
  }

  const checkServerJar = async (versionId: string): Promise<boolean> => {
    if (!window.electronAPI?.checkServerJar) return false
    const result = await window.electronAPI.checkServerJar(versionId)
    return result.exists
  }

  const downloadServerJar = async (versionId: string): Promise<boolean> => {
    if (!window.electronAPI?.downloadServerJar) return false
    initListeners()

    isDownloading.value = true
    downloadProgress.value = 0
    downloadSpeed.value = 0

    try {
      const result = await window.electronAPI.downloadServerJar(versionId)
      return result.success
    } finally {
      isDownloading.value = false
      downloadProgress.value = 0
      downloadSpeed.value = 0
    }
  }

  const startServer = async (versionId: string): Promise<{ success: boolean; error?: string }> => {
    if (!window.electronAPI?.startServer) {
      return { success: false, error: i18n.global.t('rt.stServer.apiUnavailable') }
    }
    initListeners()

    const settingsStore = useSettingsStore()
    const result = await window.electronAPI.startServer(versionId, maxMemory.value, {
      skipJavaCheck: settingsStore.settings.skipJavaCheck || undefined,
      autoDownloadJava: settingsStore.settings.autoDownloadJava
    })
    if (result.success) {
      isRunning.value = true
      currentVersionId.value = versionId
      logs.value = []
    }
    return result
  }

  const stopServer = async (): Promise<boolean> => {
    if (!window.electronAPI?.stopServer) return false
    const result = await window.electronAPI.stopServer()
    return result.success
  }

  const sendCommand = async (command: string): Promise<boolean> => {
    if (!window.electronAPI?.sendServerCommand) return false
    const result = await window.electronAPI.sendServerCommand(command)
    return result.success
  }

  const openServerDir = async (versionId: string): Promise<boolean> => {
    if (!window.electronAPI?.openServerDir) return false
    const result = await window.electronAPI.openServerDir(versionId)
    return result.success
  }

  const clearLogs = () => {
    logs.value = []
  }

  const statusText = computed(() => {
    if (isDownloading.value) return i18n.global.t('rt.stServer.downloading')
    if (isRunning.value) return i18n.global.t('rt.stServer.running')
    return i18n.global.t('rt.stServer.stopped')
  })

  return {
    isRunning,
    isDownloading,
    downloadProgress,
    downloadSpeed,
    logs,
    currentVersionId,
    maxMemory,
    memoryOptions,
    statusText,
    checkServerJar,
    downloadServerJar,
    startServer,
    stopServer,
    sendCommand,
    openServerDir,
    clearLogs
  }
})

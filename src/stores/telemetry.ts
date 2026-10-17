import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useSettingsStore } from './settings'

export type TelemetryEventType =
  | 'download_failed'
  | 'game_launch_success'
  | 'game_launch_failed'
  | 'game_crash'
  | 'launcher_error'
  | 'java_download_failed'

export interface TelemetryEvent {
  type: TelemetryEventType
  timestamp: string
  launcherVersion: string
  platform: string
  platformVersion: string
  details: Record<string, unknown>
}

const TELEMETRY_ENDPOINT = 'https://example.com/telemetry'
const LAUNCHER_VERSION = __APP_VERSION__

function getAnonymousDeviceId(): string {
  let id = localStorage.getItem('zncl-anon-device-id')
  if (!id) {
    const randomBytes = new Uint8Array(16)
    crypto.getRandomValues(randomBytes)
    id = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    localStorage.setItem('zncl-anon-device-id', id)
  }
  return id
}

function getPlatformInfo(): { platform: string; platformVersion: string } {
  const ua = navigator.userAgent
  let platform = 'unknown'
  let platformVersion = 'unknown'

  if (ua.includes('Windows')) {
    platform = 'windows'
    const winMatch = ua.match(/Windows NT (\d+\.\d+)/)
    if (winMatch) {
      const version = parseFloat(winMatch[1])
      if (version >= 10.0) platformVersion = '10+'
      else if (version >= 6.3) platformVersion = '8.1'
      else if (version >= 6.2) platformVersion = '8'
      else if (version >= 6.1) platformVersion = '7'
      else platformVersion = 'vista_or_older'
    }
  } else if (ua.includes('Mac')) {
    platform = 'macos'
  } else if (ua.includes('Linux')) {
    platform = 'linux'
  }

  return { platform, platformVersion }
}

export const useTelemetryStore = defineStore('telemetry', () => {
  const isSending = ref(false)
  const pendingEvents = ref<Array<{ event: TelemetryEvent; deviceId: string }>>([])

  let sendTimer: ReturnType<typeof setTimeout> | null = null

  const buildEvent = (type: TelemetryEventType, details: Record<string, unknown> = {}): TelemetryEvent => {
    const { platform, platformVersion } = getPlatformInfo()
    return {
      type,
      timestamp: new Date().toISOString(),
      launcherVersion: LAUNCHER_VERSION,
      platform,
      platformVersion,
      details
    }
  }

  const sendEvents = async () => {
    if (isSending.value || pendingEvents.value.length === 0) return

    const settingsStore = useSettingsStore()
    if (!settingsStore.settings.enableTelemetry) {
      pendingEvents.value = []
      return
    }

    isSending.value = true

    try {
      const eventsToSend = [...pendingEvents.value]
      pendingEvents.value = []

      const payload = {
        deviceId: eventsToSend[0].deviceId,
        events: eventsToSend.map(e => e.event)
      }

      await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      })

      console.log(`[Telemetry] 已上报 ${eventsToSend.length} 个事件`)
    } catch (error) {
      console.warn('[Telemetry] 上报失败:', error)
    } finally {
      isSending.value = false
    }
  }

  const scheduleSend = () => {
    if (sendTimer) clearTimeout(sendTimer)
    sendTimer = setTimeout(() => {
      sendEvents()
    }, 5000)
  }

  const track = (type: TelemetryEventType, details: Record<string, unknown> = {}) => {
    const settingsStore = useSettingsStore()
    if (!settingsStore.settings.enableTelemetry) return

    const event = buildEvent(type, details)
    const deviceId = getAnonymousDeviceId()

    pendingEvents.value.push({ event, deviceId })
    console.log(`[Telemetry] 记录事件: ${type}`, details)

    scheduleSend()
  }

  const trackDownloadFailed = (versionId: string, error: string) => {
    track('download_failed', { versionId, error: error.substring(0, 200) })
  }

  const trackGameLaunchSuccess = (versionId: string) => {
    track('game_launch_success', { versionId })
  }

  const trackGameLaunchFailed = (versionId: string, error: string) => {
    track('game_launch_failed', { versionId, error: error.substring(0, 200) })
  }

  const trackGameCrash = (versionId: string, exitCode: number, error?: string) => {
    track('game_crash', { versionId, exitCode, error: error?.substring(0, 200) })
  }

  const trackLauncherError = (component: string, error: string) => {
    track('launcher_error', { component, error: error.substring(0, 200) })
  }

  const trackJavaDownloadFailed = (javaVersion: string, error: string) => {
    track('java_download_failed', { javaVersion, error: error.substring(0, 200) })
  }

  const flush = async () => {
    if (sendTimer) {
      clearTimeout(sendTimer)
      sendTimer = null
    }
    await sendEvents()
  }

  let initialized = false
  const init = () => {
    if (initialized || typeof window === 'undefined' || !window.electronAPI) return
    initialized = true

    if (window.electronAPI.onGameCrash) {
      window.electronAPI.onGameCrash((_event, data) => {
        trackGameCrash(data.versionId, data.exitCode, data.stderr)
      })
    }

    if (window.electronAPI.onJavaDownloadProgress) {
      window.electronAPI.onJavaDownloadProgress((_event, data) => {
        if (data.status === 'failed' && data.error) {
          trackJavaDownloadFailed(data.version, data.error)
        }
      })
    }
  }

  window.addEventListener('beforeunload', () => {
    if (pendingEvents.value.length > 0) {
      const settingsStore = useSettingsStore()
      if (settingsStore.settings.enableTelemetry) {
        const payload = {
          deviceId: getAnonymousDeviceId(),
          events: pendingEvents.value.map(e => e.event)
        }
        navigator.sendBeacon(TELEMETRY_ENDPOINT, JSON.stringify(payload))
      }
    }
  })

  return {
    track,
    trackDownloadFailed,
    trackGameLaunchSuccess,
    trackGameLaunchFailed,
    trackGameCrash,
    trackLauncherError,
    trackJavaDownloadFailed,
    init,
    flush
  }
})

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDownloadsStore } from './downloads'
import { i18n } from '../locales'

export interface FrpNode {
  id: string
  name: string
  serverAddr: string
  serverPort: number
  token?: string
  description: string
  isFree: boolean
}

export interface FrpTunnel {
  id: string
  name: string
  type: 'tcp' | 'udp'
  localPort: number
  remotePort: number
  status: 'stopped' | 'starting' | 'running' | 'error'
  error?: string
  remoteAddress?: string
}

export const useFrpStore = defineStore('frp', () => {
  const isDownloaded = ref(false)
  const isDownloading = ref(false)
  const downloadProgress = ref(0)
  const downloadSpeed = ref(0)

  const isRunning = ref(false)
  const isStarting = ref(false)
  const processPid = ref<number | null>(null)
  const logs = ref<{ level: string; message: string; timestamp: string }[]>([])

  const selectedNodeId = ref<string>('sakura')
  const customServerAddr = ref('')
  const customServerPort = ref(7000)
  const customToken = ref('')
  const tunnels = ref<FrpTunnel[]>([
    {
      id: 'mc-default',
      name: i18n.global.t('rt.stFrp.mcServerName'),
      type: 'tcp',
      localPort: 25565,
      remotePort: 0,
      status: 'stopped'
    }
  ])

  const nodes: FrpNode[] = [
    {
      id: 'sakura',
      name: i18n.global.t('rt.stFrp.nodeSakuraName'),
      serverAddr: 'cn-natfrp.cloud',
      serverPort: 7000,
      token: '',
      description: i18n.global.t('rt.stFrp.nodeSakuraDesc'),
      isFree: true
    },
    {
      id: 'locyan',
      name: i18n.global.t('rt.stFrp.nodeLocyanName'),
      serverAddr: 'frp.locyanfrp.cn',
      serverPort: 7000,
      token: '',
      description: i18n.global.t('rt.stFrp.nodeLocyanDesc'),
      isFree: true
    },
    {
      id: 'chml',
      name: 'ChmlFrp',
      serverAddr: 'frp.chmlfrp.cn',
      serverPort: 7000,
      token: '',
      description: i18n.global.t('rt.stFrp.nodeChmlDesc'),
      isFree: true
    },
    {
      id: 'me',
      name: i18n.global.t('rt.stFrp.nodeMeName'),
      serverAddr: 'frp.mefrp.cn',
      serverPort: 7000,
      token: '',
      description: i18n.global.t('rt.stFrp.nodeMeDesc'),
      isFree: true
    },
    {
      id: 'custom',
      name: i18n.global.t('rt.stFrp.nodeCustomName'),
      serverAddr: '',
      serverPort: 7000,
      token: '',
      description: i18n.global.t('rt.stFrp.nodeCustomDesc'),
      isFree: true
    }
  ]

  const effectiveConfig = computed(() => {
    if (selectedNodeId.value === 'custom') {
      return {
        serverAddr: customServerAddr.value,
        serverPort: customServerPort.value,
        token: customToken.value
      }
    }
    const node = nodes.find(n => n.id === selectedNodeId.value) || nodes[0]
    return {
      serverAddr: node.serverAddr,
      serverPort: node.serverPort,
      token: customToken.value || node.token || ''
    }
  })

  const selectedNode = computed(() => nodes.find(n => n.id === selectedNodeId.value) || nodes[0])
  const activeTunnel = computed(() => tunnels.find(t => t.status === 'running'))

  const addLog = (level: string, message: string) => {
    logs.value.push({
      level,
      message,
      timestamp: new Date().toLocaleTimeString()
    })
    if (logs.value.length > 200) {
      logs.value = logs.value.slice(-200)
    }
  }

  const clearLogs = () => {
    logs.value = []
  }

  const checkDownloaded = async () => {
    if (!window.electronAPI?.checkFrpDownloaded) {
      isDownloaded.value = false
      return false
    }
    const result = await window.electronAPI.checkFrpDownloaded()
    isDownloaded.value = result.exists
    return result.exists
  }

  const downloadFrpc = async () => {
    if (!window.electronAPI?.downloadFrp) return false
    const downloadsStore = useDownloadsStore()
    isDownloading.value = true
    downloadProgress.value = 0
    downloadSpeed.value = 0
    addLog('info', i18n.global.t('rt.stFrp.downloadStart'))

    downloadsStore.addTask({
      id: 'frp-client',
      name: i18n.global.t('rt.stFrp.frpClientName'),
      category: 'frp',
      status: 'downloading'
    })

    const cleanup = window.electronAPI.onFrpDownloadProgress?.((_e: any, data: any) => {
      downloadProgress.value = data.progress || 0
      downloadSpeed.value = data.speed || 0
      downloadsStore.updateProgress(
        'frp-client',
        data.progress || 0,
        data.speed || 0,
        data.downloadedBytes || 0,
        data.totalBytes || 0
      )
    })

    try {
      const result = await window.electronAPI.downloadFrp()
      if (result.success) {
        isDownloaded.value = true
        downloadsStore.setStatus('frp-client', 'completed')
        addLog('success', i18n.global.t('rt.stFrp.downloadComplete'))
        return true
      } else {
        downloadsStore.setStatus('frp-client', 'failed', result.error)
        addLog('error', i18n.global.t('rt.stFrp.downloadFailed', { error: result.error }))
        return false
      }
    } catch (e: any) {
      downloadsStore.setStatus('frp-client', 'failed', e.message)
      addLog('error', i18n.global.t('rt.stFrp.downloadError', { error: e.message }))
      return false
    } finally {
      isDownloading.value = false
      cleanup?.()
    }
  }

  const startTunnel = async (tunnelId: string = 'mc-default') => {
    if (!window.electronAPI?.startFrpTunnel) return false
    const tunnel = tunnels.value.find(t => t.id === tunnelId)
    if (!tunnel) return false

    tunnel.status = 'starting'
    isStarting.value = true
    addLog('info', i18n.global.t('rt.stFrp.tunnelStarting', { name: tunnel.name, port: tunnel.localPort }))

    try {
      const result = await window.electronAPI.startFrpTunnel({
        serverAddr: effectiveConfig.value.serverAddr,
        serverPort: effectiveConfig.value.serverPort,
        token: effectiveConfig.value.token,
        localPort: tunnel.localPort,
        tunnelName: tunnel.name,
        tunnelType: tunnel.type
      })

      if (result.success) {
        tunnel.status = 'running'
        tunnel.remotePort = result.remotePort
        tunnel.remoteAddress = `${effectiveConfig.value.serverAddr}:${result.remotePort}`
        processPid.value = result.pid
        isRunning.value = true
        addLog('success', i18n.global.t('rt.stFrp.tunnelStarted', { name: tunnel.name, addr: tunnel.remoteAddress }))
        return true
      } else {
        tunnel.status = 'error'
        tunnel.error = result.error
        addLog('error', i18n.global.t('rt.stFrp.startFailed', { error: result.error }))
        return false
      }
    } catch (e: any) {
      tunnel.status = 'error'
      tunnel.error = e.message
      addLog('error', i18n.global.t('rt.stFrp.startError', { error: e.message }))
      return false
    } finally {
      isStarting.value = false
    }
  }

  const stopTunnel = async (tunnelId: string = 'mc-default') => {
    if (!window.electronAPI?.stopFrpTunnel) return false
    const tunnel = tunnels.value.find(t => t.id === tunnelId)
    if (!tunnel) return false

    addLog('info', i18n.global.t('rt.stFrp.tunnelStopping', { name: tunnel.name }))
    try {
      await window.electronAPI.stopFrpTunnel()
      tunnel.status = 'stopped'
      tunnel.remotePort = 0
      tunnel.remoteAddress = undefined
      tunnel.error = undefined
      isRunning.value = false
      processPid.value = null
      addLog('info', i18n.global.t('rt.stFrp.tunnelStopped'))
      return true
    } catch (e: any) {
      addLog('error', i18n.global.t('rt.stFrp.stopFailed', { error: e.message }))
      return false
    }
  }

  const updateTunnelLocalPort = (tunnelId: string, port: number) => {
    const tunnel = tunnels.value.find(t => t.id === tunnelId)
    if (tunnel) {
      tunnel.localPort = port
    }
  }

  return {
    isDownloaded,
    isDownloading,
    downloadProgress,
    downloadSpeed,
    isRunning,
    isStarting,
    processPid,
    logs,
    selectedNodeId,
    customServerAddr,
    customServerPort,
    customToken,
    selectedNode,
    effectiveConfig,
    nodes,
    tunnels,
    activeTunnel,
    checkDownloaded,
    downloadFrpc,
    startTunnel,
    stopTunnel,
    updateTunnelLocalPort,
    addLog,
    clearLogs
  }
})

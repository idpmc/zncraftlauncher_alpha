import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDownloadsStore } from './downloads'
import { i18n } from '../locales'

export interface EasyTierNetwork {
  id: string
  name: string
  description: string
  virtualIp: string
  subnet: string
  peers: EasyTierPeer[]
  status: 'stopped' | 'starting' | 'running' | 'error'
  error?: string
}

export interface EasyTierPeer {
  id: string
  name: string
  virtualIp: string
  latency: number
  isOnline: boolean
}

export const useEasyTierStore = defineStore('easytier', () => {
  const isDownloaded = ref(false)
  const isDownloading = ref(false)
  const downloadProgress = ref(0)
  const downloadSpeed = ref(0)

  const isRunning = ref(false)
  const isStarting = ref(false)
  const processPid = ref<number | null>(null)
  const logs = ref<{ level: string; message: string; timestamp: string }[]>([])

  const networkName = ref('mc-lan')
  const myPeerName = ref('MyComputer')
  const virtualIp = ref('10.144.0.2')
  const subnet = ref('10.144.0.0/24')
  const listenPort = ref(11010)

  const peers = ref<EasyTierPeer[]>([])
  const publicRelays = ref([
    {
      id: 'easytier-official',
      name: i18n.global.t('rt.stEasyTier.relayOfficialName'),
      addr: 'tcp://easytier.public.kkrainbow.top:11010',
      description: i18n.global.t('rt.stEasyTier.relayOfficialDesc')
    },
    {
      id: 'easytier-cn',
      name: i18n.global.t('rt.stEasyTier.relayCnName'),
      addr: 'tcp://124.222.72.134:11010',
      description: i18n.global.t('rt.stEasyTier.relayCnDesc')
    }
  ])
  const selectedRelayId = ref('easytier-official')

  const selectedRelay = computed(() => publicRelays.value.find(r => r.id === selectedRelayId.value) || publicRelays.value[0])

  const onlinePeers = computed(() => peers.value.filter(p => p.isOnline))

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
    if (!window.electronAPI?.checkEasyTierDownloaded) {
      isDownloaded.value = false
      return false
    }
    const result = await window.electronAPI.checkEasyTierDownloaded()
    isDownloaded.value = result.exists
    return result.exists
  }

  const downloadEasyTier = async () => {
    if (!window.electronAPI?.downloadEasyTier) return false
    const downloadsStore = useDownloadsStore()
    isDownloading.value = true
    downloadProgress.value = 0
    downloadSpeed.value = 0
    addLog('info', i18n.global.t('rt.stEasyTier.downloadStart'))

    downloadsStore.addTask({
      id: 'easytier-client',
      name: i18n.global.t('rt.stEasyTier.clientName'),
      category: 'easytier',
      status: 'downloading'
    })

    const cleanup = window.electronAPI.onEasyTierDownloadProgress?.((_e: any, data: any) => {
      downloadProgress.value = data.progress || 0
      downloadSpeed.value = data.speed || 0
      downloadsStore.updateProgress(
        'easytier-client',
        data.progress || 0,
        data.speed || 0,
        data.downloadedBytes || 0,
        data.totalBytes || 0
      )
    })

    try {
      const result = await window.electronAPI.downloadEasyTier()
      if (result.success) {
        isDownloaded.value = true
        downloadsStore.setStatus('easytier-client', 'completed')
        addLog('success', i18n.global.t('rt.stEasyTier.downloadComplete'))
        return true
      } else {
        downloadsStore.setStatus('easytier-client', 'failed', result.error)
        addLog('error', i18n.global.t('rt.stEasyTier.downloadFailed', { error: result.error }))
        return false
      }
    } catch (e: any) {
      downloadsStore.setStatus('easytier-client', 'failed', e.message)
      addLog('error', i18n.global.t('rt.stEasyTier.downloadError', { error: e.message }))
      return false
    } finally {
      isDownloading.value = false
      cleanup?.()
    }
  }

  const startNetwork = async () => {
    if (!window.electronAPI?.startEasyTier) return false
    isStarting.value = true
    addLog('info', i18n.global.t('rt.stEasyTier.startNetwork', { name: networkName.value }))
    addLog('info', i18n.global.t('rt.stEasyTier.startNetworkInfo', { ip: virtualIp.value, subnet: subnet.value }))

    try {
      const result = await window.electronAPI.startEasyTier({
        networkName: networkName.value,
        peerName: myPeerName.value,
        virtualIp: virtualIp.value,
        subnet: subnet.value,
        listenPort: listenPort.value,
        relayAddr: selectedRelay.value.addr
      })

      if (result.success) {
        isRunning.value = true
        processPid.value = result.pid
        addLog('success', i18n.global.t('rt.stEasyTier.networkStarted', { ip: virtualIp.value }))
        addLog('info', i18n.global.t('rt.stEasyTier.joinHint'))
        simulatePeers()
        return true
      } else {
        addLog('error', i18n.global.t('rt.stEasyTier.startFailed', { error: result.error }))
        return false
      }
    } catch (e: any) {
      addLog('error', i18n.global.t('rt.stEasyTier.startError', { error: e.message }))
      return false
    } finally {
      isStarting.value = false
    }
  }

  const stopNetwork = async () => {
    if (!window.electronAPI?.stopEasyTier) return false
    addLog('info', i18n.global.t('rt.stEasyTier.stoppingNetwork'))
    try {
      await window.electronAPI.stopEasyTier()
      isRunning.value = false
      processPid.value = null
      peers.value = []
      addLog('info', i18n.global.t('rt.stEasyTier.networkStopped'))
      return true
    } catch (e: any) {
      addLog('error', i18n.global.t('rt.stEasyTier.stopFailed', { error: e.message }))
      return false
    }
  }

  const simulatePeers = () => {
    peers.value = [
      {
        id: 'self',
        name: myPeerName.value + i18n.global.t('rt.stEasyTier.selfSuffix'),
        virtualIp: virtualIp.value,
        latency: 0,
        isOnline: true
      }
    ]
  }

  const copyConnectInfo = () => {
    const info = i18n.global.t('rt.stEasyTier.connectInfo', {
      network: networkName.value,
      ip: virtualIp.value,
      relay: selectedRelay.value.name
    })
    navigator.clipboard.writeText(info)
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
    networkName,
    myPeerName,
    virtualIp,
    subnet,
    listenPort,
    peers,
    onlinePeers,
    publicRelays,
    selectedRelayId,
    selectedRelay,
    checkDownloaded,
    downloadEasyTier,
    startNetwork,
    stopNetwork,
    copyConnectInfo,
    addLog,
    clearLogs
  }
})

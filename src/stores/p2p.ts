import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import Peer from 'peerjs'
import { i18n } from '../locales'

const PEER_ID_PREFIX = 'zncl-mc-'
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// PeerJS 信令服务器列表（自动尝试，首个失败用下一个）
const PEERJS_SERVERS = [
  { host: '0.peerjs.com', port: 443, path: '/' },
  { host: 'peerjs.go2tech.cn', port: 443, path: '/' },
  { host: 'peer.passiveday.com', port: 443, path: '/' }
]

function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length))
  }
  return code
}

function peerIdFromCode(code: string, isHost: boolean): string {
  return `${PEER_ID_PREFIX}${code}-${isHost ? 'h' : 'c'}`
}

export type P2PRole = 'host' | 'client' | null
export type P2PStatus = 'idle' | 'connecting' | 'connected' | 'error'

export const useP2PStore = defineStore('p2p', () => {
  const role = ref<P2PRole>(null)
  const status = ref<P2PStatus>('idle')
  const roomCode = ref('')
  const errorMsg = ref('')
  const connectedPeer = ref<string | null>(null)
  const pendingConnection = ref(false)
  const localPort = ref(0)

  const logs = ref<{ level: string; message: string; timestamp: string }[]>([])

  let peer: Peer | null = null
  let dataConn: any = null
  let cleanupTCPListener: (() => void) | null = null

  const addLog = (level: string, message: string) => {
    logs.value.push({ level, message, timestamp: new Date().toLocaleTimeString() })
    if (logs.value.length > 200) logs.value = logs.value.slice(-200)
    console.log(`[P2P] ${level.toUpperCase()}: ${message}`)
  }

  const clearLogs = () => { logs.value = [] }

  const resetState = () => {
    if (cleanupTCPListener) { try { cleanupTCPListener() } catch (_) {}; cleanupTCPListener = null }
    if (dataConn) { try { dataConn.close() } catch (_) {}; dataConn = null }
    if (peer) { try { peer.destroy() } catch (_) {}; peer = null }
    role.value = null
    status.value = 'idle'
    errorMsg.value = ''
    connectedPeer.value = null
    pendingConnection.value = false
    localPort.value = 0
  }

  const setupDataEvents = (conn: any) => {
    dataConn = conn

    conn.on('open', async () => {
      addLog('success', i18n.global.t('rt.stP2p.dataChannelOpen'))
      addLog('info', i18n.global.t('rt.stP2p.connType', { type: conn.peerConnection?.iceConnectionState || i18n.global.t('rt.stP2p.unknown') }))
      status.value = 'connected'
      connectedPeer.value = conn.peer

      if (window.electronAPI?.startP2PForward) {
        const result = await window.electronAPI.startP2PForward(role.value === 'host')
        if (result.success) {
          if (result.mode === 'client') {
            localPort.value = result.port
            addLog('success', i18n.global.t('rt.stP2p.localPort', { port: result.port }))
          } else {
            addLog('success', i18n.global.t('rt.stP2p.connectedLocalMc'))
          }
        } else {
          addLog('error', i18n.global.t('rt.stP2p.tcpForwardFailed', { error: result.error }))
        }
      }

      if (window.electronAPI?.onP2PTCPData && !cleanupTCPListener) {
        cleanupTCPListener = window.electronAPI.onP2PTCPData((_e: any, data: any) => {
          if (dataConn && dataConn.open) {
            dataConn.send(data)
          }
        })
      }
    })

    conn.on('data', (data: any) => {
      if (window.electronAPI?.sendP2PData) {
        window.electronAPI.sendP2PData(data)
      }
    })

    conn.on('close', () => {
      addLog('warn', i18n.global.t('rt.stP2p.channelClosed'))
      status.value = 'idle'
      connectedPeer.value = null
      dataConn = null
      if (cleanupTCPListener) { try { cleanupTCPListener() } catch (_) {}; cleanupTCPListener = null }
    })

    conn.on('error', (err: any) => {
      addLog('error', i18n.global.t('rt.stP2p.channelError', { error: err }))
    })
  }

  // ============= 公开 API =============

  const createRoom = async (): Promise<string> => {
    resetState()
    role.value = 'host'
    status.value = 'connecting'
    roomCode.value = generateRoomCode()
    const myPeerId = peerIdFromCode(roomCode.value, true)

    addLog('info', i18n.global.t('rt.stP2p.roomCreated', { code: roomCode.value }))

    // 逐个尝试信令服务器
    for (let i = 0; i < PEERJS_SERVERS.length; i++) {
      const server = PEERJS_SERVERS[i]
      addLog('info', i18n.global.t('rt.stP2p.tryingSignaling', { host: server.host, port: server.port }))

      try {
        const result = await tryCreatePeer(myPeerId, server, i < PEERJS_SERVERS.length - 1)
        if (result) return roomCode.value
      } catch (e: any) {
        addLog('warn', i18n.global.t('rt.stP2p.signalingFailed', { host: server.host, error: e.message || e }))
      }
    }

    // 所有服务器都失败
    status.value = 'error'
    errorMsg.value = i18n.global.t('rt.stP2p.allSignalingFailed')
    throw new Error(i18n.global.t('rt.stP2p.allSignalingFailedShort'))
  }

  const tryCreatePeer = (myPeerId: string, server: typeof PEERJS_SERVERS[0], mayRetry: boolean): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      peer = new Peer(myPeerId, {
        host: server.host,
        port: server.port,
        path: server.path,
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.qq.com:3478' },
            { urls: 'stun:stun.miwifi.com:3478' },
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            }
          ]
        }
      })

      const timeout = setTimeout(() => {
        if (peer) { try { peer.destroy() } catch {} peer = null }
        reject(new Error(i18n.global.t('rt.stP2p.connectTimeout')))
      }, 10000)

      peer.on('open', (id) => {
        clearTimeout(timeout)
        addLog('info', i18n.global.t('rt.stP2p.registered', { id }))
        status.value = 'connecting'
        addLog('info', i18n.global.t('rt.stP2p.waitingClient'))

        peer!.on('connection', (conn) => {
          addLog('info', i18n.global.t('rt.stP2p.clientConnected', { peer: conn.peer }))
          if (status.value === 'connected') {
            addLog('warn', i18n.global.t('rt.stP2p.alreadyConnected'))
            conn.close()
            return
          }
          pendingConnection.value = true
          const checkAccepted = setInterval(() => {
            if (!pendingConnection.value) {
              clearInterval(checkAccepted)
              if (status.value === 'connecting' && role.value === 'host') {
                addLog('info', i18n.global.t('rt.stP2p.allowedEstablishing'))
                setupDataEvents(conn)
              }
            }
          }, 200)
          setTimeout(() => {
            if (pendingConnection.value) {
              clearInterval(checkAccepted)
              pendingConnection.value = false
              conn.close()
              addLog('warn', i18n.global.t('rt.stP2p.connRequestTimeout'))
            }
          }, 30000)
        })

        resolve(true)
      })

      peer.on('error', (err) => {
        clearTimeout(timeout)
        addLog('error', i18n.global.t('rt.stP2p.p2pError', { type: err.type, message: err.message }))
        if (mayRetry) {
          reject(err)
        } else {
          errorMsg.value = i18n.global.t('rt.stP2p.p2pErrorShort', { message: err.message })
          status.value = 'error'
          reject(err)
        }
      })
    })
  }

  const joinRoom = async (code: string): Promise<boolean> => {
    resetState()
    role.value = 'client'
    status.value = 'connecting'
    roomCode.value = code.toUpperCase()
    const myPeerId = peerIdFromCode(roomCode.value, false)
    const hostPeerId = peerIdFromCode(roomCode.value, true)

    addLog('info', i18n.global.t('rt.stP2p.joinedRoom', { code: roomCode.value }))

    // 逐个尝试信令服务器
    for (let i = 0; i < PEERJS_SERVERS.length; i++) {
      const server = PEERJS_SERVERS[i]
      addLog('info', i18n.global.t('rt.stP2p.tryingSignaling', { host: server.host, port: server.port }))

      try {
        const result = await tryJoinPeer(myPeerId, hostPeerId, server, i < PEERJS_SERVERS.length - 1)
        if (result) return true
      } catch (e: any) {
        addLog('warn', i18n.global.t('rt.stP2p.signalingFailed', { host: server.host, error: e.message || e }))
      }
    }

    status.value = 'error'
    errorMsg.value = i18n.global.t('rt.stP2p.allSignalingFailed')
    throw new Error(i18n.global.t('rt.stP2p.allSignalingFailedShort'))
  }

  const tryJoinPeer = (myPeerId: string, hostPeerId: string, server: typeof PEERJS_SERVERS[0], mayRetry: boolean): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      peer = new Peer(myPeerId, {
        host: server.host,
        port: server.port,
        path: server.path,
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.qq.com:3478' },
            { urls: 'stun:stun.miwifi.com:3478' },
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443?transport=tcp',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            }
          ]
        }
      })

      const timeout = setTimeout(() => {
        if (peer) { try { peer.destroy() } catch {} peer = null }
        reject(new Error(i18n.global.t('rt.stP2p.connectTimeout')))
      }, 10000)

      peer.on('open', (id) => {
        clearTimeout(timeout)
        addLog('info', i18n.global.t('rt.stP2p.registered', { id }))
        addLog('info', i18n.global.t('rt.stP2p.connectingHost', { host: hostPeerId }))

        const conn = peer!.connect(hostPeerId, {
          reliable: true,
          serialization: 'binary'
        })

        if (!conn) {
          addLog('error', i18n.global.t('rt.stP2p.cannotCreateConnection'))
          errorMsg.value = i18n.global.t('rt.stP2p.cannotCreateConnection')
          status.value = 'error'
          reject(new Error(i18n.global.t('rt.stP2p.cannotCreateConnection')))
          return
        }

        setupDataEvents(conn)
        resolve(true)
      })

      peer.on('error', (err) => {
        clearTimeout(timeout)
        addLog('error', i18n.global.t('rt.stP2p.p2pError', { type: err.type, message: err.message }))
        if (mayRetry) {
          reject(err)
        } else {
          errorMsg.value = i18n.global.t('rt.stP2p.p2pErrorShort', { message: err.message })
          status.value = 'error'
          reject(err)
        }
      })
    })
  }

  const acceptConnection = async () => {
    pendingConnection.value = false
    addLog('info', i18n.global.t('rt.stP2p.connectionAllowed'))
  }

  const rejectConnection = () => {
    pendingConnection.value = false
    addLog('warn', i18n.global.t('rt.stP2p.clientRejected'))
    if (dataConn) {
      try { dataConn.close() } catch (_) {}
      dataConn = null
    }
  }

  const sendData = (data: ArrayBuffer | Uint8Array) => {
    if (dataConn && dataConn.open) {
      dataConn.send(data)
      return true
    }
    return false
  }

  const disconnect = () => {
    addLog('info', i18n.global.t('rt.stP2p.disconnected'))
    if (window.electronAPI?.stopP2PForward) {
      window.electronAPI.stopP2PForward()
    }
    resetState()
  }

  const statusText = computed(() => {
    switch (status.value) {
      case 'idle': return i18n.global.t('rt.stP2p.notConnected')
      case 'connecting': return i18n.global.t('rt.stP2p.connecting')
      case 'connected': return i18n.global.t('rt.stP2p.connected')
      case 'error': return i18n.global.t('rt.stP2p.connectionFailed')
      default: return i18n.global.t('rt.stP2p.unknown')
    }
  })

  return {
    role,
    status,
    statusText,
    roomCode,
    errorMsg,
    connectedPeer,
    localPort,
    logs,
    pendingConnection,
    createRoom,
    joinRoom,
    disconnect,
    sendData,
    acceptConnection,
    rejectConnection,
    addLog,
    clearLogs
  }
})

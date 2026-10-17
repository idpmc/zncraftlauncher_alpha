<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isConnected = ref(false)
const roomCode = ref('')
const playerName = ref('')
const roomList = ref<any[]>([])
const isCreatingRoom = ref(false)
const isJoiningRoom = ref(false)
const currentRoom = ref<any>(null)

const taoApiUrl = 'https://api.tao.cloud'

const connect = async () => {
  if (!playerName.value.trim()) {
    alert(t('taoUi.alertEnterPlayerName'))
    return
  }
  try {
    const response = await fetch(`${taoApiUrl}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: playerName.value })
    })
    if (response.ok) {
      isConnected.value = true
      await fetchRooms()
    }
  } catch (error) {
    console.error('连接失败:', error)
    alert(t('taoUi.alertConnectFailed'))
  }
}

const fetchRooms = async () => {
  try {
    const response = await fetch(`${taoApiUrl}/rooms`)
    if (response.ok) {
      roomList.value = await response.json()
    }
  } catch (error) {
    console.error('获取房间列表失败:', error)
  }
}

const createRoom = async () => {
  if (!playerName.value.trim()) {
    alert(t('taoUi.alertEnterPlayerName'))
    return
  }
  isCreatingRoom.value = true
  try {
    const response = await fetch(`${taoApiUrl}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: playerName.value })
    })
    if (response.ok) {
      const data = await response.json()
      currentRoom.value = data
      roomCode.value = data.code
    }
  } catch (error) {
    console.error('创建房间失败:', error)
    alert(t('taoUi.alertCreateRoomFailed'))
  } finally {
    isCreatingRoom.value = false
  }
}

const joinRoom = async () => {
  if (!roomCode.value.trim()) {
    alert(t('taoUi.alertEnterRoomCode'))
    return
  }
  isJoiningRoom.value = true
  try {
    const response = await fetch(`${taoApiUrl}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode.value, name: playerName.value })
    })
    if (response.ok) {
      const data = await response.json()
      currentRoom.value = data
    } else {
      alert(t('taoUi.alertRoomNotFound'))
    }
  } catch (error) {
    console.error('加入房间失败:', error)
    alert(t('taoUi.alertJoinRoomFailed'))
  } finally {
    isJoiningRoom.value = false
  }
}

const leaveRoom = () => {
  currentRoom.value = null
  roomCode.value = ''
}

const launchGame = () => {
  if (currentRoom.value) {
    const serverAddress = `${currentRoom.value.host}:${currentRoom.value.port}`
    const xboxToken = currentRoom.value.token || ''
    alert(t('taoUi.alertLaunchingGame', { server: serverAddress, code: currentRoom.value.code }))
  }
}

onMounted(() => {
  if (isConnected.value) {
    fetchRooms()
  }
})
</script>

<template>
  <div class="tao-panel">
    <div class="panel-header">
      <h2>{{ t('tao.title') }}</h2>
      <p class="subtitle">{{ t('tao.subtitle') }}</p>
    </div>

    <div class="panel-content">
      <div v-if="!isConnected" class="connect-section">
        <div class="input-group">
          <label>{{ t('taoUi.playerName') }}</label>
          <input
            v-model="playerName"
            type="text"
            :placeholder="t('taoUi.playerNamePlaceholder')"
            @keyup.enter="connect"
          />
        </div>
        <button class="primary-btn" @click="connect">
          {{ t('tao.connect') }}
        </button>
      </div>

      <div v-else class="connected-section">
        <div class="user-info">
          <span class="status-dot"></span>
          <span>{{ playerName }}</span>
          <button class="text-btn" @click="isConnected = false">{{ t('taoUi.disconnect') }}</button>
        </div>

        <div v-if="!currentRoom" class="room-actions">
          <div class="action-card" @click="createRoom">
            <div class="action-icon">+</div>
            <h3>{{ t('taoUi.createRoom') }}</h3>
            <p>{{ t('taoUi.createRoomHint') }}</p>
          </div>

          <div class="action-card">
            <div class="join-form">
              <input
                v-model="roomCode"
                type="text"
                :placeholder="t('taoUi.roomCodePlaceholder')"
                @keyup.enter="joinRoom"
              />
              <button
                class="primary-btn small"
                @click="joinRoom"
                :disabled="isJoiningRoom"
              >
                {{ isJoiningRoom ? t('taoUi.joining') : t('taoUi.joinRoom') }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="currentRoom" class="current-room">
          <div class="room-info-card">
            <div class="room-header">
              <h3>{{ t('taoUi.currentRoom') }}</h3>
              <span class="room-code">{{ currentRoom.code }}</span>
            </div>
            <div class="room-details">
              <div class="detail-item">
                <span class="label">{{ t('tao.host') }}:</span>
                <span class="value">{{ currentRoom.hostName }}</span>
              </div>
              <div class="detail-item">
                <span class="label">{{ t('tao.status') }}:</span>
                <span class="value status">{{ t('tao.status') }}</span>
              </div>
              <div class="detail-item">
                <span class="label">{{ t('tao.players') }}:</span>
                <span class="value">1/{{ currentRoom.maxPlayers || 8 }}</span>
              </div>
            </div>
            <div class="room-actions-btns">
              <button class="primary-btn" @click="launchGame">
                {{ t('taoUi.launchGame') }}
              </button>
              <button class="secondary-btn" @click="leaveRoom">
                {{ t('taoUi.leaveRoom') }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="!currentRoom && roomList.length > 0" class="room-list-section">
          <h3>{{ t('taoUi.availableRooms') }}</h3>
          <div class="room-list">
            <div
              v-for="room in roomList"
              :key="room.code"
              class="room-item"
              @click="roomCode = room.code; joinRoom()"
            >
              <div class="room-item-info">
                <span class="host-name">{{ room.hostName }}</span>
                <span class="player-count">{{ room.playerCount }}/{{ room.maxPlayers || 8 }}</span>
              </div>
              <span class="room-item-code">{{ room.code }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tao-panel {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
  color: var(--text-primary);
}

.panel-header {
  margin-bottom: 32px;
}

.panel-header h2 {
  font-size: 28px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--accent-primary);
}

.subtitle {
  color: var(--text-secondary);
  margin: 0;
}

.connect-section {
  max-width: 400px;
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-size: 14px;
}

.input-group input {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
}

.input-group input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.primary-btn {
  width: 100%;
  padding: 12px 24px;
  background: var(--accent-primary);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.primary-btn:hover {
  background: var(--accent-secondary);
}

.primary-btn.small {
  width: auto;
  padding: 8px 16px;
}

.connected-section {
  max-width: 800px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  background: var(--success);
  border-radius: 50%;
}

.text-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}

.text-btn:hover {
  color: var(--error);
}

.room-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

.action-card {
  padding: 24px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-card:hover {
  border-color: var(--accent-primary);
  background: var(--bg-hover);
}

.action-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-glow);
  color: var(--accent-primary);
  font-size: 24px;
  border-radius: 12px;
  margin-bottom: 16px;
}

.action-card h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.action-card p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.join-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.join-form input {
  padding: 10px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
}

.current-room {
  margin-bottom: 24px;
}

.room-info-card {
  padding: 24px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--accent-primary);
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.room-header h3 {
  margin: 0;
}

.room-code {
  padding: 4px 12px;
  background: var(--accent-primary);
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
}

.room-details {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
}

.detail-item {
  display: flex;
  gap: 8px;
}

.detail-item .label {
  color: var(--text-secondary);
}

.detail-item .status {
  color: var(--success);
}

.room-actions-btns {
  display: flex;
  gap: 12px;
}

.secondary-btn {
  flex: 1;
  padding: 10px 20px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  cursor: pointer;
}

.secondary-btn:hover {
  background: var(--bg-hover);
}

.room-list-section h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: var(--text-secondary);
}

.room-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.room-item:hover {
  background: var(--bg-hover);
}

.room-item-info {
  display: flex;
  gap: 16px;
}

.host-name {
  font-weight: 500;
}

.player-count {
  color: var(--text-secondary);
}

.room-item-code {
  font-family: monospace;
  color: var(--accent-primary);
}
</style>

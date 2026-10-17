<script setup lang="ts">import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useServersStore } from '../stores/servers';
const { t } = useI18n();
const serversStore = useServersStore();
const selectedServer = ref<string | null>(null);
const showAddDialog = ref(false);
const newServer = ref({
 name: '',
 ip: '',
 port: '25565'
});
const showDirectConnect = ref(false);
const directConnectAddress = ref('');
const selectServer = (serverId: string) => {
 selectedServer.value = serverId;
};
const addServer = () => {
 if (newServer.value.name && newServer.value.ip) {
 serversStore.addServer({
 id: Date.now().toString(),
 name: newServer.value.name,
 ip: newServer.value.ip,
 port: parseInt(newServer.value.port) || 25565,
 players: 0,
 maxPlayers: 0,
 motd: '',
 icon: null,
 pinged: false
 });
 newServer.value = { name: '', ip: '', port: '25565' };
 showAddDialog.value = false;
 }
};
const deleteServer = (serverId: string) => {
 serversStore.deleteServer(serverId);
 if (selectedServer.value === serverId) {
 selectedServer.value = null;
 }
};
const connectToServer = (serverId?: string) => {
 if (serverId) {
 serversStore.connectToServer(serverId);
 }
 else if (directConnectAddress.value) {
 serversStore.directConnect(directConnectAddress.value);
 showDirectConnect.value = false;
 directConnectAddress.value = '';
 }
};
const refreshServer = (serverId: string) => {
 serversStore.pingServer(serverId);
};
</script>

<template>
  <div class="server-manager">
    <div class="manager-header">
      <div class="header-title">
        <h2>{{ t('srv.title') }}</h2>
        <p>{{ t('srv.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <button class="action-btn" @click="showDirectConnect = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
          {{ t('srv.directConnect') }}
        </button>
        <button class="action-btn primary" @click="showAddDialog = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {{ t('srv.addServer') }}
        </button>
      </div>
    </div>
    
    <div class="servers-grid">
      <div 
        v-for="server in serversStore.servers" 
        :key="server.id"
        class="server-card"
        :class="{ selected: selectedServer === server.id }"
        @click="selectServer(server.id)"
      >
        <div class="server-icon">
          <img v-if="server.icon" :src="server.icon" :alt="server.name" />
          <div v-else class="default-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
              <path d="M6 6h.01M6 18h.01" />
            </svg>
          </div>
        </div>
        <div class="server-info">
          <h3 class="server-name">{{ server.name }}</h3>
          <p class="server-address">{{ server.ip }}:{{ server.port }}</p>
          <div v-if="server.pinged" class="server-status">
            <span class="online" v-if="server.players !== undefined">
              {{ t('srv.online', { p: server.players, max: server.maxPlayers }) }}
            </span>
            <span class="offline" v-else>{{ t('srv.offline') }}</span>
          </div>
          <p v-if="server.motd" class="server-motd">{{ server.motd }}</p>
        </div>
        <div class="server-actions">
          <button class="mini-btn" @click.stop="refreshServer(server.id)" :title="t('srv.refreshStatus')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button class="mini-btn danger" @click.stop="deleteServer(server.id)" :title="t('srv.delete')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
        <button 
          class="connect-btn"
          @click.stop="connectToServer(server.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
          {{ t('srv.connect') }}
        </button>
      </div>
    </div>
    
    <div v-if="serversStore.servers.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="2" width="20" height="8" rx="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" />
        <path d="M6 6h.01M6 18h.01" />
      </svg>
      <p>{{ t('srv.noServers') }}</p>
      <button class="add-btn" @click="showAddDialog = true">
        {{ t('srv.addServer') }}
      </button>
    </div>
    
    <div v-if="showAddDialog" class="modal-overlay" @click.self="showAddDialog = false">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ t('srv.addServer') }}</h3>
          <button class="close-btn" @click="showAddDialog = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>{{ t('srv.serverName') }}</label>
            <input 
              v-model="newServer.name"
              type="text" 
              :placeholder="t('srv.serverNamePlaceholder')"
            />
          </div>
          <div class="form-group">
            <label>{{ t('srv.serverAddress') }}</label>
            <input 
              v-model="newServer.ip"
              type="text" 
              :placeholder="t('srv.serverIpPlaceholder')"
            />
          </div>
          <div class="form-group">
            <label>{{ t('srv.port') }}</label>
            <input 
              v-model="newServer.port"
              type="text" 
              placeholder="25565"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="cancel-btn" @click="showAddDialog = false">{{ t('srv.cancel') }}</button>
          <button class="confirm-btn" @click="addServer">{{ t('srv.add') }}</button>
        </div>
      </div>
    </div>
    
    <div v-if="showDirectConnect" class="modal-overlay" @click.self="showDirectConnect = false">
      <div class="modal small">
        <div class="modal-header">
          <h3>{{ t('srv.directConnectTitle') }}</h3>
          <button class="close-btn" @click="showDirectConnect = false">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>{{ t('srv.serverAddress') }}</label>
            <input 
              v-model="directConnectAddress"
              type="text" 
              :placeholder="t('srv.addressExamplePlaceholder')"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="cancel-btn" @click="showDirectConnect = false">{{ t('srv.cancel') }}</button>
          <button class="confirm-btn" @click="connectToServer()">{{ t('srv.connect') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.server-manager {
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
  margin-bottom: 20px;
}

.header-title h2 {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.header-title p {
  font-size: 14px;
  color: var(--text-muted);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.action-btn.primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.action-btn.primary:hover {
  background: var(--accent-secondary);
}

.action-btn svg {
  width: 14px;
  height: 14px;
}

.servers-grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
  padding-right: 8px;
}

.server-card {
  position: relative;
  background: var(--bg-card);
  border: 2px solid transparent;
  border-radius: var(--border-radius);
  padding: 16px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.server-card:hover {
  border-color: var(--accent-secondary);
  transform: translateY(-2px);
}

.server-card.selected {
  border-color: var(--accent-primary);
  background: var(--accent-glow);
}

.server-icon {
  width: 64px;
  height: 64px;
  float: left;
  margin-right: 12px;
  border-radius: var(--border-radius-sm);
  overflow: hidden;
  background: var(--bg-hover);
}

.server-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.default-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.default-icon svg {
  width: 24px;
  height: 24px;
}

.server-info {
  overflow: hidden;
}

.server-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.server-address {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.server-status {
  margin-bottom: 8px;
}

.server-status .online {
  font-size: 12px;
  color: var(--success);
  font-weight: 500;
}

.server-status .offline {
  font-size: 12px;
  color: var(--error);
  font-weight: 500;
}

.server-motd {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
  max-height: 42px;
  overflow: hidden;
}

.server-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.server-card:hover .server-actions {
  opacity: 1;
}

.mini-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border: none;
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mini-btn:hover {
  background: var(--accent-primary);
  color: white;
}

.mini-btn.danger:hover {
  background: var(--error);
}

.mini-btn svg {
  width: 14px;
  height: 14px;
}

.connect-btn {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--border-radius-sm);
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  opacity: 0;
  transform: translateY(8px);
  transition: all var(--transition-fast);
}

.server-card:hover .connect-btn {
  opacity: 1;
  transform: translateY(0);
}

.connect-btn:hover {
  background: var(--accent-secondary);
}

.connect-btn svg {
  width: 14px;
  height: 14px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.empty-state svg {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
}

.empty-state p {
  font-size: 14px;
  margin-bottom: 16px;
}

.add-btn {
  padding: 10px 24px;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--border-radius-sm);
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.add-btn:hover {
  background: var(--accent-secondary);
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
  z-index: 100;
}

.modal {
  background: var(--bg-card);
  border-radius: var(--border-radius);
  width: 400px;
  max-width: 90%;
  overflow: hidden;
}

.modal.small {
  width: 350px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--border-radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.close-btn svg {
  width: 16px;
  height: 16px;
}

.modal-body {
  padding: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  transition: all var(--transition-fast);
}

.form-group input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid var(--border-color);
}

.cancel-btn {
  padding: 8px 16px;
  background: var(--bg-hover);
  border: none;
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.cancel-btn:hover {
  background: var(--border-color);
}

.confirm-btn {
  padding: 8px 16px;
  background: var(--accent-primary);
  border: none;
  border-radius: var(--border-radius-sm);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.confirm-btn:hover {
  background: var(--accent-secondary);
}
</style>

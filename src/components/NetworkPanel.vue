<template>
  <div class="network-panel">
    <!-- 安全警告横幅 -->
    <div class="security-banner" :class="{ collapsed: securityBannerCollapsed }">
      <div class="security-banner-header" @click="securityBannerCollapsed = !securityBannerCollapsed">
        <div class="security-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div class="security-title">
          <span class="security-label">{{ t('net.securityLabel') }}</span>
          <span class="security-subtitle">{{ t('net.securitySubtitle') }}</span>
        </div>
        <svg class="security-collapse-arrow" :class="{ open: !securityBannerCollapsed }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div v-show="!securityBannerCollapsed" class="security-banner-content">
        <div class="security-grid">
          <div class="security-item">
            <div class="security-item-icon warn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div class="security-item-text">
              <h4>{{ t('net.secTrustTitle') }}</h4>
              <p>{{ t('net.secTrustDesc') }}</p>
            </div>
          </div>
          <div class="security-item">
            <div class="security-item-icon danger">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div class="security-item-text">
              <h4>{{ t('net.secPortTitle') }}</h4>
              <p>{{ t('net.secPortDesc') }}</p>
            </div>
          </div>
          <div class="security-item">
            <div class="security-item-icon info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </div>
            <div class="security-item-text">
              <h4>{{ t('net.secCloseTitle') }}</h4>
              <p>{{ t('net.secCloseDesc') }}</p>
            </div>
          </div>
          <div class="security-item">
            <div class="security-item-icon success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div class="security-item-text">
              <h4>{{ t('net.secP2PTitle') }}</h4>
              <p>{{ t('net.secP2PDesc') }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-header">
      <div class="header-title">
        <h2>{{ t('net.title') }}</h2>
        <p>{{ t('net.subtitle') }}</p>
      </div>
      <div class="header-status">
        <div class="status-pill" :class="{ active: p2pStore.status === 'connected' }">
          <span class="status-dot"></span>
          <span>P2P {{ p2pStore.statusText }}</span>
        </div>
        <div class="status-pill" :class="{ active: frpStore.isRunning }">
          <span class="status-dot"></span>
          <span>FRP {{ frpStore.isRunning ? t('net.statusRunning') : t('net.statusStopped') }}</span>
        </div>
        <div class="status-pill" :class="{ active: easytierStore.isRunning }">
          <span class="status-dot"></span>
          <span>EasyTier {{ easytierStore.isRunning ? t('net.statusRunning') : t('net.statusStopped') }}</span>
        </div>
        <div class="status-pill" :class="{ active: taoConnected }">
          <span class="status-dot"></span>
          <span>{{ t('net.taoName') }} {{ taoConnected ? t('net.statusConnected') : t('net.statusDisconnected') }}</span>
        </div>
      </div>
    </div>

    <!-- 方案选择卡片 -->
    <div class="method-cards">
      <div 
        class="method-card p2p-card"
        :class="{ active: activeTab === 'p2p', running: p2pStore.status === 'connected' }"
        @click="activeTab = 'p2p'"
      >
        <div class="method-icon p2p">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
        </div>
        <div class="method-info">
          <h3>{{ t('net.p2pCardTitle') }}</h3>
          <p>{{ t('net.p2pCardDesc') }}</p>
          <div class="method-tags">
            <span class="tag recommended">{{ t('net.recommended') }}</span>
            <span class="tag">{{ t('net.zeroConfig') }}</span>
          </div>
        </div>
        <div v-if="p2pStore.status === 'connected'" class="method-running-badge p2p">● {{ t('net.statusConnected') }}</div>
      </div>

      <div 
        class="method-card frp-card"
        :class="{ active: activeTab === 'frp', running: frpStore.isRunning }"
        @click="activeTab = 'frp'"
      >
        <div class="method-icon frp">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16v4H4z"/>
            <path d="M4 12h16v8H4z"/>
            <circle cx="8" cy="16" r="1.5"/>
            <circle cx="12" cy="16" r="1.5"/>
            <circle cx="16" cy="16" r="1.5"/>
          </svg>
        </div>
        <div class="method-info">
          <h3>{{ t('net.frpCardTitle') }}</h3>
          <p>{{ t('net.frpCardDesc') }}</p>
          <div class="method-tags">
            <span class="tag">{{ t('net.forTemporary') }}</span>
            <span class="tag">{{ t('net.simpleFast') }}</span>
          </div>
        </div>
        <div v-if="frpStore.isRunning" class="method-running-badge">● {{ t('net.statusRunning') }}</div>
      </div>

      <div 
        class="method-card et-card"
        :class="{ active: activeTab === 'easytier', running: easytierStore.isRunning }"
        @click="activeTab = 'easytier'"
      >
        <div class="method-icon et">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </div>
        <div class="method-info">
          <h3>{{ t('net.etCardTitle') }}</h3>
          <p>{{ t('net.etCardDesc') }}</p>
          <div class="method-tags">
            <span class="tag">{{ t('net.forLongTerm') }}</span>
            <span class="tag">{{ t('net.lowerLatency') }}</span>
          </div>
        </div>
        <div v-if="easytierStore.isRunning" class="method-running-badge et">● {{ t('net.statusRunning') }}</div>
      </div>

      <div 
        class="method-card tao-card"
        :class="{ active: activeTab === 'tao', running: taoConnected }"
        @click="activeTab = 'tao'"
      >
        <div class="method-icon tao">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
          </svg>
        </div>
        <div class="method-info">
          <h3>{{ t('net.taoCardTitle') }}</h3>
          <p>{{ t('net.taoCardDesc') }}</p>
          <div class="method-tags">
            <span class="tag">{{ t('net.official') }}</span>
            <span class="tag">{{ t('net.stable') }}</span>
          </div>
        </div>
        <div v-if="taoConnected" class="method-running-badge tao">● {{ t('net.statusConnected') }}</div>
      </div>
    </div>

    <!-- P2P 房间面板 -->
    <Transition name="fade" mode="out-in">
      <div v-if="activeTab === 'p2p'" key="p2p" class="tab-content">
        <div class="content-grid">
          <div class="main-card">
            <div class="card-header">
              <h3>{{ t('net.p2pCardTitle') }}</h3>
              <span class="card-subtitle">{{ t('net.p2pPanelSubtitle') }}</span>
            </div>

            <div v-if="p2pStore.status === 'idle'" class="p2p-actions">
              <div class="p2p-action-card">
                <div class="action-icon host">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/>
                  </svg>
                </div>
                <h4>{{ t('net.createRoom') }}</h4>
                <p>{{ t('net.createRoomDesc') }}</p>
                <button class="btn primary big" @click="createRoom">{{ t('net.createRoom') }}</button>
              </div>

              <div class="p2p-divider"><span>{{ t('net.or') }}</span></div>

              <div class="p2p-action-card">
                <div class="action-icon client">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                </div>
                <h4>{{ t('net.joinRoom') }}</h4>
                <p>{{ t('net.joinRoomDesc') }}</p>
                <div class="join-input-row">
                  <input 
                    v-model="joinRoomCode" 
                    type="text" 
                    :placeholder="t('net.roomCodePlaceholder')"
                    maxlength="6"
                    class="room-code-input"
                    @keyup.enter="joinRoom"
                  />
                  <button class="btn primary" @click="joinRoom">{{ t('net.join') }}</button>
                </div>
              </div>
            </div>

            <div v-else-if="p2pStore.status === 'connecting'" class="p2p-loading">
              <template v-if="p2pStore.role === 'host' && p2pStore.pendingConnection">
                <div class="connection-request">
                  <div class="request-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <h4>{{ t('net.connectionRequest') }}</h4>
                  <p>{{ t('net.connectionRequestDesc') }}</p>
                  <div class="request-actions">
                    <button class="btn primary" @click="p2pStore.acceptConnection()">{{ t('net.acceptConnection') }}</button>
                    <button class="btn danger" @click="p2pStore.rejectConnection()">{{ t('net.reject') }}</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="loading-spinner"></div>
                <p>{{ p2pStore.role === 'host' ? t('net.waitingClient') : t('net.connectingRoom') }}</p>
              </template>
            </div>

            <div v-else-if="p2pStore.status === 'connected' && p2pStore.role === 'host'" class="p2p-connected">
              <div class="connected-badge host">
                <span class="pulse-dot"></span>
                {{ t('net.roomCreated') }}
              </div>
              <div class="room-code-display">
                <label>{{ t('net.yourRoomCode') }}</label>
                <div class="room-code-box">
                  <span class="room-code-text">{{ p2pStore.roomCode }}</span>
                  <button class="btn ghost" @click="copyRoomCode">
                    {{ copiedCode ? t('net.copied') : t('net.copy') }}
                  </button>
                </div>
              </div>
              <div class="hint-box">
                <p>{{ t('net.shareRoomCodeHint') }}</p>
                <p class="sub">{{ t('net.ensureLocalServer') }}</p>
              </div>
              <button class="btn danger" @click="p2pStore.disconnect()">{{ t('net.closeRoom') }}</button>
            </div>

            <div v-else-if="p2pStore.status === 'connected' && p2pStore.role === 'client'" class="p2p-connected">
              <div class="connected-badge client">
                <span class="pulse-dot"></span>
                {{ t('net.connectedToRoom') }}
              </div>
              <div class="room-code-display">
                <label>{{ t('net.roomCode') }}</label>
                <div class="room-code-box simple">
                  <span class="room-code-text">{{ p2pStore.roomCode }}</span>
                </div>
              </div>
              <div class="hint-box">
                <p>{{ t('net.mcSteps') }}</p>
                <p class="highlight">{{ t('net.serverAddressFill') }}<code>127.0.0.1:{{ p2pStore.localPort || 25565 }}</code></p>
                <p v-if="p2pStore.localPort && p2pStore.localPort !== 25565" class="sub" style="color: #f39c12; margin-top: 4px;">
                  {{ t('net.portOccupied', { port: p2pStore.localPort }) }}
                </p>
              </div>
              <button class="btn danger" @click="p2pStore.disconnect()">{{ t('net.disconnect') }}</button>
            </div>

            <div v-else-if="p2pStore.status === 'error'" class="p2p-error">
              <div class="error-icon">⚠</div>
              <p>{{ p2pStore.errorMsg || t('net.connectFailed') }}</p>
              <button class="btn" @click="p2pStore.disconnect()">{{ t('net.retry') }}</button>
            </div>
          </div>

          <!-- 日志 -->
          <div class="log-card">
            <div class="card-header">
              <h3>{{ t('net.logs') }}</h3>
              <span class="card-subtitle">P2P</span>
            </div>
            <div ref="logContentRef" class="log-content">
              <div v-for="(log, i) in p2pStore.logs" :key="i" :class="['log-line', log.level]">
                <span class="log-time">[{{ log.timestamp }}]</span>
                <span class="log-msg">{{ log.message }}</span>
              </div>
              <div v-if="p2pStore.logs.length === 0" class="log-empty">{{ t('net.noLogs') }}</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- FRP 面板 -->
    <Transition name="fade" mode="out-in">
      <div v-if="activeTab === 'frp'" key="frp" class="tab-content">
        <div class="content-grid">
          <div class="main-card">
            <div class="card-header">
              <h3>{{ t('net.frpCardTitle') }}</h3>
              <span class="card-subtitle">{{ t('net.frpPanelSubtitle') }}</span>
            </div>

            <!-- 下载进度 -->
            <div v-if="frpStore.isDownloading" class="download-progress">
              <div class="progress-label">
                <span>{{ t('net.downloadingFrpc') }}</span>
                <span>{{ frpStore.downloadProgress }}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: frpStore.downloadProgress + '%' }"></div>
              </div>
            </div>

            <!-- 需要下载 -->
            <div v-if="!frpStore.isDownloaded && !frpStore.isDownloading" class="download-section">
              <div class="download-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </div>
              <div class="download-text">
                <h4>{{ t('net.needDownloadFrpc') }}</h4>
                <p>{{ t('net.frpcSizeDesc') }}</p>
              </div>
              <button class="primary-btn" @click="downloadFrp">
                {{ t('net.downloadNow') }}
              </button>
            </div>

            <!-- 配置区 -->
            <div v-if="frpStore.isDownloaded" class="config-area">
              <!-- FRP 安全提示 -->
              <div class="method-security-tip frp">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <span>{{ t('net.frpTipPrefix') }}<strong>{{ t('net.frpTipStrong') }}</strong>{{ t('net.frpTipSuffix') }}</span>
              </div>

              <div class="config-section">
                <label class="config-label">{{ t('net.selectNode') }}</label>
                <div class="node-grid">
                  <div 
                    v-for="node in frpStore.nodes.filter(n => n.id !== 'custom')" 
                    :key="node.id"
                    class="node-card"
                    :class="{ active: frpStore.selectedNodeId === node.id }"
                    @click="frpStore.selectedNodeId = node.id"
                  >
                    <div class="node-name">{{ node.name }}</div>
                    <div class="node-desc">{{ node.description }}</div>
                    <div class="node-free-badge" v-if="node.isFree">{{ t('net.free') }}</div>
                  </div>
                </div>
              </div>

              <!-- Token 输入框（预设节点也需要） -->
              <div class="config-field token-field">
                <label>{{ t('net.accessToken') }}</label>
                <input 
                  v-model="frpStore.customToken" 
                  :type="showToken ? 'text' : 'password'" 
                  :placeholder="getTokenPlaceholder()"
                />
                <span class="field-hint">
                  {{ t('net.tokenHint', { node: frpStore.selectedNode?.name || t('net.officialSite') }) }}
                  <a class="inline-link" @click="toggleTokenVisibility">{{ showToken ? t('net.hide') : t('net.show') }}</a>
                </span>
              </div>

              <div class="config-row-2">
                <div class="config-field">
                  <label>{{ t('net.localPort') }}</label>
                  <input 
                    v-model.number="frpStore.tunnels[0].localPort" 
                    type="number" 
                    min="1" 
                    max="65535"
                  />
                  <span class="field-hint">{{ t('net.minecraftDefaultPort') }}</span>
                </div>
              </div>

              <div class="config-section">
                <div class="custom-toggle" @click="showCustomFrp = !showCustomFrp">
                  <span>{{ t('net.useCustomNode') }}</span>
                  <svg class="toggle-arrow" :class="{ open: showCustomFrp }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                <div v-if="showCustomFrp" class="custom-fields">
                  <input v-model="customFrpAddr" type="text" :placeholder="t('net.customAddrPlaceholder')" @change="updateCustomNode" />
                  <div class="custom-row">
                    <input v-model.number="customFrpPort" type="number" :placeholder="t('net.portPlaceholder')" @change="updateCustomNode" />
                    <input v-model="customFrpToken" type="text" :placeholder="t('net.tokenOptionalPlaceholder')" @change="updateCustomNode" />
                  </div>
                  <button class="text-btn apply-btn" @click="applyCustomNode">{{ t('net.useThisNode') }}</button>
                </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div v-if="frpStore.isDownloaded" class="action-area">
              <button 
                v-if="!frpStore.isRunning"
                class="primary-btn huge"
                :disabled="frpStore.isStarting"
                @click="startFrpTunnel"
              >
                <svg v-if="!frpStore.isStarting" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6 4 20 12 6 20 6 4"/>
                </svg>
                <svg v-else class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {{ frpStore.isStarting ? t('net.starting') : t('net.startTunnel') }}
              </button>
              <button v-else class="danger-btn huge" @click="stopFrpTunnel">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12"/>
                </svg>
                {{ t('net.stopTunnel') }}
              </button>
            </div>
          </div>

          <!-- 结果面板 -->
          <div class="side-card">
            <div v-if="frpStore.isRunning && frpStore.activeTunnel" class="result-panel success">
              <div class="result-status">
                <span class="pulse-dot"></span>
                <span>{{ t('net.tunnelRunning') }}</span>
              </div>
              <div class="result-divider"></div>
              <div class="result-field">
                <label>{{ t('net.publicAddress') }}</label>
                <div class="copy-row">
                  <code>{{ frpStore.activeTunnel.remoteAddress }}</code>
                  <button class="copy-icon-btn" @click="copyText(frpStore.activeTunnel.remoteAddress!)" :title="t('net.copy')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="result-tip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <p>{{ t('net.shareAddressHint') }}</p>
              </div>
            </div>

            <div v-else class="result-panel idle">
              <div class="idle-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M4 4h16v4H4z"/>
                  <path d="M4 12h16v8H4z"/>
                </svg>
              </div>
              <h4>{{ t('net.waitingStart') }}</h4>
              <p>{{ t('net.idleFrpHint') }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- EasyTier 面板 -->
      <div v-else key="et" class="tab-content">
        <div class="content-grid">
          <div class="main-card">
            <div class="card-header">
              <h3>{{ t('net.etCardTitle') }}</h3>
              <span class="card-subtitle">{{ t('net.etPanelSubtitle') }}</span>
            </div>

            <!-- 下载进度 -->
            <div v-if="easytierStore.isDownloading" class="download-progress">
              <div class="progress-label">
                <span>{{ t('net.downloadingEasyTier') }}</span>
                <span>{{ easytierStore.downloadProgress }}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill et" :style="{ width: easytierStore.downloadProgress + '%' }"></div>
              </div>
            </div>

            <!-- 需要下载 -->
            <div v-if="!easytierStore.isDownloaded && !easytierStore.isDownloading" class="download-section">
              <div class="download-icon et">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <div class="download-text">
                <h4>{{ t('net.needDownloadEasyTier') }}</h4>
                <p>{{ t('net.easytierSizeDesc') }}</p>
              </div>
              <button class="primary-btn et" @click="downloadEasyTier">
                {{ t('net.downloadNow') }}
              </button>
            </div>

            <!-- 配置区 -->
            <div v-if="easytierStore.isDownloaded" class="config-area">
              <!-- EasyTier 安全提示 -->
              <div class="method-security-tip et">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <span>{{ t('net.etTipPrefix') }}<strong>{{ t('net.etTipStrong') }}</strong>{{ t('net.etTipSuffix') }}</span>
              </div>

              <div class="config-row-2">
                <div class="config-field">
                  <label>{{ t('net.networkName') }}</label>
                  <input v-model="easytierStore.networkName" type="text" :placeholder="t('net.networkNamePlaceholder')" />
                  <span class="field-hint">{{ t('net.networkNameHint') }}</span>
                </div>
                <div class="config-field">
                  <label>{{ t('net.myName') }}</label>
                  <input v-model="easytierStore.myPeerName" type="text" :placeholder="t('net.myNamePlaceholder')" />
                </div>
              </div>

              <div class="config-row-2">
                <div class="config-field">
                  <label>{{ t('net.myVirtualIp') }}</label>
                  <input v-model="easytierStore.virtualIp" type="text" placeholder="10.144.0.2" />
                  <span class="field-hint">{{ t('net.virtualIpHint') }}</span>
                </div>
                <div class="config-field">
                  <label>{{ t('net.relayNode') }}</label>
                  <select v-model="easytierStore.selectedRelayId" class="form-select">
                    <option v-for="relay in easytierStore.publicRelays" :key="relay.id" :value="relay.id">
                      {{ relay.name }}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div v-if="easytierStore.isDownloaded" class="action-area">
              <button 
                v-if="!easytierStore.isRunning"
                class="primary-btn huge et"
                :disabled="easytierStore.isStarting"
                @click="startEasyTier"
              >
                <svg v-if="!easytierStore.isStarting" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6 4 20 12 6 20 6 4"/>
                </svg>
                <svg v-else class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {{ easytierStore.isStarting ? t('net.creating') : t('net.createNetwork') }}
              </button>
              <button v-else class="danger-btn huge" @click="stopEasyTier">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12"/>
                </svg>
                {{ t('net.stopNetwork') }}
              </button>
            </div>
          </div>

          <!-- 结果面板 -->
          <div class="side-card">
            <div v-if="easytierStore.isRunning" class="result-panel success et">
              <div class="result-status">
                <span class="pulse-dot et"></span>
                <span>{{ t('net.networkRunning') }}</span>
              </div>
              <div class="result-divider"></div>
              <div class="result-field">
                <label>{{ t('net.myVirtualIp') }}</label>
                <div class="copy-row">
                  <code>{{ easytierStore.virtualIp }}:25565</code>
                  <button class="copy-icon-btn" @click="copyText(easytierStore.virtualIp + ':25565')" :title="t('net.copy')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="result-field">
                <label>{{ t('net.networkName') }}</label>
                <div class="copy-row">
                  <code>{{ easytierStore.networkName }}</code>
                  <button class="copy-icon-btn" @click="copyText(easytierStore.networkName)" :title="t('net.copy')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="result-field">
                <label>{{ t('net.onlineMembers') }}</label>
                <div class="peer-list">
                  <div v-for="peer in easytierStore.onlinePeers" :key="peer.id" class="peer-item">
                    <span class="peer-dot online"></span>
                    <span class="peer-name">{{ peer.name }}</span>
                    <span class="peer-ip">{{ peer.virtualIp }}</span>
                  </div>
                </div>
              </div>
              <div class="result-tip et">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <p>{{ t('net.etShareHint', { name: easytierStore.networkName, ip: easytierStore.virtualIp }) }}</p>
              </div>
              <button class="outline-btn full-width" @click="easytierStore.copyConnectInfo()">
                {{ t('net.copyConnectInfo') }}
              </button>
            </div>

            <div v-else class="result-panel idle et">
              <div class="idle-icon et">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                </svg>
              </div>
              <h4>{{ t('net.waitingCreate') }}</h4>
              <p>{{ t('net.idleEtHint') }}</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 陶瓦联机面板 -->
    <Transition name="fade" mode="out-in">
      <div v-if="activeTab === 'tao'" key="tao" class="tab-content">
        <div class="content-grid">
          <div class="main-card">
            <div class="card-header">
              <h3>{{ t('net.taoCardTitle') }}</h3>
              <span class="card-subtitle">{{ t('net.taoPanelSubtitle') }}</span>
            </div>

            <div v-if="!taoConnected" class="tao-connect-section">
              <div class="input-group">
                <label>{{ t('net.playerName') }}</label>
                <input
                  v-model="taoPlayerName"
                  type="text"
                  :placeholder="t('net.playerNamePlaceholder')"
                  @keyup.enter="taoConnect"
                />
              </div>
              <button class="primary-btn" @click="taoConnect">
                {{ t('net.connectTao') }}
              </button>
            </div>

            <div v-else class="tao-connected-section">
              <div class="user-info-bar">
                <span class="status-dot"></span>
                <span>{{ taoPlayerName }}</span>
                <button class="text-btn" @click="taoConnected = false">{{ t('net.disconnectShort') }}</button>
              </div>

              <div v-if="!taoCurrentRoom" class="tao-room-actions">
                <div class="action-card tao-create" @click="taoCreateRoom">
                  <div class="action-icon">+</div>
                  <h3>{{ t('net.createRoom') }}</h3>
                  <p>{{ t('net.createRoomHint') }}</p>
                </div>

                <div class="action-card tao-join">
                  <div class="join-form-row">
                    <input
                      v-model="taoRoomCode"
                      type="text"
                      :placeholder="t('net.roomCodeInputPlaceholder')"
                      @keyup.enter="taoJoinRoom"
                    />
                    <button
                      class="primary-btn small"
                      @click="taoJoinRoom"
                      :disabled="taoIsJoining"
                    >
                      {{ taoIsJoining ? t('net.joining') : t('net.joinRoom') }}
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="taoCurrentRoom" class="tao-current-room">
                <div class="room-info-banner">
                  <div class="room-head">
                    <h3>{{ t('net.currentRoom') }}</h3>
                    <span class="room-code-pill">{{ taoCurrentRoom.code }}</span>
                  </div>
                  <div class="room-details-row">
                    <div class="detail-col">
                      <span class="detail-label">{{ t('net.host') }}</span>
                      <span class="detail-value">{{ taoCurrentRoom.hostName }}</span>
                    </div>
                    <div class="detail-col">
                      <span class="detail-label">{{ t('net.playerCount') }}</span>
                      <span class="detail-value">1/{{ taoCurrentRoom.maxPlayers || 8 }}</span>
                    </div>
                    <div class="detail-col">
                      <span class="detail-label">{{ t('net.status') }}</span>
                      <span class="detail-value success">{{ t('net.statusRunning') }}</span>
                    </div>
                  </div>
                  <div class="room-action-row">
                    <button class="primary-btn" @click="taoLaunchGame">{{ t('net.launchGame') }}</button>
                    <button class="secondary-btn" @click="taoLeaveRoom">{{ t('net.leaveRoom') }}</button>
                  </div>
                </div>
              </div>

              <div v-if="!taoCurrentRoom && taoRoomList.length > 0" class="tao-room-list">
                <h4>{{ t('net.availableRooms') }}</h4>
                <div class="room-item-list">
                  <div
                    v-for="room in taoRoomList"
                    :key="room.code"
                    class="room-item-row"
                    @click="taoRoomCode = room.code; taoJoinRoom()"
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
      </div>
    </Transition>

    <!-- 日志区域（陶瓦联机不显示） -->
    <div v-if="activeTab !== 'tao'" class="log-section">
      <div class="log-header-bar">
        <div class="log-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <span>{{ t('net.runningLogs') }}</span>
          <span class="log-source">{{ activeTab === 'frp' ? 'FRP' : 'EasyTier' }}</span>
        </div>
        <button class="text-btn" @click="clearCurrentLogs">{{ t('net.clearLogs') }}</button>
      </div>
      <div class="log-body" ref="logContentRef">
        <div 
          v-for="(log, idx) in currentLogs" 
          :key="idx" 
          class="log-entry"
          :class="'log-' + log.level"
        >
          <span class="log-ts">{{ log.timestamp }}</span>
          <span class="log-lvl">{{ logLevelLabel(log.level) }}</span>
          <span class="log-msg">{{ log.message }}</span>
        </div>
        <div v-if="currentLogs.length === 0" class="log-empty-state">
          {{ t('net.noLogsHint') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFrpStore } from '../stores/frp'
import { useEasyTierStore } from '../stores/easytier'
import { useP2PStore } from '../stores/p2p'

const frpStore = useFrpStore()
const easytierStore = useEasyTierStore()
const p2pStore = useP2PStore()
const { t } = useI18n()

const activeTab = ref<'p2p' | 'frp' | 'easytier' | 'tao'>('p2p')
const logContentRef = ref<HTMLElement | null>(null)
const showCustomFrp = ref(false)
const securityBannerCollapsed = ref(false)

// 陶瓦联机状态
const taoConnected = ref(false)
const taoPlayerName = ref('')
const taoRoomCode = ref('')
const taoRoomList = ref<any[]>([])
const taoIsCreating = ref(false)
const taoIsJoining = ref(false)
const taoCurrentRoom = ref<any>(null)
const taoApiUrl = 'https://api.tao.cloud'

// 危险端口黑名单（禁止映射）
const DANGEROUS_PORTS = [22, 23, 80, 81, 443, 3389, 445, 135, 139, 8080, 8081, 3306, 6379, 27017]
const isDangerousPort = (port: number): boolean => DANGEROUS_PORTS.includes(port)

const joinRoomCode = ref('')
const copiedCode = ref(false)

const customFrpAddr = ref('')
const customFrpPort = ref(7000)
const customFrpToken = ref('')
const showToken = ref(false)

const getTokenPlaceholder = (): string => {
  const nodeId = frpStore.selectedNodeId
  if (nodeId === 'sakura') return t('net.tokenPhSakura')
  if (nodeId === 'locyan') return t('net.tokenPhLocyan')
  if (nodeId === 'chml') return t('net.tokenPhChml')
  if (nodeId === 'me') return t('net.tokenPhMe')
  return t('net.tokenPhDefault')
}

const toggleTokenVisibility = () => {
  showToken.value = !showToken.value
}

const currentLogs = computed(() => {
  if (activeTab.value === 'p2p') return p2pStore.logs
  return activeTab.value === 'frp' ? frpStore.logs : easytierStore.logs
})

const copyRoomCode = async () => {
  try {
    await navigator.clipboard.writeText(p2pStore.roomCode)
    copiedCode.value = true
    setTimeout(() => copiedCode.value = false, 2000)
  } catch (_) {}
}

const createRoom = async () => {
  try {
    await p2pStore.createRoom()
  } catch (_) {}
}

const joinRoom = async () => {
  if (!joinRoomCode.value.trim()) return
  try {
    await p2pStore.joinRoom(joinRoomCode.value.trim())
  } catch (_) {}
}

// ===== 陶瓦联机函数 =====
const taoConnect = async () => {
  if (!taoPlayerName.value.trim()) {
    alert(t('net.alertEnterPlayerName'))
    return
  }
  try {
    const response = await fetch(`${taoApiUrl}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: taoPlayerName.value })
    })
    if (response.ok) {
      taoConnected.value = true
      await taoFetchRooms()
    }
  } catch (error) {
    console.error('连接失败:', error)
    alert(t('net.alertConnectFailed'))
  }
}

const taoFetchRooms = async () => {
  try {
    const response = await fetch(`${taoApiUrl}/rooms`)
    if (response.ok) {
      taoRoomList.value = await response.json()
    }
  } catch (error) {
    console.error('获取房间列表失败:', error)
  }
}

const taoCreateRoom = async () => {
  if (!taoPlayerName.value.trim()) {
    alert(t('net.alertEnterPlayerName'))
    return
  }
  taoIsCreating.value = true
  try {
    const response = await fetch(`${taoApiUrl}/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: taoPlayerName.value })
    })
    if (response.ok) {
      const data = await response.json()
      taoCurrentRoom.value = data
      taoRoomCode.value = data.code
    }
  } catch (error) {
    console.error('创建房间失败:', error)
    alert(t('net.alertCreateRoomFailed'))
  } finally {
    taoIsCreating.value = false
  }
}

const taoJoinRoom = async () => {
  if (!taoRoomCode.value.trim()) {
    alert(t('net.alertEnterRoomCode'))
    return
  }
  taoIsJoining.value = true
  try {
    const response = await fetch(`${taoApiUrl}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: taoRoomCode.value, name: taoPlayerName.value })
    })
    if (response.ok) {
      const data = await response.json()
      taoCurrentRoom.value = data
    } else {
      alert(t('net.alertRoomNotFound'))
    }
  } catch (error) {
    console.error('加入房间失败:', error)
    alert(t('net.alertJoinRoomFailed'))
  } finally {
    taoIsJoining.value = false
  }
}

const taoLeaveRoom = () => {
  taoCurrentRoom.value = null
  taoRoomCode.value = ''
}

const taoLaunchGame = () => {
  if (taoCurrentRoom.value) {
    const serverAddress = `${taoCurrentRoom.value.host}:${taoCurrentRoom.value.port}`
    alert(t('net.alertLaunchingGame', { server: serverAddress, code: taoCurrentRoom.value.code }))
  }
}

watch(currentLogs, async () => {
  await nextTick()
  if (logContentRef.value) {
    logContentRef.value.scrollTop = logContentRef.value.scrollHeight
  }
}, { deep: true })

onMounted(() => {
  frpStore.checkDownloaded()
  easytierStore.checkDownloaded()
})

const updateCustomNode = () => {
  const customNode = frpStore.nodes.find(n => n.id === 'custom')
  if (customNode) {
    customNode.serverAddr = customFrpAddr.value
    customNode.serverPort = customFrpPort.value
    customNode.token = customFrpToken.value
  }
}

const applyCustomNode = () => {
  updateCustomNode()
  frpStore.selectedNodeId = 'custom'
}

const downloadFrp = async () => {
  await frpStore.downloadFrpc()
}

const downloadEasyTier = async () => {
  await easytierStore.downloadEasyTier()
}

const startFrpTunnel = async () => {
  const localPort = frpStore.tunnels[0]?.localPort
  if (localPort && isDangerousPort(localPort)) {
    alert(t('net.alertDangerousPort', { port: localPort }))
    return
  }
  if (!frpStore.customToken?.trim() && frpStore.selectedNodeId !== 'custom') {
    const ok = confirm(t('net.confirmNoToken', { node: frpStore.selectedNode?.name || 'FRP' }))
    if (!ok) return
  }
  await frpStore.startTunnel()
}

const stopFrpTunnel = async () => {
  await frpStore.stopTunnel()
}

const startEasyTier = async () => {
  await easytierStore.startNetwork()
}

const stopEasyTier = async () => {
  await easytierStore.stopNetwork()
}

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch (e) {
    console.error('复制失败:', e)
  }
}

const clearCurrentLogs = () => {
  if (activeTab.value === 'frp') {
    frpStore.clearLogs()
  } else {
    easytierStore.clearLogs()
  }
}

const logLevelLabel = (level: string): string => {
  const map: Record<string, string> = {
    info: 'INFO',
    success: 'OK',
    error: 'ERR',
    warn: 'WARN'
  }
  return map[level] || level.toUpperCase()
}
</script>

<style scoped>
.network-panel {
  width: 100%;
  height: 100%;
  background: var(--bg-primary);
  padding: 20px 28px;
  overflow-y: auto;
  box-sizing: border-box;
}

/* 安全横幅 */
.security-banner {
  background: linear-gradient(135deg, rgba(231, 76, 60, 0.1) 0%, rgba(243, 156, 18, 0.08) 100%);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: var(--border-radius-lg);
  margin-bottom: 16px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.security-banner.collapsed {
  background: rgba(231, 76, 60, 0.06);
}

.security-banner-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  cursor: pointer;
  user-select: none;
}

.security-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.security-icon svg {
  width: 20px;
  height: 20px;
}

.security-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.security-label {
  font-size: 14px;
  font-weight: 700;
  color: #e74c3c;
}

.security-subtitle {
  font-size: 11px;
  color: var(--text-tertiary);
}

.security-collapse-arrow {
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
  transition: transform 0.25s ease;
}

.security-collapse-arrow.open {
  transform: rotate(180deg);
}

.security-banner-content {
  padding: 0 18px 16px;
  animation: slideDown 0.25s ease;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.security-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.security-item {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--border-radius-md);
  border: 1px solid var(--border-color);
}

.security-item-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.security-item-icon svg {
  width: 16px;
  height: 16px;
}

.security-item-icon.warn {
  background: rgba(243, 156, 18, 0.15);
  color: #f39c12;
}

.security-item-icon.danger {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}

.security-item-icon.info {
  background: rgba(52, 152, 219, 0.15);
  color: #3498db;
}

.security-item-icon.success {
  background: rgba(46, 204, 113, 0.15);
  color: #2ecc71;
}

.security-item-text h4 {
  margin: 0 0 4px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.security-item-text p {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

/* 连接请求对话框 */
.connection-request {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20px;
}

.request-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(52, 152, 219, 0.12);
  color: #3498db;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  animation: pulse-ring 2s ease-in-out infinite;
}

.request-icon svg {
  width: 28px;
  height: 28px;
}

@keyframes pulse-ring {
  0%, 100% { box-shadow: 0 0 0 0 rgba(52, 152, 219, 0.4); }
  50% { box-shadow: 0 0 0 12px rgba(52, 152, 219, 0); }
}

.connection-request h4 {
  margin: 0 0 6px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.connection-request p {
  margin: 0 0 20px 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.request-actions {
  display: flex;
  gap: 10px;
}

.request-actions .btn {
  padding: 10px 24px;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--border-radius-sm);
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.request-actions .btn.primary {
  background: #2ecc71;
  color: #fff;
}

.request-actions .btn.primary:hover {
  background: #27ae60;
}

.request-actions .btn.danger {
  background: #e74c3c;
  color: #fff;
}

.request-actions .btn.danger:hover {
  background: #c0392b;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header-title h2 {
  margin: 0 0 2px 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.header-title p {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.header-status {
  display: flex;
  gap: 8px;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  font-size: 11px;
  color: var(--text-tertiary);
  transition: all 0.2s;
}

.status-pill.active {
  background: rgba(46, 204, 113, 0.1);
  border-color: rgba(46, 204, 113, 0.3);
  color: #2ecc71;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
}

.status-pill.active .status-dot {
  background: #2ecc71;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* 方案选择卡片 */
.method-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.method-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.method-card:hover {
  border-color: var(--text-tertiary);
  transform: translateY(-1px);
}

.method-card.active {
  border-color: var(--accent-primary);
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, transparent 100%);
}

.method-card.et-card.active {
  border-color: #9b59b6;
  background: linear-gradient(135deg, rgba(155, 89, 182, 0.08) 0%, transparent 100%);
}

.method-card.p2p-card.active {
  border-color: #2ecc71;
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.08) 0%, transparent 100%);
}

.method-card.tao-card.active {
  border-color: #f39c12;
  background: linear-gradient(135deg, rgba(243, 156, 18, 0.08) 0%, transparent 100%);
}

.method-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 212, 255, 0.12);
  color: var(--accent-primary);
  flex-shrink: 0;
}

.method-icon.et {
  background: rgba(155, 89, 182, 0.12);
  color: #9b59b6;
}

.method-icon.p2p {
  background: rgba(46, 204, 113, 0.12);
  color: #2ecc71;
}

.method-icon.tao {
  background: rgba(243, 156, 18, 0.12);
  color: #f39c12;
}

.method-icon svg {
  width: 22px;
  height: 22px;
}

.method-info h3 {
  margin: 0 0 3px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.method-info p {
  margin: 0 0 6px 0;
  font-size: 11px;
  color: var(--text-tertiary);
}

.method-tags {
  display: flex;
  gap: 4px;
}

.tag {
  padding: 2px 8px;
  background: var(--bg-hover);
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-secondary);
}

.method-running-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 3px 8px;
  background: #2ecc71;
  color: #fff;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}

.method-running-badge.et {
  background: #9b59b6;
}

.method-running-badge.p2p {
  background: #2ecc71;
}

.method-running-badge.tao {
  background: #f39c12;
}

.tag.recommended {
  background: rgba(46, 204, 113, 0.15);
  color: #2ecc71;
}

/* 主内容 */
.tab-content {
  display: block;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 16px;
  margin-bottom: 16px;
}

.main-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: 20px;
}

.side-card {
  display: flex;
  flex-direction: column;
}

.card-header {
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
}

.card-header h3 {
  margin: 0 0 2px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 下载进度 */
.download-progress {
  padding: 16px;
  background: var(--bg-primary);
  border-radius: var(--border-radius-md);
  margin-bottom: 16px;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.progress-bar {
  height: 6px;
  background: var(--bg-hover);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-fill.et {
  background: #9b59b6;
}

/* 下载区域 */
.download-section {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;
  background: var(--bg-primary);
  border-radius: var(--border-radius-md);
}

.download-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(0, 212, 255, 0.12);
  color: var(--accent-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.download-icon.et {
  background: rgba(155, 89, 182, 0.12);
  color: #9b59b6;
}

.download-icon svg {
  width: 24px;
  height: 24px;
}

.download-text {
  flex: 1;
}

.download-text h4 {
  margin: 0 0 3px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.download-text p {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 方法内安全提示 */
.method-security-tip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--border-radius-md);
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.method-security-tip svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 1px;
}

.method-security-tip strong {
  color: var(--text-primary);
  font-weight: 600;
}

.method-security-tip.frp {
  background: rgba(231, 76, 60, 0.08);
  border: 1px solid rgba(231, 76, 60, 0.2);
  color: rgba(231, 76, 60, 0.9);
}

.method-security-tip.frp svg {
  color: #e74c3c;
}

.method-security-tip.et {
  background: rgba(155, 89, 182, 0.08);
  border: 1px solid rgba(155, 89, 182, 0.2);
  color: rgba(155, 89, 182, 0.9);
}

.method-security-tip.et svg {
  color: #9b59b6;
}

/* 配置区 */
.config-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.node-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.node-card {
  position: relative;
  padding: 12px;
  background: var(--bg-primary);
  border: 1.5px solid var(--border-color);
  border-radius: var(--border-radius-md);
  cursor: pointer;
  transition: all 0.15s;
}

.node-card:hover {
  border-color: var(--text-tertiary);
}

.node-card.active {
  border-color: var(--accent-primary);
  background: rgba(0, 212, 255, 0.06);
}

.node-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 3px;
}

.node-desc {
  font-size: 10px;
  color: var(--text-tertiary);
}

.node-free-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 1px 6px;
  background: rgba(46, 204, 113, 0.15);
  color: #2ecc71;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
}

.config-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.config-field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.config-field input,
.form-select {
  padding: 9px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.config-field input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.field-hint {
  font-size: 10px;
  color: var(--text-tertiary);
}

.inline-link {
  color: var(--accent-primary);
  cursor: pointer;
  text-decoration: none;
  user-select: none;
}

.inline-link:hover {
  text-decoration: underline;
}

.token-field input {
  font-family: 'Cascadia Mono', 'Courier New', monospace;
  letter-spacing: 0.5px;
}

/* 自定义节点 */
.custom-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.custom-toggle:hover {
  border-color: var(--text-tertiary);
}

.toggle-arrow {
  width: 16px;
  height: 16px;
  transition: transform 0.2s;
}

.toggle-arrow.open {
  transform: rotate(180deg);
}

.custom-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: var(--border-radius-sm);
}

.custom-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.apply-btn {
  align-self: flex-end;
  color: var(--accent-primary);
}

/* 操作区 */
.action-area {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.primary-btn,
.danger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--border-radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.primary-btn {
  background: var(--accent-primary);
  color: #000;
}

.primary-btn:hover:not(:disabled) {
  background: #00b8e6;
}

.primary-btn.et {
  background: #9b59b6;
  color: #fff;
}

.primary-btn.et:hover:not(:disabled) {
  background: #8e44ad;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary-btn.huge {
  width: 100%;
  padding: 14px 24px;
  font-size: 14px;
  border-radius: var(--border-radius-md);
}

.primary-btn svg,
.danger-btn svg {
  width: 16px;
  height: 16px;
}

.danger-btn {
  background: #e74c3c;
  color: #fff;
}

.danger-btn:hover {
  background: #c0392b;
}

.danger-btn.huge {
  width: 100%;
  padding: 14px 24px;
  font-size: 14px;
  border-radius: var(--border-radius-md);
}

.outline-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 16px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.outline-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.outline-btn.full-width {
  width: 100%;
  margin-top: 4px;
}

.text-btn {
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
}

.text-btn:hover {
  color: var(--text-primary);
}

/* 结果面板 */
.result-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.result-panel.success {
  background: linear-gradient(180deg, rgba(46, 204, 113, 0.08) 0%, var(--bg-secondary) 40%);
  border-color: rgba(46, 204, 113, 0.3);
}

.result-panel.success.et {
  background: linear-gradient(180deg, rgba(155, 89, 182, 0.08) 0%, var(--bg-secondary) 40%);
  border-color: rgba(155, 89, 182, 0.3);
}

.result-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #2ecc71;
}

.result-panel.success.et .result-status {
  color: #9b59b6;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #2ecc71;
  box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.4);
  animation: pulseDot 2s infinite;
}

.pulse-dot.et {
  background: #9b59b6;
  box-shadow: 0 0 0 0 rgba(155, 89, 182, 0.4);
}

@keyframes pulseDot {
  0% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.4); }
  70% { box-shadow: 0 0 0 8px rgba(46, 204, 113, 0); }
  100% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0); }
}

.result-panel.success.et .pulse-dot {
  animation: pulseDotEt 2s infinite;
}

@keyframes pulseDotEt {
  0% { box-shadow: 0 0 0 0 rgba(155, 89, 182, 0.4); }
  70% { box-shadow: 0 0 0 8px rgba(155, 89, 182, 0); }
  100% { box-shadow: 0 0 0 0 rgba(155, 89, 182, 0); }
}

.result-divider {
  height: 1px;
  background: var(--border-color);
}

.result-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-field label {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.copy-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.copy-row code {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  font-family: 'Cascadia Mono', 'Courier New', monospace;
  font-size: 12px;
  color: var(--accent-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-icon-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.copy-icon-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.copy-icon-btn svg {
  width: 14px;
  height: 14px;
}

.result-tip {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: var(--border-radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.result-tip svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--accent-primary);
  margin-top: 2px;
}

.result-tip.et svg {
  color: #9b59b6;
}

.result-tip p {
  margin: 0;
}

/* idle 状态 */
.result-panel.idle {
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 260px;
}

.idle-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--bg-primary);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.idle-icon.et {
  color: rgba(155, 89, 182, 0.5);
}

.idle-icon svg {
  width: 28px;
  height: 28px;
}

.result-panel.idle h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-primary);
}

.result-panel.idle p {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* peer 列表 */
.peer-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.peer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-primary);
  border-radius: var(--border-radius-sm);
}

.peer-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-tertiary);
  flex-shrink: 0;
}

.peer-dot.online {
  background: #2ecc71;
}

.peer-name {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
}

.peer-ip {
  margin-left: auto;
  font-family: 'Cascadia Mono', 'Courier New', monospace;
  font-size: 11px;
  color: var(--text-tertiary);
}

/* 日志区 */
.log-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
}

.log-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
}

.log-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.log-title-row svg {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
}

.log-source {
  padding: 2px 8px;
  background: var(--bg-primary);
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.log-body {
  height: 160px;
  overflow-y: auto;
  padding: 10px 14px;
  font-family: 'Cascadia Mono', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.8;
}

.log-entry {
  display: flex;
  gap: 8px;
}

.log-ts {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.log-lvl {
  font-weight: 700;
  width: 36px;
  flex-shrink: 0;
}

.log-info .log-lvl { color: #3498db; }
.log-success .log-lvl { color: #2ecc71; }
.log-error .log-lvl { color: #e74c3c; }
.log-warn .log-lvl { color: #f39c12; }

.log-msg {
  color: var(--text-secondary);
  word-break: break-all;
}

.log-empty-state {
  color: var(--text-tertiary);
  text-align: center;
  padding: 36px 0;
  font-size: 12px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ========== P2P 面板样式 */
.p2p-actions {
  display: flex;
  gap: 16px;
  align-items: stretch;
}

.p2p-action-card {
  flex: 1;
  padding: 24px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: all 0.2s;
}

.p2p-action-card:hover {
  border-color: var(--text-tertiary);
}

.action-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.action-icon svg {
  width: 28px;
  height: 28px;
}

.action-icon.host {
  background: rgba(46, 204, 113, 0.12);
  color: #2ecc71;
}

.action-icon.client {
  background: rgba(52, 152, 219, 0.12);
  color: #3498db;
}

.p2p-action-card h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.p2p-action-card p {
  margin: 0 0 16px 0;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.p2p-divider {
  display: flex;
  align-items: center;
  padding: 0 4px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.join-input-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.room-code-input {
  flex: 1;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  font-family: 'Cascadia Mono', monospace;
  letter-spacing: 2px;
  text-align: center;
  text-transform: uppercase;
  outline: none;
  transition: all 0.15s;
}

.room-code-input:focus {
  border-color: var(--accent-primary);
}

.btn.big {
  padding: 12px 28px;
  font-size: 14px;
  width: 100%;
}

.p2p-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

.p2p-loading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.p2p-connected {
  padding: 8px 0;
}

.connected-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 20px;
}

.connected-badge.host {
  background: rgba(46, 204, 113, 0.12);
  color: #2ecc71;
}

.connected-badge.client {
  background: rgba(52, 152, 219, 0.12);
  color: #3498db;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

.room-code-display {
  margin-bottom: 20px;
}

.room-code-display label {
  display: block;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.room-code-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}

.room-code-box.simple {
  justify-content: center;
}

.room-code-text {
  flex: 1;
  font-size: 28px;
  font-weight: 700;
  font-family: 'Cascadia Mono', monospace;
  letter-spacing: 8px;
  color: var(--text-primary);
  text-align: center;
}

.hint-box {
  padding: 16px;
  background: rgba(52, 152, 219, 0.08);
  border: 1px solid rgba(52, 152, 219, 0.2);
  border-radius: var(--border-radius-sm);
  margin-bottom: 20px;
}

.hint-box p {
  margin: 0 0 6px 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.hint-box p:last-child {
  margin-bottom: 0;
}

.hint-box p.sub {
  color: var(--text-tertiary);
  font-size: 11px;
}

.hint-box p.highlight {
  padding: 8px 12px;
  background: var(--bg-primary);
  border-radius: 4px;
  font-family: 'Cascadia Mono', monospace;
}

.hint-box code {
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 3px;
  font-family: 'Cascadia Mono', monospace;
  font-size: 12px;
  color: var(--accent-primary);
}

.p2p-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  text-align: center;
}

.error-icon {
  width: 48px;
  height: 48px;
  font-size: 32px;
  color: #e74c3c;
  margin-bottom: 12px;
}

.p2p-error p {
  margin: 0 0 16px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

/* ========== 陶瓦联机面板样式 */
.tao-connect-section {
  max-width: 400px;
}

.tao-connect-section .input-group {
  margin-bottom: 16px;
}

.tao-connect-section .input-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}

.tao-connect-section .input-group input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  box-sizing: border-box;
}

.tao-connect-section .input-group input:focus {
  outline: none;
  border-color: #f39c12;
}

.tao-connected-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.user-info-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-primary);
  border-radius: var(--border-radius-sm);
  font-size: 13px;
  color: var(--text-primary);
}

.user-info-bar .status-dot {
  width: 8px;
  height: 8px;
  background: #2ecc71;
  border-radius: 50%;
}

.tao-room-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.tao-room-actions .action-card {
  padding: 18px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  cursor: pointer;
  transition: all 0.15s;
}

.tao-room-actions .action-card:hover {
  border-color: #f39c12;
}

.tao-room-actions .action-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(243, 156, 18, 0.12);
  color: #f39c12;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-bottom: 10px;
}

.tao-room-actions .action-card h3 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.tao-room-actions .action-card p {
  margin: 0 0 12px 0;
  font-size: 11px;
  color: var(--text-tertiary);
}

.join-form-row {
  display: flex;
  gap: 8px;
}

.join-form-row input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Cascadia Mono', monospace;
}

.join-form-row input:focus {
  outline: none;
  border-color: #f39c12;
}

.primary-btn.small {
  padding: 8px 14px;
  font-size: 12px;
}

.tao-current-room .room-info-banner {
  padding: 18px;
  background: linear-gradient(135deg, rgba(243, 156, 18, 0.08) 0%, var(--bg-primary) 60%);
  border: 1px solid rgba(243, 156, 18, 0.25);
  border-radius: var(--border-radius-md);
}

.tao-current-room .room-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.tao-current-room .room-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.room-code-pill {
  padding: 3px 10px;
  background: #f39c12;
  color: #000;
  border-radius: 4px;
  font-family: 'Cascadia Mono', monospace;
  font-size: 12px;
  font-weight: 600;
}

.tao-current-room .room-details-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.tao-current-room .detail-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tao-current-room .detail-label {
  font-size: 10.5px;
  color: var(--text-tertiary);
}

.tao-current-room .detail-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.tao-current-room .detail-value.success {
  color: #2ecc71;
}

.tao-current-room .room-action-row {
  display: flex;
  gap: 10px;
}

.secondary-btn {
  padding: 9px 18px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.secondary-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tao-room-list h4 {
  margin: 0 0 10px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.room-item-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.room-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}

.room-item-row:hover {
  border-color: #f39c12;
  background: rgba(243, 156, 18, 0.04);
}

.room-item-info {
  display: flex;
  gap: 14px;
  align-items: center;
}

.room-item-info .host-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.room-item-info .player-count {
  font-size: 11px;
  color: var(--text-tertiary);
}

.room-item-code {
  font-family: 'Cascadia Mono', monospace;
  font-size: 12px;
  color: #f39c12;
  font-weight: 600;
}
</style>

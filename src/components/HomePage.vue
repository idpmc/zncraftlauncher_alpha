<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useVersionsStore } from '../stores/versions'
import { useModsStore } from '../stores/mods'
import { useAccountsStore } from '../stores/accounts'
import { useSettingsStore } from '../stores/settings'
import { useDownloadsStore } from '../stores/downloads'
import { useI18n } from 'vue-i18n'
import DownloadPanel from './DownloadPanel.vue'

const { t } = useI18n()

const getVersionTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    release: t('home.typeRelease'),
    snapshot: t('home.typeSnapshot'),
    old_alpha: 'Alpha',
    old_beta: 'Beta',
    april_fools: t('home.typeAprilFools')
  }
  return labels[type] || type
}

const versionsStore = useVersionsStore()
const modsStore = useModsStore()
const accountsStore = useAccountsStore()
const settingsStore = useSettingsStore()
const downloadsStore = useDownloadsStore()

// 系统状态
const systemStats = ref({
  memoryUsed: 0,
  memoryTotal: 0,
  diskUsedPercent: 0,
  diskUsedGB: 0,
  diskTotalGB: 0,
  gameSizeGB: 0,
  javaInstalled: false,
  javaVersion: ''
})

const loadSystemStats = async () => {
  try {
    if (window.electronAPI?.getSystemMemory) {
      const mem = await window.electronAPI.getSystemMemory()
      systemStats.value.memoryUsed = mem.used
      systemStats.value.memoryTotal = mem.total
    }
  } catch {}
  try {
    if (window.electronAPI?.getDiskUsage) {
      const disk = await window.electronAPI.getDiskUsage()
      systemStats.value.diskUsedPercent = disk.usedPercent
      systemStats.value.diskUsedGB = disk.usedGB
      systemStats.value.diskTotalGB = disk.totalGB
      systemStats.value.gameSizeGB = disk.gameSizeGB
    }
  } catch {}
  try {
    if (window.electronAPI?.checkJava) {
      // 传同一个 skipJavaCheck 开关，否则首页显示的版本和实际启动用的对不上
      const java = await window.electronAPI.checkJava(settingsStore.settings.skipJavaCheck)
      systemStats.value.javaInstalled = java?.success || false
      systemStats.value.javaVersion = java?.version ? `Java ${java.version}` : ''
    }
  } catch {}
}

onMounted(() => {
  versionsStore.verifyInstalledVersions()
  loadSystemStats()
  const statsTimer = setInterval(loadSystemStats, 30000)
  onUnmounted(() => clearInterval(statsTimer))
})

const recentVersions = computed(() => {
  return versionsStore.versions
    .filter(v => v.installed)
})

const latestInstalledVersion = computed(() => {
  return versionsStore.versions.find(v => v.installed)
})

const modCount = computed(() => modsStore.getInstalledCount())
const installedVersionCount = computed(() => versionsStore.getInstalledCount())
const accountCount = computed(() => accountsStore.offlineAccounts.length)

const currentUsername = computed(() => accountsStore.currentAccount?.username || 'Player')

const launchGame = async (versionId: string) => {
  const username = accountsStore.currentAccount?.username || 'Player'
  const result = await versionsStore.launchGame(versionId, username)
  if (result.success) {
    const shouldShowSponsor = settingsStore.incrementLaunchCount()
    if (shouldShowSponsor) {
      window.dispatchEvent(new CustomEvent('show-sponsor-dialog'))
    }
  }
}

const goToTab = (tab: string) => {
  window.dispatchEvent(new CustomEvent('navigate-tab', { detail: tab }))
}

const quickActions = computed(() => [
  { icon: '📁', label: t('home.qaVersion'), tab: 'versions', color: 'var(--accent-primary)' },
  { icon: '🧩', label: t('home.qaMods'), tab: 'mods', color: '#10b981' },
  { icon: '🌐', label: t('home.qaNetwork'), tab: 'network', color: '#3b82f6' },
  { icon: '🔧', label: t('home.qaToolbox'), tab: 'toolbox', color: '#f59e0b' },
  { icon: '⚙️', label: t('home.qaSettings'), tab: 'settings', color: '#8b5cf6' },
  { icon: '👤', label: t('home.qaAccounts'), tab: 'accounts', color: '#ec4899' }
])

const newsItems = computed(() => [

  { date: '10-17', title: t('home.news31Title'), desc: t('home.news31Desc') },

  { date: '10-17', title: t('home.news30Title'), desc: t('home.news30Desc') },

  { date: '10-16', title: t('home.news29Title'), desc: t('home.news29Desc') },

  { date: '10-16', title: t('home.news28Title'), desc: t('home.news28Desc') },

  { date: '10-15', title: t('home.news27Title'), desc: t('home.news27Desc') },

  { date: '10-15', title: t('home.news26Title'), desc: t('home.news26Desc') },

  { date: '10-15', title: t('home.news25Title'), desc: t('home.news25Desc') },

  { date: '10-15', title: t('home.news24Title'), desc: t('home.news24Desc') },

  { date: '10-15', title: t('home.news23Title'), desc: t('home.news23Desc') },

  { date: '10-14', title: t('home.news22Title'), desc: t('home.news22Desc') },

  { date: '10-14', title: t('home.news21Title'), desc: t('home.news21Desc') },

  { date: '10-14', title: t('home.news20Title'), desc: t('home.news20Desc') },

  { date: '10-14', title: t('home.news19Title'), desc: t('home.news19Desc') },

  { date: '10-14', title: t('home.news18Title'), desc: t('home.news18Desc') },

  { date: '10-14', title: t('home.news17Title'), desc: t('home.news17Desc') },

  { date: '10-14', title: t('home.news16Title'), desc: t('home.news16Desc') },

  { date: '10-14', title: t('home.news15Title'), desc: t('home.news15Desc') },

  { date: '10-14', title: t('home.news14Title'), desc: t('home.news14Desc') },

  { date: '10-13', title: t('home.news13Title'), desc: t('home.news13Desc') },

  { date: '10-13', title: t('home.news12Title'), desc: t('home.news12Desc') },

  { date: '10-13', title: t('home.news11Title'), desc: t('home.news11Desc') },

  { date: '10-13', title: t('home.news10Title'), desc: t('home.news10Desc') },

  { date: '10-12', title: t('home.news9Title'), desc: t('home.news9Desc') },
  { date: '10-12', title: t('home.news8Title'), desc: t('home.news8Desc') },
  { date: '10-11', title: t('home.news1Title'), desc: t('home.news1Desc') },
  { date: '10-11', title: t('home.news2Title'), desc: t('home.news2Desc') },
  { date: '10-05', title: t('home.news3Title'), desc: t('home.news3Desc') },
  { date: '07-30', title: t('home.news4Title'), desc: t('home.news4Desc') },
  { date: '07-17', title: t('home.news5Title'), desc: t('home.news5Desc') },
  { date: '07-15', title: t('home.news6Title'), desc: t('home.news6Desc') },
  { date: '07-10', title: t('home.news7Title'), desc: t('home.news7Desc') }
])

// ==================== 拖拽排序 ====================
const STORAGE_KEY = 'zncl_home_card_order'
const defaultCardOrder = ['quick', 'downloads', 'stats', 'actions', 'news', 'network']

const cardOrder = ref<string[]>([...defaultCardOrder])
const editMode = ref(false)
const dragOverId = ref<string | null>(null)
const draggingId = ref<string | null>(null)

const loadCardOrder = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length === defaultCardOrder.length) {
        cardOrder.value = parsed
      }
    }
  } catch {}
}

const saveCardOrder = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cardOrder.value))
  } catch {}
}

const resetCardOrder = () => {
  cardOrder.value = [...defaultCardOrder]
  saveCardOrder()
}

const onDragStart = (e: DragEvent, cardId: string) => {
  if (!editMode.value) return
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', cardId)
  draggingId.value = cardId
}

const onDragOver = (e: DragEvent, cardId: string) => {
  if (!editMode.value) return
  e.preventDefault()
  if (cardId !== draggingId.value) {
    dragOverId.value = cardId
  }
}

const onDragLeave = (e: DragEvent, cardId: string) => {
  if (dragOverId.value === cardId) {
    dragOverId.value = null
  }
}

const onDrop = (e: DragEvent, targetId: string) => {
  if (!editMode.value) return
  e.preventDefault()
  const sourceId = e.dataTransfer!.getData('text/plain')
  dragOverId.value = null
  draggingId.value = null
  
  if (sourceId && sourceId !== targetId) {
    const newOrder = [...cardOrder.value]
    const sourceIdx = newOrder.indexOf(sourceId)
    const targetIdx = newOrder.indexOf(targetId)
    if (sourceIdx !== -1 && targetIdx !== -1) {
      newOrder.splice(sourceIdx, 1)
      newOrder.splice(targetIdx, 0, sourceId)
      cardOrder.value = newOrder
      saveCardOrder()
    }
  }
}

const onDragEnd = () => {
  dragOverId.value = null
  draggingId.value = null
}

loadCardOrder()

// 入场动画
const cardsVisible = ref<Record<string, boolean>>({})
const triggerCardAnim = () => {
  cardOrder.value.forEach((id, i) => {
    setTimeout(() => {
      cardsVisible.value[id] = true
    }, 50 + i * 80)
  })
}
nextTick(() => triggerCardAnim())
watch(cardOrder, () => nextTick(() => triggerCardAnim()), { deep: true })
</script>

<template>
  <div class="home-page">
    <!-- 顶部欢迎横幅 -->
    <div class="welcome-banner">
      <div class="banner-bg">
        <div class="pixel-overlay"></div>
        <span class="cube c1"></span>
        <span class="cube c2"></span>
        <span class="cube c3"></span>
        <span class="cube c4"></span>
      </div>
      <div class="banner-content">
        <div class="welcome-left">
          <div class="welcome-greeting">
            <span class="wave">👋</span>
            <span class="greeting-text">{{ t('home.welcomeBack') }}</span>
          </div>
          <h1 class="welcome-username">{{ currentUsername }}</h1>
          <div class="welcome-stats">
            <div class="stat-pill">
              <span class="stat-pill-num">{{ installedVersionCount }}</span>
              <span class="stat-pill-label">{{ t('home.statVersions') }}</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-pill">
              <span class="stat-pill-num">{{ modCount }}</span>
              <span class="stat-pill-label">{{ t('home.statMods') }}</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-pill">
              <span class="stat-pill-num">{{ accountCount }}</span>
              <span class="stat-pill-label">{{ t('home.statAccounts') }}</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-pill">
              <span class="stat-pill-num">{{ systemStats.gameSizeGB.toFixed(1) }}G</span>
              <span class="stat-pill-label">{{ t('home.statGame') }}</span>
            </div>
          </div>
        </div>
        <div class="welcome-right">
          <button 
            v-if="latestInstalledVersion" 
            class="launch-primary-btn"
            @click="launchGame(latestInstalledVersion.directoryName || latestInstalledVersion.id)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 4 20 12 6 20 6 4"/>
            </svg>
            <span>{{ t('home.launchVersion', { v: latestInstalledVersion.id }) }}</span>
          </button>
          <button v-else class="launch-primary-btn" @click="goToTab('versions')">
            <span>{{ t('home.goInstallVersion') }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 编辑模式切换 -->
    <div class="edit-bar">
      <span class="edit-hint" v-if="editMode">{{ t('home.dragHint') }}</span>
      <span class="edit-hint" v-else>{{ t('home.editHint') }}</span>
      <div class="edit-actions">
        <button v-if="editMode" class="edit-btn reset" @click="resetCardOrder">{{ t('home.reset') }}</button>
        <button class="edit-btn toggle" @click="editMode = !editMode">
          {{ editMode ? t('home.lockLayout') : t('home.editLayout') }}
        </button>
      </div>
    </div>

    <!-- Bento Grid 主体 -->
    <div class="bento-grid">
      <template v-for="cardId in cardOrder" :key="cardId">
        
        <!-- 快速启动 -->
        <div
          v-if="cardId === 'quick'"
          class="bento-card bento-large quick-launch-card card-item"
          :class="{
            'card-visible': cardsVisible['quick'],
            'drag-over': dragOverId === 'quick',
            'is-dragging': draggingId === 'quick',
            'editing': editMode
          }"
          draggable="true"
          @dragstart="onDragStart($event, 'quick')"
          @dragover="onDragOver($event, 'quick')"
          @dragleave="onDragLeave($event, 'quick')"
          @drop="onDrop($event, 'quick')"
          @dragend="onDragEnd"
        >
          <div class="card-head">
            <h3>{{ t('home.quickLaunch') }}</h3>
            <button class="card-link" @click="goToTab('versions')">{{ t('home.viewAll') }}</button>
          </div>
          
          <div v-if="recentVersions.length > 0" class="quick-versions">
            <div
              v-for="version in recentVersions"
              :key="version.directoryName || version.id"
              class="quick-ver-item"
              @click="launchGame(version.directoryName || version.id)"
            >
              <div class="ver-icon">
                <span class="ver-letter">{{ version.id.charAt(0) }}</span>
              </div>
              <div class="ver-meta">
                <span class="ver-name">{{ version.id }}</span>
                <span class="ver-type" :class="`type-${version.type}`">
                  {{ getVersionTypeLabel(version.type) }}
                </span>
              </div>
              <div class="ver-play">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="8 5 19 12 8 19 8 5"/>
                </svg>
              </div>
            </div>
          </div>

          <div v-else class="empty-quick">
            <span class="empty-emoji">📦</span>
            <p>{{ t('home.noVersions') }}</p>
            <button class="empty-btn" @click="goToTab('versions')">{{ t('home.goInstall') }}</button>
          </div>
        </div>

        <!-- 下载状态 -->
        <div
          v-if="cardId === 'downloads'"
          class="bento-card download-card-wrapper card-item"
          :class="{
            'card-visible': cardsVisible['downloads'],
            'drag-over': dragOverId === 'downloads',
            'is-dragging': draggingId === 'downloads',
            'editing': editMode
          }"
          draggable="true"
          @dragstart="onDragStart($event, 'downloads')"
          @dragover="onDragOver($event, 'downloads')"
          @dragleave="onDragLeave($event, 'downloads')"
          @drop="onDrop($event, 'downloads')"
          @dragend="onDragEnd"
        >
          <DownloadPanel />
        </div>

        <!-- 系统状态 -->
        <div
          v-if="cardId === 'stats'"
          class="bento-card stats-card card-item"
          :class="{
            'card-visible': cardsVisible['stats'],
            'drag-over': dragOverId === 'stats',
            'is-dragging': draggingId === 'stats',
            'editing': editMode
          }"
          draggable="true"
          @dragstart="onDragStart($event, 'stats')"
          @dragover="onDragOver($event, 'stats')"
          @dragleave="onDragLeave($event, 'stats')"
          @drop="onDrop($event, 'stats')"
          @dragend="onDragEnd"
        >
          <div class="card-head">
            <h3>{{ t('home.systemStatus') }}</h3>
          </div>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-label">
                <span>{{ t('home.memory') }}</span>
                <span class="stat-val">{{ systemStats.memoryUsed.toFixed(1) }} / {{ systemStats.memoryTotal.toFixed(1) }} GB</span>
              </div>
              <div class="stat-bar"><div class="stat-bar-fill mem" :style="{ width: systemStats.memoryTotal > 0 ? (systemStats.memoryUsed / systemStats.memoryTotal * 100) + '%' : '0%' }"></div></div>
            </div>
            <div class="stat-item">
              <div class="stat-label">
                <span>{{ t('home.disk') }}</span>
                <span class="stat-val">{{ systemStats.diskUsedGB }} / {{ systemStats.diskTotalGB }} GB</span>
              </div>
              <div class="stat-bar"><div class="stat-bar-fill disk" :style="{ width: systemStats.diskUsedPercent + '%' }"></div></div>
            </div>
            <div class="stat-item">
              <div class="stat-label">
                <span>☕ Java</span>
                <span class="stat-val" :class="{ ok: systemStats.javaInstalled, warn: !systemStats.javaInstalled }">
                  {{ systemStats.javaInstalled ? (systemStats.javaVersion || t('home.javaInstalled')) : t('home.javaNotDetected') }}
                </span>
              </div>
            </div>
            <div class="stat-item">
              <div class="stat-label">
                <span>{{ t('home.gameDir') }}</span>
                <span class="stat-val">{{ systemStats.gameSizeGB.toFixed(1) }} GB</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 快捷操作 -->
        <div
          v-if="cardId === 'actions'"
          class="bento-card actions-card card-item"
          :class="{
            'card-visible': cardsVisible['actions'],
            'drag-over': dragOverId === 'actions',
            'is-dragging': draggingId === 'actions',
            'editing': editMode
          }"
          draggable="true"
          @dragstart="onDragStart($event, 'actions')"
          @dragover="onDragOver($event, 'actions')"
          @dragleave="onDragLeave($event, 'actions')"
          @drop="onDrop($event, 'actions')"
          @dragend="onDragEnd"
        >
          <div class="card-head">
            <h3>{{ t('home.quickAccess') }}</h3>
          </div>
          <div class="actions-list">
            <button
              v-for="action in quickActions"
              :key="action.tab"
              class="action-btn-item"
              @click="goToTab(action.tab)"
            >
              <span class="action-ico" :style="{ background: `color-mix(in srgb, ${action.color} 15%, transparent)`, color: action.color }">
                {{ action.icon }}
              </span>
              <span class="action-label">{{ action.label }}</span>
            </button>
          </div>
        </div>

        <!-- 资讯 -->
        <div
          v-if="cardId === 'news'"
          class="bento-card news-card card-item"
          :class="{
            'card-visible': cardsVisible['news'],
            'drag-over': dragOverId === 'news',
            'is-dragging': draggingId === 'news',
            'editing': editMode
          }"
          draggable="true"
          @dragstart="onDragStart($event, 'news')"
          @dragover="onDragOver($event, 'news')"
          @dragleave="onDragLeave($event, 'news')"
          @drop="onDrop($event, 'news')"
          @dragend="onDragEnd"
        >
          <div class="card-head">
            <h3>{{ t('home.newsTitle') }}</h3>
          </div>
          <div class="news-scroll">
            <div 
              v-for="(item, i) in newsItems" 
              :key="i" 
              class="news-row"
            >
              <span class="news-tag">{{ item.date }}</span>
              <div class="news-body">
                <span class="news-title">{{ item.title }}</span>
                <span class="news-desc">{{ item.desc }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 联机 -->
        <div
          v-if="cardId === 'network'"
          class="bento-card network-card card-item"
          :class="{
            'card-visible': cardsVisible['network'],
            'drag-over': dragOverId === 'network',
            'is-dragging': draggingId === 'network',
            'editing': editMode
          }"
          draggable="true"
          @dragstart="onDragStart($event, 'network')"
          @dragover="onDragOver($event, 'network')"
          @dragleave="onDragLeave($event, 'network')"
          @drop="onDrop($event, 'network')"
          @dragend="onDragEnd"
        >
          <div class="network-inner">
            <div class="network-ico">🌐</div>
            <div class="network-text">
              <h4>{{ t('home.multiplayer') }}</h4>
              <p>{{ t('home.networkDesc') }}</p>
            </div>
            <button class="network-btn" @click="goToTab('network')">
              {{ t('home.goMultiplayer') }}
            </button>
          </div>
        </div>

      </template>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  padding: 20px 24px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background:
    radial-gradient(1100px 560px at 85% -10%, rgba(92, 124, 250, 0.09) 0%, transparent 60%),
    radial-gradient(900px 520px at -8% 108%, rgba(64, 192, 87, 0.06) 0%, transparent 60%);
}

/* ===== 欢迎横幅 ===== */
.welcome-banner {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: var(--shadow-lg);
}

.banner-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 45%, #7048e8 100%);
}

.banner-bg::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -15%;
  width: 420px;
  height: 420px;
  background: radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 60%);
  border-radius: 50%;
}

.banner-bg::after {
  content: '';
  position: absolute;
  bottom: -80%;
  left: -10%;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 60%);
  border-radius: 50%;
}

/* 像素网格纹理 */
.pixel-overlay {
  position: absolute;
  inset: 0;
  opacity: 0.14;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,0.55) 0 1px, transparent 1px 26px),
    repeating-linear-gradient(90deg, rgba(255,255,255,0.55) 0 1px, transparent 1px 26px);
}

/* 漂浮像素方块 */
.cube {
  position: absolute;
  width: 32px;
  height: 32px;
  border-radius: 5px;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.18), 0 8px 20px rgba(0,0,0,0.25);
  animation: cubeFloat 7s ease-in-out infinite;
  backface-visibility: hidden;
  translate: 0 0;
}

.cube::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 45%, rgba(0,0,0,0.28) 100%);
}

.cube.c1 { left: 12%; top: -14px; background: #5da94f; rotate: 10deg; }
.cube.c2 { right: 20%; top: -18px; background: #8b6b4f; rotate: -8deg; animation-delay: -2s; }
.cube.c3 { right: 6%; bottom: 10%; background: #7d7d7d; rotate: 12deg; animation-delay: -4s; }
.cube.c4 { left: 42%; bottom: -10px; background: #2ea9d0; rotate: -6deg; animation-delay: -1s; }

@keyframes cubeFloat {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -12px; }
}

.banner-content {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
}

.welcome-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.welcome-greeting {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wave {
  font-size: 18px;
  display: inline-block;
  animation: wave 2s ease-in-out infinite;
  transform-origin: 70% 70%;
  backface-visibility: hidden;
}

@keyframes wave {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(14deg); }
  40% { transform: rotate(-8deg); }
  60% { transform: rotate(14deg); }
  80% { transform: rotate(-4deg); }
}

.greeting-text {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

.welcome-username {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  letter-spacing: -0.5px;
}

.welcome-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  width: fit-content;
}

.stat-pill {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.stat-pill-num {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.stat-pill-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

.stat-divider {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.25);
}

.welcome-right {
  flex-shrink: 0;
}

.launch-primary-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 26px;
  background: #fff;
  color: var(--accent-secondary);
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25), inset 0 0 0 1px rgba(255,255,255,0.6);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.launch-primary-btn:hover {
  background: #ffffff;
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3), 0 0 26px rgba(255, 255, 255, 0.45);
}

.launch-primary-btn:active {
  transform: translateY(0) scale(0.98);
}

.launch-primary-btn svg {
  width: 16px;
  height: 16px;
  filter: drop-shadow(0 2px 3px rgba(92, 124, 250, 0.4));
  backface-visibility: hidden;
}

/* ===== 编辑栏 ===== */
.edit-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.edit-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.edit-actions {
  display: flex;
  gap: 8px;
}

.edit-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.edit-btn:hover {
  border-color: var(--accent-primary);
  background: var(--bg-hover);
}

.edit-btn.reset {
  color: var(--text-secondary);
}

.edit-btn.toggle {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}

/* ===== Bento Grid ===== */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: auto auto;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.bento-card {
  position: relative;
  background: linear-gradient(160deg, var(--bg-card) 0%, var(--bg-secondary) 100%);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, opacity 0.3s ease;
  opacity: 0;
  transform: translateY(14px);
  contain: layout style;
}

.bento-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(92,124,250,0.45), transparent);
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}

.bento-card.card-visible {
  opacity: 1;
  transform: translateY(0);
}

.bento-card.card-visible:hover {
  transform: translateY(-4px);
  border-color: var(--accent-primary);
  box-shadow: var(--shadow-md), 0 10px 30px var(--accent-glow);
}

.bento-card.card-visible:hover::after {
  opacity: 1;
}

.bento-card.editing {
  cursor: grab;
  border-style: dashed;
}

.bento-card.editing:active {
  cursor: grabbing;
}

.bento-card.editing:hover {
  transform: none;
  border-color: var(--border-color);
  box-shadow: var(--shadow-sm);
}

.bento-card.drag-over {
  border-color: var(--accent-primary);
  background: var(--accent-soft);
}

.bento-card.is-dragging {
  opacity: 0.35;
  border-color: var(--accent-primary);
}

.bento-large {
  grid-column: span 2;
  grid-row: span 2;
  max-height: 480px;
  overflow: hidden;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-head h3 {
  position: relative;
  padding-left: 11px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.card-head h3::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: linear-gradient(var(--accent-primary), var(--accent-secondary));
}

.card-link {
  font-size: 12px;
  color: var(--accent-primary);
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 500;
}

/* ===== 快速启动 ===== */
.quick-versions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.quick-ver-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  backface-visibility: hidden;
}

.quick-ver-item:hover {
  background: var(--bg-hover);
  transform: translateX(4px);
  border-color: var(--accent-primary);
  box-shadow: var(--shadow-sm);
}

.ver-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(92, 124, 250, 0.4);
}

.ver-letter {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.ver-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}

.ver-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.ver-type {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  width: fit-content;
}

.type-release { background: #10b98122; color: #10b981; }
.type-snapshot { background: #8b5cf622; color: #8b5cf6; }
.type-old_alpha, .type-old_beta { background: #f59e0b22; color: #f59e0b; }
.type-april_fools { background: #ec489922; color: #ec4899; }

.ver-play {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0;
  transform: scale(0.6);
  box-shadow: 0 4px 12px rgba(92, 124, 250, 0.45);
  transition: opacity 0.2s ease, transform 0.2s ease;
  backface-visibility: hidden;
}

.quick-ver-item:hover .ver-play {
  opacity: 1;
  transform: scale(1);
}

.ver-play svg {
  width: 14px;
  height: 14px;
  margin-left: 1px;
}

.empty-quick {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
}

.empty-emoji {
  font-size: 40px;
}

.empty-quick p {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.empty-btn {
  padding: 7px 18px;
  background: var(--accent-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}

/* ===== 下载状态 ===== */
.download-card-wrapper {
  padding: 0;
  overflow: hidden;
}

.download-card-wrapper :deep(.download-panel) {
  border: none;
  border-radius: 0;
}

/* ===== 系统状态 ===== */
.stats-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.stat-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.stat-val {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 11px;
}

.stat-val.ok { color: #10b981; }
.stat-val.warn { color: #f59e0b; }

.stat-bar {
  position: relative;
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
}

.stat-bar-fill {
  position: relative;
  height: 100%;
  border-radius: 3px;
  transition: width 0.5s cubic-bezier(0.25, 0.8, 0.35, 1);
  overflow: hidden;
}

.stat-bar-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  animation: shimmer 2.4s ease-in-out infinite;
  backface-visibility: hidden;
}

.stat-bar-fill.mem { background: linear-gradient(90deg, #3b82f6, #22d3ee); }
.stat-bar-fill.disk { background: linear-gradient(90deg, #f59e0b, #fbbf24); }

/* ===== 快捷操作 ===== */
.actions-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  flex: 1;
}

.action-btn-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 4px;
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  backface-visibility: hidden;
}

.action-btn-item:hover {
  background: var(--bg-hover);
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
}

.action-ico {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.action-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
}

/* ===== 资讯 ===== */
.news-scroll {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
}

.news-row {
  display: flex;
  gap: 10px;
  padding: 9px 10px;
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  border-left: 3px solid var(--accent-primary);
  border-radius: 8px;
  transition: transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
  backface-visibility: hidden;
}

.news-row:hover {
  background: var(--bg-hover);
  transform: translateX(3px);
  border-left-color: var(--accent-secondary);
}

.news-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--accent-primary);
  background: var(--accent-soft);
  padding: 2px 7px;
  border-radius: 4px;
  height: fit-content;
  flex-shrink: 0;
}

.news-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.news-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.news-desc {
  font-size: 10px;
  color: var(--text-tertiary);
}

/* ===== 联机卡片 ===== */
.network-card {
  grid-column: span 2;
  padding: 0;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(59, 130, 246, 0.14) 100%);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.network-inner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
}

.network-ico {
  font-size: 30px;
  animation: floatUp 3.5s ease-in-out infinite;
  filter: drop-shadow(0 4px 8px rgba(16, 185, 129, 0.35));
  backface-visibility: hidden;
}

.network-text {
  flex: 1;
}

.network-text h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 3px 0;
}

.network-text p {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 0;
}

.network-btn {
  padding: 9px 18px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: #fff;
  border: none;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(92, 124, 250, 0.35);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  backface-visibility: hidden;
}

.network-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(92, 124, 250, 0.5);
}

/* 动画 */
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

@keyframes floatUp {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

/* 响应式 */
@media (max-width: 1100px) {
  .bento-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .bento-large {
    grid-column: span 2;
    grid-row: span 1;
  }
  .network-card {
    grid-column: span 2;
  }
  .actions-list {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 650px) {
  .banner-content {
    flex-direction: column;
    gap: 14px;
    align-items: flex-start;
  }
  .bento-grid {
    grid-template-columns: 1fr;
  }
  .bento-large, .network-card {
    grid-column: span 1;
  }
  .welcome-stats {
    flex-wrap: wrap;
  }
}
</style>

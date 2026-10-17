<script setup lang="ts">
import { computed, ref } from 'vue'

// 版本号来自 package.json（由 vite define 注入）
const APP_VERSION_CORE = __APP_VERSION_CORE__
const APP_LABEL = __APP_LABEL__
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings'
import { useAIStore } from '../stores/ai'

const { t } = useI18n()

const props = defineProps<{
  activeTab: string
  tabs?: { id: string; label: string; icon?: string }[]
  onLogoClick?: () => void
}>()

const settingsStore = useSettingsStore()
const aiStore = useAIStore()
const isHovered = ref(false)

const sidebarStyle = computed(() => settingsStore.settings.sidebarStyle)
const sidebarPosition = computed(() => settingsStore.settings.sidebarPosition)

const isHorizontal = computed(() => sidebarPosition.value === 'top' || sidebarPosition.value === 'bottom')

const isIconOnly = computed(() => {
  if (sidebarStyle.value === 'icon-only') return true
  if (sidebarStyle.value === 'auto') return !isHovered.value
  return false
})

const isCompact = computed(() => sidebarStyle.value === 'compact')

const emit = defineEmits<{
  (e: 'update:activeTab', value: string): void
}>()

const defaultTabs = [
  { id: 'versions', label: '版本管理', icon: 'layers' },
  { id: 'mods', label: '模组管理', icon: 'box' },
  { id: 'servers', label: '联机服务器', icon: 'server' },
  { id: 'settings', label: '设置', icon: 'settings' }
]

const displayTabs = props.tabs || defaultTabs

const getIcon = (icon: string | undefined) => {
  switch (icon) {
    case 'home':
      return `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />`
    case 'layers':
      return `<polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
              <polyline points="22 12 12 18 2 12" />
              <polyline points="2 8.5 12 15 22 8.5" />`
    case 'box':
      return `<rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />`
    case 'server':
      return `<rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
              <path d="M6 6h.01M6 18h.01" />`
    case 'cloud':
      return `<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />`
    case 'settings':
      return `<circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />`
    case 'wrench':
      return `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />`
    case 'user':
      return `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />`
    case 'users':
      return `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />`
    case 'bot':
      return `<path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              <circle cx="7.5" cy="14.5" r="1.5"/>
              <circle cx="16.5" cy="14.5" r="1.5"/>`
    case 'share':
      return `<circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />`
    default:
      return `<circle cx="12" cy="12" r="10" />`
  }
}
</script>

<template>
  <aside 
    class="sidebar" 
    :class="{ 
      'icon-only': isIconOnly, 
      'compact': isCompact,
      'auto-mode': sidebarStyle === 'auto',
      'hovered': isHovered,
      'position-left': sidebarPosition === 'left',
      'position-right': sidebarPosition === 'right',
      'position-top': sidebarPosition === 'top',
      'position-bottom': sidebarPosition === 'bottom',
      'horizontal': isHorizontal
    }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div class="sidebar-header">
      <div class="logo" @click="onLogoClick?.()">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 9h6M9 15h6" />
          </svg>
        </div>
        <span v-if="!isIconOnly" class="logo-text">ZNCL α {{ APP_VERSION_CORE }}</span>
      </div>
    </div>

    <nav class="sidebar-nav">
      <button
        v-for="tab in displayTabs"
        :key="tab.id"
        class="nav-item"
        :class="{ active: activeTab === tab.id, 'icon-only': isIconOnly }"
        @click="emit('update:activeTab', tab.id)"
        :title="tab.label"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="getIcon(tab.icon)"></svg>
        <span v-if="!isIconOnly" class="nav-label">{{ tab.label }}</span>
      </button>
    </nav>

    <div class="sidebar-ai-section">
      <button
        class="nav-item ai-btn"
        :class="{ 'icon-only': isIconOnly, active: aiStore.isPanelOpen }"
        @click="aiStore.togglePanel()"
        :title="t('ai.title')"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="getIcon('bot')"></svg>
        <span v-if="!isIconOnly" class="nav-label">{{ t('ai.title') }}</span>
        <span v-if="aiStore.isLoading && !isIconOnly" class="ai-dot"></span>
      </button>
    </div>

    <div class="sidebar-footer">
      <div class="footer-info">
        <span v-if="!isIconOnly" class="version">{{ APP_LABEL }}</span>
      </div>
    </div>

    <div v-if="sidebarStyle === 'auto'" class="expand-indicator">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 180px;
  height: 100%;
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), height 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  flex-shrink: 0;
}

.sidebar.position-right {
  border-right: none;
  border-left: 1px solid var(--border-color);
}

.sidebar.horizontal {
  width: 100%;
  height: auto;
  min-height: 56px;
  flex-direction: row;
  border-right: none;
  border-bottom: 1px solid var(--border-color);
  transition: height 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar.horizontal.position-bottom {
  border-bottom: none;
  border-top: 1px solid var(--border-color);
}

.sidebar.horizontal .sidebar-header {
  border-bottom: none;
  border-right: 1px solid var(--border-color);
  padding: 8px 12px;
}

.sidebar.horizontal.position-bottom .sidebar-header {
  border-right: 1px solid var(--border-color);
  border-bottom: none;
}

.sidebar.horizontal .sidebar-nav {
  flex-direction: row;
  padding: 6px 8px;
  overflow-x: auto;
  overflow-y: hidden;
}

.sidebar.horizontal .nav-item {
  flex-direction: column;
  padding: 8px 12px;
  min-width: 64px;
}

.sidebar.horizontal .nav-item::before {
  left: 50%;
  top: auto;
  bottom: 0;
  width: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  transform: translateX(-50%);
  transition: width 0.18s ease;
}

.sidebar.horizontal .nav-item.active::before {
  width: 20px;
  height: 3px;
}

.sidebar.horizontal .nav-label {
  font-size: 11px;
}

.sidebar.horizontal .sidebar-footer {
  border-top: none;
  border-left: 1px solid var(--border-color);
  padding: 8px 12px;
}

.sidebar.horizontal.position-bottom .sidebar-footer {
  border-left: 1px solid var(--border-color);
  border-top: none;
}

.sidebar.horizontal .expand-indicator {
  right: auto;
  left: 50%;
  top: auto;
  bottom: -8px;
  transform: translateX(-50%);
}

.sidebar.horizontal.position-bottom .expand-indicator {
  bottom: auto;
  top: -8px;
}

.sidebar.compact {
  width: 100px;
}

.sidebar.horizontal.compact {
  width: 100%;
  height: auto;
}

.sidebar.icon-only {
  width: 56px;
}

.sidebar.horizontal.icon-only {
  width: 100%;
  height: 56px;
}

.sidebar.auto-mode {
  width: 56px;
}

.sidebar.horizontal.auto-mode {
  width: 100%;
  height: 56px;
}

.sidebar.auto-mode:hover {
  width: 180px;
}

.sidebar.horizontal.auto-mode:hover {
  width: 100%;
  height: auto;
}

.sidebar.auto-mode:hover .expand-indicator {
  opacity: 0;
  transform: translateX(-5px);
}

.sidebar.compact .sidebar-header {
  padding: 12px 6px;
}

.sidebar.compact .logo {
  justify-content: center;
}

.sidebar.compact .logo-text {
  font-size: 14px;
}

.sidebar.compact .nav-item {
  padding: 10px 8px;
}

.sidebar.compact .nav-label {
  font-size: 12px;
}

.sidebar.icon-only .sidebar-header {
  padding: 12px 4px;
}

.sidebar.icon-only .logo {
  justify-content: center;
}

.sidebar.icon-only .nav-item {
  justify-content: center;
  padding: 10px 4px;
}

.sidebar-header {
  padding: 16px 8px;
  border-bottom: 1px solid var(--border-color);
  transition: padding 0.3s ease;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: var(--border-radius-sm);
  background: linear-gradient(135deg, var(--accent-soft) 0%, transparent 70%);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.logo:hover {
  background: var(--bg-hover);
  border-color: var(--border-color);
}

.logo-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-primary);
  font-size: 20px;
  flex-shrink: 0;
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-nav {
  flex: 1;
  padding: 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  color: var(--text-secondary);
  overflow: hidden;
}

/* 激活指示条 */
.nav-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 0;
  background: var(--accent-primary);
  border-radius: 0 3px 3px 0;
  transform: translateY(-50%);
  transition: height 0.18s ease;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent-soft);
  color: var(--accent-primary);
}

.nav-item.active::before {
  height: 20px;
}

.nav-item:active {
  transform: scale(0.98);
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  transition: transform 0.18s ease;
}

.nav-item:hover .nav-icon {
  transform: scale(1.08);
}

.nav-label {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.sidebar-footer {
  padding: 12px 8px;
  border-top: 1px solid var(--border-color);
  transition: padding 0.3s ease;
}

.footer-info {
  display: flex;
  align-items: center;
  justify-content: center;
}

.version {
  font-size: 11px;
  color: var(--text-muted);
}

.expand-indicator {
  position: absolute;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.expand-indicator:hover {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
}

.expand-indicator svg {
  width: 10px;
  height: 10px;
}

.sidebar.auto-mode .expand-indicator {
  right: -8px;
}

.sidebar.auto-mode:hover .expand-indicator {
  right: -8px;
}

.sidebar-ai-section {
  padding: 6px 6px 8px;
  border-top: 1px solid var(--border-color);
}

.sidebar.horizontal .sidebar-ai-section {
  border-top: none;
  border-left: 1px solid var(--border-color);
  padding: 6px 8px;
}

.ai-btn {
  position: relative;
  width: 100%;
  background: linear-gradient(135deg, var(--accent-glow) 0%, transparent 100%);
}

.ai-btn.active {
  background: linear-gradient(135deg, var(--accent-primary) 0%, #7b2ff7 100%);
  color: white;
}

.ai-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4CAF50;
  animation: pulse 1.5s ease-in-out infinite;
  margin-left: auto;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}
</style>

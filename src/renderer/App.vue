<script setup lang="ts">
import { ref, defineAsyncComponent, onMounted, computed, watch } from 'vue'
import WindowFrame from '../components/WindowFrame.vue'
import Sidebar from '../components/Sidebar.vue'
import { useSettingsStore } from '../stores/settings'
import { useVersionsStore } from '../stores/versions'
import { useModsStore } from '../stores/mods'
import { useTelemetryStore } from '../stores/telemetry'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const activeTab = ref('home')
const settingsStore = useSettingsStore()
const versionsStore = useVersionsStore()
const modsStore = useModsStore()

const allNotifications = computed(() => {
  const versionNotifs = versionsStore.notifications.map(n => ({
    ...n,
    name: n.versionName,
    store: 'versions'
  }))
  const modNotifs = modsStore.notifications.map(n => ({
    ...n,
    name: n.modName,
    store: 'mods'
  }))
  return [...versionNotifs, ...modNotifs].sort((a, b) => a.timestamp - b.timestamp)
})

const removeNotification = (id: string, store: 'versions' | 'mods') => {
  if (store === 'versions') {
    versionsStore.removeNotification(id)
  } else {
    modsStore.removeNotification(id)
  }
}

const HomePage = defineAsyncComponent(() => import('../components/HomePage.vue'))
const VersionManager = defineAsyncComponent(() => import('../components/VersionManager.vue'))
const ModManager = defineAsyncComponent(() => import('../components/ModManager.vue'))
const SettingsPanel = defineAsyncComponent(() => import('../components/SettingsPanel.vue'))
const ToolboxPanel = defineAsyncComponent(() => import('../components/ToolboxPanel.vue'))
const AccountPanel = defineAsyncComponent(() => import('../components/AccountPanel.vue'))
const SponsorDialog = defineAsyncComponent(() => import('../components/SponsorDialog.vue'))
const LegalDialog = defineAsyncComponent(() => import('../components/LegalDialog.vue'))
const AIPanel = defineAsyncComponent(() => import('../components/AIPanel.vue'))
const NetworkPanel = defineAsyncComponent(() => import('../components/NetworkPanel.vue'))

// 首次启动协议确认
const showFirstLaunchDialog = ref(false)
const doNotShowAgain = ref(false)

const checkFirstLaunch = () => {
  try {
    const hide = localStorage.getItem('zncl-agreement-hide')
    if (hide !== 'true') {
      showFirstLaunchDialog.value = true
    }
  } catch {
    showFirstLaunchDialog.value = true
  }
}

const closeFirstLaunchDialog = () => {
  if (doNotShowAgain.value) {
    try {
      localStorage.setItem('zncl-agreement-hide', 'true')
    } catch {
      // ignore
    }
  }
  showFirstLaunchDialog.value = false
}

const legalDialogTypeForFirstLaunch = ref<'user-agreement' | 'privacy-policy' | 'special-notice' | null>(null)

// 彩蛋相关
const logoClickCount = ref(0)
const showEasterEgg = ref(false)
const easterEggMessage = ref('')
const konamiActivated = ref(false)
const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA']
const konamiIndex = ref(0)

// 彩蛋消息
const easterEggMessages = computed(() => [
  t('appUi.eggDevFound'),
  t('appUi.eggCodeForever'),
  t('appUi.eggNotLooking'),
  t('appUi.eggHiddenFeature'),
  t('appUi.eggDiamond'),
  t('appUi.eggHungryBear'),
  t('appUi.eggLightning'),
  t('appUi.egg100k'),
  t('appUi.eggMysteryGift'),
  t('appUi.eggProphecy'),
  t('appUi.eggNetherPortal'),
  t('appUi.eggTenK'),
  t('appUi.eggPotatoKingdom'),
  t('appUi.eggHiddenFeature'),
  t('appUi.eggHiddenFeature')
])

const tabs = computed(() => [
  { id: 'home', label: t('tabs.home'), icon: 'home' },
  { id: 'versions', label: t('tabs.versions'), icon: 'layers' },
  { id: 'mods', label: t('tabs.mods'), icon: 'box' },
  { id: 'toolbox', label: t('tabs.toolbox'), icon: 'wrench' },
  { id: 'network', label: t('tabs.network'), icon: 'share' },
  { id: 'account', label: t('tabs.account'), icon: 'users' },
  { id: 'settings', label: t('tabs.settings'), icon: 'settings' }
])

// 当前是否浅色（用于玻璃拟态氛围色）
const isLightTheme = computed(() => {
  const t = settingsStore.settings.theme
  if (t === 'light') return true
  if (t === 'dark') return false
  return !window.matchMedia('(prefers-color-scheme: dark)').matches
})

// 玻璃拟态背景：保持「安静」——近纯色 + 极淡的一两团强调色柔光。
// 刻意不做多色渐变堆叠：彩虹渐变 + 模糊 = 糊成一团，反而是玻璃拟态大忌。
const glassBackdropLayers = (light: boolean): string[] => {
  const accent = (p: number) => `color-mix(in srgb, var(--accent-primary) ${p}%, transparent)`
  const tint = (hex: string, p: number) => `color-mix(in srgb, ${hex} ${p}%, transparent)`
  return [
    `radial-gradient(120% 95% at 6% -20%, ${accent(light ? 16 : 15)} 0%, transparent 55%)`,
    `radial-gradient(115% 95% at 108% 120%, ${tint(light ? '#93b4e0' : '#3f5c96', light ? 16 : 15)} 0%, transparent 58%)`,
    // 底色：深蓝/藏青的同色系渐变，刻意不是纯黑，也不做多色彩虹
    light
      ? `linear-gradient(200deg, #f7fafd 0%, #eef3f7 55%, #e6edf5 100%)`
      : `linear-gradient(200deg, #1d2745 0%, #141b31 55%, #0f1428 100%)`
  ]
}

// 计算背景样式
const backgroundStyle = computed(() => {
  const s = settingsStore.settings
  const style: Record<string, string> = {}

  // 玻璃拟态：安静背景 + 玻璃面板
  if (s.glassEffect) {
    const light = isLightTheme.value
    const glows = glassBackdropLayers(light)
    const calmBase = light ? '#eef3f7' : '#12172a'

    if (s.backgroundType === 'image' && s.backgroundImage) {
      // 图片背景本身有层次，保留（照片最衬毛玻璃）
      style.backgroundColor = calmBase
      style.backgroundImage = [...glows, `url(${s.backgroundImage})`].join(', ')
      style.backgroundSize = 'cover'
      style.backgroundPosition = 'center'
      style.backgroundRepeat = 'no-repeat'
    } else if (s.backgroundType === 'solid') {
      // 纯色本身就「安静」，尊重用户选择
      style.backgroundColor = s.backgroundColor
      style.backgroundImage = glows.join(', ')
    } else {
      // 渐变最容易和玻璃打架：玻璃模式改用安静的近纯色底
      style.backgroundColor = calmBase
      style.backgroundImage = glows.join(', ')
    }

    return style
  }

  // 非玻璃：保持原有行为
  switch (s.backgroundType) {
    case 'solid':
      style.background = s.backgroundColor
      break
    case 'gradient':
      style.background = s.backgroundGradient
      break
    case 'image':
      if (s.backgroundImage) {
        style.backgroundImage = `url(${s.backgroundImage})`
        style.backgroundSize = 'cover'
        style.backgroundPosition = 'center'
        style.backgroundRepeat = 'no-repeat'
      }
      break
  }

  return style
})

// 计算字体大小
const fontSizeClass = computed(() => {
  return `font-size-${settingsStore.settings.fontSize}`
})

// 侧边栏位置
const sidebarPosition = computed(() => settingsStore.settings.sidebarPosition)

// 计算强调色 CSS 变量
const accentColorStyle = computed(() => {
  return {
    '--accent-primary': settingsStore.settings.accentColor,
    '--accent-secondary': settingsStore.settings.accentColor + 'dd'
  }
})

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

const getColorBrightness = (color: string) => {
  const rgb = hexToRgb(color)
  if (!rgb) return 0
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000
}

const extractMainColor = (gradient: string) => {
  const colorMatch = gradient.match(/#[a-fA-F0-9]{6}/)
  return colorMatch ? colorMatch[0] : '#0d0d0d'
}

const autoDetectTheme = () => {
  if (!settingsStore.settings.autoThemeByBackground) return
  
  let mainColor = '#0d0d0d'
  
  switch (settingsStore.settings.backgroundType) {
    case 'solid':
      mainColor = settingsStore.settings.backgroundColor
      break
    case 'gradient':
      mainColor = extractMainColor(settingsStore.settings.backgroundGradient)
      break
    case 'image':
      return
  }
  
  const brightness = getColorBrightness(mainColor)
  const shouldBeLight = brightness > 128
  
  if (shouldBeLight && settingsStore.settings.theme !== 'light') {
    settingsStore.settings.theme = 'light'
  } else if (!shouldBeLight && settingsStore.settings.theme !== 'dark') {
    settingsStore.settings.theme = 'dark'
  }
}

const applyTheme = () => {
  const theme = settingsStore.settings.theme
  const html = document.documentElement
  
  if (theme === 'dark') {
    html.classList.remove('light')
    html.classList.add('dark')
  } else if (theme === 'light') {
    html.classList.remove('dark')
    html.classList.add('light')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      html.classList.remove('light')
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
      html.classList.add('light')
    }
  }
}

watch(() => settingsStore.settings.theme, applyTheme, { immediate: true })

// 玻璃拟态开关：把 glass 类挂到 <html>，由全局样式接管
const applyGlass = () => {
  document.documentElement.classList.toggle('glass', !!settingsStore.settings.glassEffect)
}
watch(() => settingsStore.settings.glassEffect, applyGlass, { immediate: true })

watch(() => settingsStore.settings.accentColor, (newColor) => {
  document.documentElement.style.setProperty('--accent-primary', newColor)
  document.documentElement.style.setProperty('--accent-secondary', newColor + 'dd')
})

watch(() => settingsStore.settings.fontSize, (newSize) => {
  const zoom = newSize === 'small' ? 0.9 : newSize === 'large' ? 1.1 : 1
  document.documentElement.style.zoom = String(zoom)
}, { immediate: true })

watch([
  () => settingsStore.settings.backgroundColor,
  () => settingsStore.settings.backgroundGradient,
  () => settingsStore.settings.backgroundType,
  () => settingsStore.settings.autoThemeByBackground
], () => {
  autoDetectTheme()
})

onMounted(async () => {
  const telemetryStore = useTelemetryStore()
  telemetryStore.init()
  
  checkFirstLaunch()

  // 同步当前游戏目录到主进程
  if (window.electronAPI?.getGameDir) {
    try {
      const defaultDir = await window.electronAPI.getGameDir()
      settingsStore.initDefaultGameDir(defaultDir)
      const currentDir = settingsStore.currentGameDir
      if (currentDir && currentDir.path && !currentDir.isDefault) {
        await window.electronAPI.setGameDir(currentDir.path)
      }
    } catch (e) {
      console.error('同步游戏目录失败:', e)
    }
  }

  window.addEventListener('version-download-started', () => {
    activeTab.value = 'home'
  })

  window.addEventListener('navigate-to', ((e: CustomEvent) => {
    const { tab, section } = e.detail
    if (tab) {
      activeTab.value = tab
    }
    if (section && tab === 'settings') {
      setTimeout(() => {
        const settingsEl = document.querySelector('.settings-panel')
        if (settingsEl) {
          const event = new CustomEvent('select-settings-section', { detail: { section } })
          window.dispatchEvent(event)
        }
      }, 100)
    }
  }) as EventListener)
  
  document.addEventListener('keydown', (e) => {
    if (e.code === konamiCode[konamiIndex.value]) {
      konamiIndex.value++
      if (konamiIndex.value === konamiCode.length) {
        konamiActivated.value = true
        showEasterEgg.value = true
        easterEggMessage.value = t('appUi.konamiActivated')
        konamiIndex.value = 0
        setTimeout(() => {
          showEasterEgg.value = false
        }, 5000)
      }
    } else {
      konamiIndex.value = 0
    }
  })

  // 首屏渲染后延迟初始化重任务（避免阻塞首屏）
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => {
      versionsStore.lazyInitVersions()
      setTimeout(() => {
        modsStore.initMods()
      }, 300)
    }, { timeout: 1500 })
  } else {
    setTimeout(() => {
      versionsStore.lazyInitVersions()
      setTimeout(() => {
        modsStore.initMods()
      }, 300)
    }, 500)
  }
})

// Logo点击彩蛋
const onLogoClick = () => {
  logoClickCount.value++
  if (logoClickCount.value >= 5) {
    showEasterEgg.value = true
    const randomMsg = easterEggMessages.value[Math.floor(Math.random() * easterEggMessages.value.length)]
    easterEggMessage.value = randomMsg
    logoClickCount.value = 0
    setTimeout(() => {
      showEasterEgg.value = false
    }, 3000)
  }
}
</script>

<template>
  <WindowFrame>
    <div 
      class="app-container"
      :class="[
        `sidebar-${sidebarPosition}`
      ]"
      :style="backgroundStyle"
    >
      <!-- 粒子效果层 -->
      <div v-if="settingsStore.settings.particleEffects" class="particles-container">
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
      </div>
      
      <Sidebar
        v-model:activeTab="activeTab"
        :tabs="tabs"
        :onLogoClick="onLogoClick"
      />
      <main class="main-content">
        <Transition name="page-fade" mode="out-in">
          <HomePage v-if="activeTab === 'home'" key="home" />
          <VersionManager v-else-if="activeTab === 'versions'" key="versions" />
          <ModManager v-else-if="activeTab === 'mods'" key="mods" />
          <ToolboxPanel v-else-if="activeTab === 'toolbox'" key="toolbox" />
          <NetworkPanel v-else-if="activeTab === 'network'" key="network" />
          <AccountPanel v-else-if="activeTab === 'account'" key="account" />
          <SettingsPanel v-else-if="activeTab === 'settings'" key="settings" />
        </Transition>
      </main>

      <!-- 彩蛋提示 -->
      <Transition name="easter-egg">
        <div v-if="showEasterEgg" class="easter-egg-toast">
          <span class="easter-egg-icon">{{ konamiActivated ? '🎮' : '🎁' }}</span>
          <span class="easter-egg-text">{{ easterEggMessage }}</span>
        </div>
      </Transition>

      <!-- 科乐米模式指示器 -->
      <div v-if="konamiActivated" class="konami-indicator">
        <span>{{ t('appUi.turboMode') }}</span>
      </div>

      <!-- 赞助提醒弹窗 -->
      <SponsorDialog />

      <!-- 首次启动协议确认弹窗 -->
      <Teleport to="body" v-if="showFirstLaunchDialog">
        <div class="first-launch-overlay">
          <div class="first-launch-dialog">
            <div class="first-launch-header">
              <h2 class="first-launch-title">{{ t('firstLaunch.title') }}</h2>
            </div>
            <div class="first-launch-body">
              <p class="first-launch-text">
                {{ t('firstLaunch.desc') }}
              </p>
              <div class="first-launch-links">
                <button class="first-launch-link" @click="legalDialogTypeForFirstLaunch = 'user-agreement'">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  {{ t('firstLaunch.userAgreement') }}
                </button>
                <button class="first-launch-link" @click="legalDialogTypeForFirstLaunch = 'privacy-policy'">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  {{ t('firstLaunch.privacyPolicy') }}
                </button>
                <button class="first-launch-link" @click="legalDialogTypeForFirstLaunch = 'special-notice'">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  {{ t('firstLaunch.specialNotice') }}
                </button>
              </div>
              <label class="first-launch-checkbox">
                <input type="checkbox" v-model="doNotShowAgain" />
                <span>{{ t('firstLaunch.doNotShow') }}</span>
              </label>
            </div>
            <div class="first-launch-footer">
              <button class="first-launch-btn primary" @click="closeFirstLaunchDialog">
                {{ t('firstLaunch.confirm') }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <LegalDialog :type="legalDialogTypeForFirstLaunch" @close="legalDialogTypeForFirstLaunch = null" />

      <div class="notification-container">
        <TransitionGroup name="notification">
          <div
            v-for="notif in allNotifications"
            :key="notif.id"
            class="notification-toast"
            :class="notif.type"
          >
            <div class="notification-header">
              <div class="notification-title-row">
                <span class="notification-icon">
                  <svg v-if="notif.type === 'downloading'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <svg v-else-if="notif.type === 'completed'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <svg v-else-if="notif.type === 'failed'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                </span>
                <span class="notification-app">{{ t('appUi.launcher') }}</span>
              </div>
              <div class="notification-actions">
                <button class="notification-close" @click="removeNotification(notif.id, notif.store)">×</button>
              </div>
            </div>
            <div class="notification-body">
              <div class="notification-title">{{ notif.name }}</div>
              <div v-if="notif.type === 'downloading'" class="notification-subtitle">
                <div class="mini-progress-bar">
                  <div class="mini-progress" :style="{ width: notif.progress + '%' }"></div>
                </div>
                <span>{{ notif.progress }}%</span>
              </div>
              <div v-else class="notification-subtitle">{{ notif.message }}</div>
            </div>
          </div>
        </TransitionGroup>
      </div>

      <div v-if="versionsStore.assetCheckActive" class="asset-check-banner">
        <div class="asset-check-info">
          <span class="asset-check-label">{{ versionsStore.assetCheckMessage || t('appUi.assetChecking') }}</span>
          <span v-if="versionsStore.assetCheckTotal > 0" class="asset-check-count">{{ versionsStore.assetCheckDone }}/{{ versionsStore.assetCheckTotal }}</span>
        </div>
        <div class="asset-check-bar">
          <div class="asset-check-fill" :style="{ width: versionsStore.assetCheckProgress + '%' }"></div>
        </div>
        <span class="asset-check-percent">{{ versionsStore.assetCheckProgress }}%</span>
      </div>

      <AIPanel />
    </div>
  </WindowFrame>
</template>

<style scoped>
.app-container {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
}

.app-container.sidebar-left {
  flex-direction: row;
}

.app-container.sidebar-right {
  flex-direction: row-reverse;
}

.app-container.sidebar-top {
  flex-direction: column;
}

.app-container.sidebar-bottom {
  flex-direction: column-reverse;
}

/* 粒子效果 */
.particles-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: var(--accent-primary);
  border-radius: 50%;
  opacity: 0.3;
}

.particle:nth-child(1) { left: 10%; top: 20%; }
.particle:nth-child(2) { left: 25%; top: 60%; }
.particle:nth-child(3) { left: 40%; top: 30%; }
.particle:nth-child(4) { left: 55%; top: 70%; }
.particle:nth-child(5) { left: 70%; top: 40%; }
.particle:nth-child(6) { left: 85%; top: 15%; }
.particle:nth-child(7) { left: 15%; top: 80%; }
.particle:nth-child(8) { left: 65%; top: 50%; }

.main-content {
  flex: 1;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
  position: absolute;
  width: 100%;
  height: 100%;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 彩蛋提示样式 */
.easter-egg-toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px 32px;
  border-radius: 50px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
  font-weight: 500;
  box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4);
  z-index: 9999;
  animation: easter-egg-bounce 0.5s ease;
}

.easter-egg-icon {
  font-size: 24px;
}

.easter-egg-text {
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

@keyframes easter-egg-bounce {
  0% {
    transform: translateX(-50%) scale(0);
    opacity: 0;
  }
  50% {
    transform: translateX(-50%) scale(1.1);
  }
  100% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }
}

.easter-egg-enter-active,
.easter-egg-leave-active {
  transition: all 0.3s ease;
}

.easter-egg-enter-from,
.easter-egg-leave-to {
  transform: translateX(-50%) translateY(-20px);
  opacity: 0;
}

/* 科乐米模式指示器 */
.konami-indicator {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 4px 20px rgba(245, 87, 108, 0.4);
  z-index: 9998;
  animation: konami-pulse 2s ease-in-out infinite;
}

@keyframes konami-pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

/* 首次启动协议确认弹窗 */
.first-launch-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.first-launch-dialog {
  background: var(--bg-elevated);
  border-radius: 16px;
  width: 520px;
  max-width: 90vw;
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-color);
  animation: first-launch-in 0.3s ease;
}

html.light .first-launch-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

@keyframes first-launch-in {
  0% {
    transform: scale(0.9);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.first-launch-header {
  padding: 28px 32px 0;
}

.first-launch-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.first-launch-body {
  padding: 20px 32px;
}

.first-launch-text {
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0 0 20px 0;
}

.first-launch-links {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.first-launch-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.first-launch-link:hover {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
  background: var(--bg-secondary);
}

.first-launch-link svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.first-launch-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

.first-launch-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

.first-launch-footer {
  padding: 0 32px 28px;
  display: flex;
  justify-content: center;
}

.first-launch-btn {
  padding: 12px 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.first-launch-btn.primary {
  background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
  color: white;
}

.first-launch-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--accent-glow);
}

.notification-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 10000;
  max-width: 380px;
  pointer-events: none;
}

.notification-toast {
  pointer-events: auto;
  background: var(--toast-bg);
  border: 1px solid var(--toast-border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  padding: 14px 16px;
  min-width: 320px;
  max-width: 380px;
  overflow: hidden;
  position: relative;
}

.notification-toast::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}

.notification-toast.downloading::before {
  background: var(--accent-primary);
}

.notification-toast.completed::before {
  background: var(--success);
}

.notification-toast.failed::before {
  background: var(--error);
}

.notification-toast.info::before {
  background: var(--info);
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.notification-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--toast-icon-color);
}

.notification-icon svg {
  width: 20px;
  height: 20px;
}

.notification-toast.completed .notification-icon {
  color: var(--success);
}

.notification-toast.failed .notification-icon {
  color: var(--error);
}

.notification-app {
  font-size: 14px;
  font-weight: 600;
  color: var(--toast-text);
}

.notification-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--toast-close-color);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}

.notification-close:hover {
  background: var(--toast-close-hover-bg);
  color: var(--toast-text);
}

.notification-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.notification-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--toast-text);
  line-height: 1.4;
}

.notification-subtitle {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--toast-text-secondary);
}

.mini-progress-bar {
  flex: 1;
  height: 4px;
  background: var(--toast-progress-bg);
  border-radius: 2px;
  overflow: hidden;
}

.mini-progress {
  height: 100%;
  background: var(--accent-primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.notification-toast.completed .mini-progress {
  background: var(--success);
}

.notification-toast.failed .mini-progress {
  background: var(--error);
}

.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100px);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100px);
}

.notification-move {
  transition: transform 0.3s ease;
}

.asset-check-banner {
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(20, 22, 28, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
  z-index: 9999;
  min-width: 340px;
  max-width: 90vw;
}

html.light .asset-check-banner {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}

.asset-check-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.asset-check-label {
  font-size: 13px;
  color: #e0e0e0;
  white-space: nowrap;
}

.asset-check-count {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
}

.asset-check-bar {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  min-width: 120px;
}

html.light .asset-check-bar {
  background: rgba(0, 0, 0, 0.1);
}

.asset-check-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), var(--info));
  border-radius: 3px;
  transition: width 0.3s ease;
}

.asset-check-percent {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-primary) !important;
}
</style>

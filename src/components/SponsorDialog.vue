<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings'

const { t } = useI18n()
const settingsStore = useSettingsStore()
const visible = ref(false)
const launchCount = ref(0)

const showDialog = () => {
  launchCount.value = settingsStore.gameLaunchCount
  visible.value = true
}

const hideDialog = () => {
  visible.value = false
}

const openSponsorLink = () => {
  if (settingsStore.sponsorLink) {
    window.electronAPI?.openExternal(settingsStore.sponsorLink)
  }
  settingsStore.markAsSupported()
  hideDialog()
}

const handleShowSponsor = () => {
  showDialog()
}

onMounted(() => {
  window.addEventListener('show-sponsor-dialog', handleShowSponsor)
})

onUnmounted(() => {
  window.removeEventListener('show-sponsor-dialog', handleShowSponsor)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sponsor-fade">
      <div v-if="visible" class="sponsor-overlay" @click.self="hideDialog">
        <div class="sponsor-dialog">
          <div class="sponsor-header">
            <h2 class="sponsor-title">{{ t('sponsor.launchTitle', { n: launchCount }) }}</h2>
            <div class="sponsor-progress-bar">
              <div class="sponsor-progress-fill"></div>
            </div>
          </div>
          <div class="sponsor-body">
            <p class="sponsor-text">
              {{ t('sponsor.body1Prefix') }} <strong>{{ launchCount }}</strong> {{ t('sponsor.body1Suffix') }}
            </p>
            <p class="sponsor-text">
              {{ t('sponsor.body2') }}
            </p>
            <p class="sponsor-text sponsor-hint">
              {{ t('sponsor.body3') }}
            </p>
          </div>
          <div class="sponsor-actions">
            <button class="sponsor-btn primary" @click="openSponsorLink">
              {{ t('sponsor.supportBtn') }}
            </button>
            <button class="sponsor-btn secondary" @click="hideDialog">
              {{ t('sponsor.refuseBtn') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sponsor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.sponsor-dialog {
  background: #1e1e2e;
  border-radius: 12px;
  padding: 32px;
  width: 480px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.sponsor-header {
  margin-bottom: 24px;
}

.sponsor-title {
  font-size: 32px;
  font-weight: 700;
  color: #00d4ff;
  margin: 0 0 12px 0;
}

.sponsor-progress-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.sponsor-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00d4ff, #7b2ff7);
  border-radius: 2px;
  width: 60%;
  animation: progressPulse 2s ease-in-out infinite;
}

@keyframes progressPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.sponsor-body {
  margin-bottom: 28px;
}

.sponsor-text {
  font-size: 16px;
  color: #e0e0e0;
  line-height: 1.8;
  margin: 0 0 12px 0;
}

.sponsor-text strong {
  color: #00d4ff;
  font-weight: 600;
}

.sponsor-hint {
  color: #888;
  font-size: 14px;
  margin-top: 16px;
}

.sponsor-actions {
  display: flex;
  gap: 16px;
  justify-content: flex-end;
}

.sponsor-btn {
  padding: 10px 24px;
  font-size: 15px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.sponsor-btn.primary {
  background: linear-gradient(135deg, #00d4ff 0%, #7b2ff7 100%);
  color: white;
}

.sponsor-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 212, 255, 0.3);
}

.sponsor-btn.secondary {
  background: transparent;
  color: #888;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.sponsor-btn.secondary:hover {
  color: #e0e0e0;
  border-color: rgba(255, 255, 255, 0.4);
}

.sponsor-fade-enter-active,
.sponsor-fade-leave-active {
  transition: opacity 0.25s ease;
}

.sponsor-fade-enter-active .sponsor-dialog,
.sponsor-fade-leave-active .sponsor-dialog {
  transition: all 0.25s ease;
}

.sponsor-fade-enter-from,
.sponsor-fade-leave-to {
  opacity: 0;
}

.sponsor-fade-enter-from .sponsor-dialog,
.sponsor-fade-leave-to .sponsor-dialog {
  transform: scale(0.95) translateY(20px);
  opacity: 0;
}
</style>

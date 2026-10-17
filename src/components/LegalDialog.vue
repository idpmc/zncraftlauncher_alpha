<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  type: 'user-agreement' | 'privacy-policy' | 'special-notice' | null
}>()

const emit = defineEmits<{
  close: []
}>()

const visible = ref(false)
const content = ref('')
const loading = ref(false)
const title = ref('')

const typeMap = computed<Record<string, { title: string; file: string }>>(() => ({
  'user-agreement': { title: t('legal.titleUserAgreement'), file: 'user-agreement.txt' },
  'privacy-policy': { title: t('legal.titlePrivacyPolicy'), file: 'privacy-policy.txt' },
  'special-notice': { title: t('legal.titleSpecialNotice'), file: 'special-notice.txt' }
}))

const loadContent = async () => {
  if (!props.type) return
  const config = typeMap.value[props.type]
  if (!config) return

  title.value = config.title
  loading.value = true
  try {
    const response = await fetch(`/${config.file}`)
    if (response.ok) {
      content.value = await response.text()
    } else {
      content.value = t('legal.loadFailed')
    }
  } catch (error) {
    content.value = t('legal.loadFailed')
  } finally {
    loading.value = false
  }
}

watch(() => props.type, (newType) => {
  if (newType) {
    visible.value = true
    loadContent()
  } else {
    visible.value = false
  }
})

const close = () => {
  visible.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="legal-fade">
      <div v-if="visible" class="legal-overlay" @click.self="close">
        <div class="legal-dialog">
          <div class="legal-header">
            <h2 class="legal-title">{{ title }}</h2>
            <button class="legal-close" @click="close" :title="t('legal.closeTitle')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="legal-body">
            <div v-if="loading" class="legal-loading">{{ t('legal.loading') }}</div>
            <pre v-else class="legal-content">{{ content }}</pre>
          </div>
          <div class="legal-footer">
            <button class="legal-btn" @click="close">{{ t('legal.gotIt') }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.legal-overlay {
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
}

.legal-dialog {
  background: #1e1e2e;
  border-radius: 12px;
  width: 640px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.legal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.legal-title {
  font-size: 20px;
  font-weight: 600;
  color: #e0e0e0;
  margin: 0;
}

.legal-close {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 4px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.legal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
}

.legal-close svg {
  width: 20px;
  height: 20px;
}

.legal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  min-height: 200px;
}

.legal-loading {
  text-align: center;
  color: #888;
  padding: 40px;
}

.legal-content {
  color: #ccc;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Cascadia Mono', 'Consolas', monospace;
  margin: 0;
}

.legal-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
}

.legal-btn {
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  border: none;
  background: linear-gradient(135deg, #00d4ff 0%, #7b2ff7 100%);
  color: white;
  transition: all 0.2s ease;
}

.legal-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 212, 255, 0.3);
}

.legal-fade-enter-active,
.legal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.legal-fade-enter-active .legal-dialog,
.legal-fade-leave-active .legal-dialog {
  transition: all 0.2s ease;
}

.legal-fade-enter-from,
.legal-fade-leave-to {
  opacity: 0;
}

.legal-fade-enter-from .legal-dialog,
.legal-fade-leave-to .legal-dialog {
  transform: scale(0.95);
  opacity: 0;
}
</style>

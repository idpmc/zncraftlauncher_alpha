<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAIStore } from '../stores/ai'

const { t } = useI18n()
const aiStore = useAIStore()

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const isMinimized = ref(false)
const isFullscreen = ref(false)
const copiedId = ref<string | null>(null)

const expandedThinking = ref<Set<string>>(new Set())

const isThinkingOpen = (id: string) => expandedThinking.value.has(id)

const toggleThinking = (id: string) => {
  if (expandedThinking.value.has(id)) {
    expandedThinking.value.delete(id)
  } else {
    expandedThinking.value.add(id)
  }
}

const typedDisplay = ref<Record<string, string>>({})
let typeTimer: ReturnType<typeof setInterval> | null = null

const quickQuestions = computed(() => [
  t('aiPanel.quick1'),
  t('aiPanel.quick2'),
  t('aiPanel.quick3'),
  t('aiPanel.quick4'),
  t('aiPanel.quick5'),
  t('aiPanel.quick6')
])

const panelStyle = computed(() => {
  if (isFullscreen.value) {
    return {
      width: '85vw',
      height: '85vh',
      left: '7.5vw',
      top: '7.5vh',
      right: 'auto',
      bottom: 'auto'
    }
  }
  if (isMinimized.value) {
    return {
      width: '300px',
      height: 'auto',
      right: '16px',
      bottom: '16px',
      left: 'auto',
      top: 'auto'
    }
  }
  const pos = aiStore.panelPosition
  if (pos && (pos.x !== 0 || pos.y !== 0)) {
    return {
      width: '420px',
      height: '560px',
      left: `${pos.x}px`,
      top: `${pos.y}px`,
      right: 'auto',
      bottom: 'auto'
    }
  }
  return {
    width: '420px',
    height: '560px',
    right: '16px',
    bottom: '16px',
    left: 'auto',
    top: 'auto'
  }
})

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(() => aiStore.messages.length, scrollToBottom)
watch(() => aiStore.isLoading, scrollToBottom)

const getDisplayContent = (msg: any) => {
  if (msg.role !== 'assistant') return msg.content
  const lastMsg = aiStore.messages[aiStore.messages.length - 1]
  const isStreaming = aiStore.isLoading && lastMsg && msg.id === lastMsg.id
  if (!isStreaming) return msg.content
  return typedDisplay.value[msg.id] ?? ''
}

const processTyping = () => {
  const messages = aiStore.messages
  if (messages.length === 0) return
  const lastMsg = messages[messages.length - 1]
  if (lastMsg.role !== 'assistant') return
  if (!aiStore.isLoading && (typedDisplay.value[lastMsg.id]?.length ?? 0) >= lastMsg.content.length) {
    if (typeTimer) {
      clearInterval(typeTimer)
      typeTimer = null
    }
    return
  }
  const typed = typedDisplay.value[lastMsg.id] ?? ''
  const target = lastMsg.content
  if (typed.length < target.length) {
    const nextLen = Math.min(typed.length + 2, target.length)
    typedDisplay.value[lastMsg.id] = target.slice(0, nextLen)
    scrollToBottom()
  }
}

const startTyping = () => {
  if (typeTimer) return
  const messages = aiStore.messages
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role === 'assistant') {
      typedDisplay.value[lastMsg.id] = ''
    }
  }
  typeTimer = setInterval(processTyping, 30)
}

const stopTyping = () => {
  if (typeTimer) {
    clearInterval(typeTimer)
    typeTimer = null
  }
  const messages = aiStore.messages
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role === 'assistant') {
      typedDisplay.value[lastMsg.id] = lastMsg.content
    }
  }
}

watch(() => aiStore.isLoading, (loading) => {
  if (loading) {
    startTyping()
  } else {
    setTimeout(() => {
      stopTyping()
      scrollToBottom()
    }, 100)
  }
})

onBeforeUnmount(() => {
  stopTyping()
})

const sendMessage = () => {
  const text = inputText.value.trim()
  if (!text) return
  aiStore.sendMessage(text)
  inputText.value = ''
}

const sendQuickQuestion = (q: string) => {
  aiStore.sendMessage(q)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const goToSettings = () => {
  aiStore.closePanel()
  const event = new CustomEvent('navigate-to', { detail: { tab: 'settings', section: 'ai' } })
  window.dispatchEvent(event)
}

const startDrag = (e: MouseEvent) => {
  if (isFullscreen.value || isMinimized.value) return
  isDragging.value = true
  const panel = panelRef.value
  if (!panel) return
  const rect = panel.getBoundingClientRect()
  dragOffset.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  e.preventDefault()
}

const onDrag = (e: MouseEvent) => {
  if (!isDragging.value) return
  const panel = panelRef.value
  const panelWidth = panel ? panel.offsetWidth : 420
  const panelHeight = panel ? panel.offsetHeight : 560
  const maxX = window.innerWidth - panelWidth
  const maxY = window.innerHeight - panelHeight
  const newX = Math.max(0, Math.min(maxX, e.clientX - dragOffset.value.x))
  const newY = Math.max(0, Math.min(maxY, e.clientY - dragOffset.value.y))
  aiStore.savePanelPosition({ x: newX, y: newY })
}

const stopDrag = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

const copyContent = async (content: string, msgId: string) => {
  try {
    await navigator.clipboard.writeText(content)
    copiedId.value = msgId
    setTimeout(() => {
      copiedId.value = null
    }, 2000)
  } catch (e) {
    console.error('复制失败:', e)
  }
}

const renderMarkdown = (text: string): string => {
  let result = text
  result = result.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre class="code-block"><code>${escapeHtml(code.trim())}</code></pre>`
  })
  result = result.replace(/`([^`]+)`/g, (match, code) => {
    return `<code class="inline-code">${escapeHtml(code)}</code>`
  })
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  result = result.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  result = result.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  result = result.replace(/^# (.+)$/gm, '<h1>$1</h1>')
  result = result.replace(/^- (.+)$/gm, '<li>$1</li>')
  result = result.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
  result = result.replace(/\n/g, '<br/>')
  return result
}

const escapeHtml = (text: string): string => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

onMounted(() => {
  nextTick(() => {
    const pos = aiStore.panelPosition
    const panel = panelRef.value
    if (pos && panel) {
      const panelWidth = panel.offsetWidth || 420
      const panelHeight = panel.offsetHeight || 560
      const maxX = window.innerWidth - panelWidth
      const maxY = window.innerHeight - panelHeight
      const newX = Math.max(0, Math.min(maxX, pos.x))
      const newY = Math.max(0, Math.min(maxY, pos.y))
      if (newX !== pos.x || newY !== pos.y) {
        aiStore.savePanelPosition({ x: newX, y: newY })
      }
    }
  })
  scrollToBottom()
})
</script>

<template>
  <Transition name="ai-panel-fade">
    <div
      v-if="aiStore.isPanelOpen"
      ref="panelRef"
      class="ai-floating-panel"
      :class="{
        dragging: isDragging,
        minimized: isMinimized,
        fullscreen: isFullscreen
      }"
      :style="panelStyle"
    >
      <div class="ai-panel-header" @mousedown="startDrag">
        <div class="ai-panel-title">
          <div class="ai-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              <circle cx="7.5" cy="14.5" r="1.5"/>
              <circle cx="16.5" cy="14.5" r="1.5"/>
            </svg>
          </div>
          <div>
            <h3>{{ t('aiPanel.assistantTitle') }}</h3>
            <p v-if="aiStore.canSend" class="ai-status online">{{ t('aiPanel.statusReady') }}</p>
            <p v-else class="ai-status offline">{{ t('aiPanel.statusNotConfigured') }}</p>
          </div>
        </div>
        <div class="ai-panel-actions">
          <button
            v-if="aiStore.messages.length > 0"
            class="ai-action-btn"
            @click.stop="aiStore.clearMessages()"
            :title="t('aiPanel.clearChat')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <button
            class="ai-action-btn"
            @click.stop="goToSettings()"
            :title="t('aiPanel.settings')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button
            class="ai-action-btn"
            @click.stop="isMinimized = !isMinimized"
            :title="isMinimized ? t('aiPanel.expand') : t('aiPanel.minimize')"
          >
            <svg v-if="isMinimized" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <button
            class="ai-action-btn"
            @click.stop="isFullscreen = !isFullscreen"
            :title="isFullscreen ? t('aiPanel.restore') : t('aiPanel.fullscreen')"
          >
            <svg v-if="isFullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3"/>
              <path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
              <path d="M3 16h3a2 2 0 0 1 2 2v3"/>
              <path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
              <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
              <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
              <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
            </svg>
          </button>
          <button
            class="ai-action-btn close"
            @click.stop="aiStore.closePanel()"
            :title="t('aiPanel.closeEsc')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <Transition name="ai-panel-slide">
        <div v-if="!aiStore.config.enabled && !aiStore.config.apiKey" class="ai-config-hint">
          <div class="hint-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </div>
          <div class="hint-text">
            <p>{{ t('aiPanel.notConfigured') }}</p>
            <p class="hint-sub">{{ t('aiPanel.configHint') }}</p>
          </div>
          <button class="hint-btn" @click="goToSettings">{{ t('aiPanel.goToSettings') }}</button>
        </div>
      </Transition>

      <Transition name="ai-panel-slide">
        <div ref="messagesContainer" v-if="!isMinimized" class="ai-messages" :class="{ 'has-hint': !aiStore.config.enabled || !aiStore.config.apiKey }">
          <div v-if="aiStore.messages.length === 0" class="ai-welcome">
            <div class="welcome-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
            </div>
            <h3>{{ t('aiPanel.welcomeTitle') }}</h3>
            <p>{{ t('aiPanel.welcomeDesc') }}</p>
            <p class="shortcut-hint">{{ t('aiPanel.shortcutHint') }}</p>
            <div class="quick-questions">
              <button
                v-for="q in quickQuestions"
                :key="q"
                class="quick-btn"
                @click="sendQuickQuestion(q)"
              >
                {{ q }}
              </button>
            </div>
          </div>

          <div
            v-for="msg in aiStore.messages"
            :key="msg.id"
            class="ai-message"
            :class="{ 'user': msg.role === 'user', 'assistant': msg.role === 'assistant', 'error': msg.error }"
          >
            <div class="msg-avatar">
              <svg v-if="msg.role === 'user'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
            </div>
            <div class="msg-content">
              <div
                v-if="msg.role === 'assistant' && msg.thinking"
                class="thinking-block"
                :class="{ 'is-thinking': aiStore.isLoading && msg === aiStore.messages[aiStore.messages.length - 1] }"
              >
                <button class="thinking-toggle" @click="toggleThinking(msg.id)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'rotated': isThinkingOpen(msg.id) }">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                  <span class="thinking-label">
                    {{ isThinkingOpen(msg.id) ? t('aiPanel.hideThinking') : t('aiPanel.showThinking') }}
                  </span>
                  <span v-if="aiStore.isLoading && msg === aiStore.messages[aiStore.messages.length - 1]" class="thinking-badge">
                    {{ t('aiPanel.thinking') }}
                  </span>
                </button>
                <Transition name="thinking-slide">
                  <div v-if="isThinkingOpen(msg.id)" class="thinking-content" v-html="renderMarkdown(msg.thinking)"></div>
                </Transition>
              </div>
              <div class="msg-bubble" v-if="msg.role === 'assistant' && getDisplayContent(msg)" v-html="renderMarkdown(getDisplayContent(msg))"></div>
              <div class="msg-bubble" v-else-if="msg.role === 'user'">{{ msg.content }}</div>
              <div class="msg-bubble" v-else>
                <span
                  v-if="msg.role === 'assistant' && aiStore.isLoading && msg === aiStore.messages[aiStore.messages.length - 1]"
                  class="typing-indicator"
                >
                  <span></span><span></span><span></span>
                </span>
              </div>
              <div class="msg-meta">
                <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
                <button
                  v-if="msg.role === 'assistant' && msg.content"
                  class="msg-copy-btn"
                  @click="copyContent(msg.content, msg.id)"
                >
                  <svg v-if="copiedId !== msg.id" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <div v-if="!isMinimized" class="ai-input-area">
        <textarea
          v-model="inputText"
          :disabled="!aiStore.canSend"
          @keydown="handleKeydown"
          :placeholder="t('aiPanel.inputPlaceholder')"
          rows="1"
          class="ai-input"
        />
        <button
          v-if="aiStore.canCancel"
          @click="aiStore.stopGeneration()"
          class="ai-stop-btn"
          :title="t('aiPanel.stopGeneration')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="6" y="6" width="12" height="12" rx="1"/>
          </svg>
        </button>
        <button
          v-else
          :disabled="!aiStore.canSend || !inputText.trim()"
          @click="sendMessage"
          class="ai-send-btn"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ai-floating-panel {
  position: fixed;
  z-index: 10000;
  background: var(--bg-card, #1e1e1e);
  border-radius: 16px;
  border: 1px solid var(--border-color, #2a2a2a);
  box-shadow: var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.5));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-floating-panel.fullscreen {
  border-radius: 20px;
}

.ai-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary, #141414);
  border-bottom: 1px solid var(--border-color, #2a2a2a);
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}

.ai-floating-panel.dragging .ai-panel-header {
  cursor: grabbing;
}

.ai-panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ai-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--accent-primary, #5c7cfa);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.ai-icon svg {
  width: 18px;
  height: 18px;
}

.ai-panel-title h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, #fff);
}

.ai-status {
  margin: 2px 0 0;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ai-status.online {
  color: var(--success, #40c057);
}

.ai-status.offline {
  color: var(--error, #fa5252);
}

.ai-panel-actions {
  display: flex;
  gap: 2px;
}

.ai-action-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary, #a0a0a0);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.ai-action-btn:hover {
  background: var(--bg-hover, #252525);
  color: var(--text-primary, #fff);
}

.ai-action-btn.close:hover {
  background: rgba(250, 82, 82, 0.15);
  color: var(--error, #fa5252);
}

.ai-action-btn svg {
  width: 15px;
  height: 15px;
}

.ai-config-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(250, 176, 5, 0.08);
  border-bottom: 1px solid var(--border-color, #2a2a2a);
  flex-shrink: 0;
}

.hint-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(250, 176, 5, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--warning, #fab005);
  flex-shrink: 0;
}

.hint-icon svg {
  width: 15px;
  height: 15px;
}

.hint-text {
  flex: 1;
  min-width: 0;
}

.hint-text p {
  margin: 0;
  font-size: 12px;
  color: var(--text-primary, #fff);
  font-weight: 500;
}

.hint-text .hint-sub {
  font-size: 11px;
  color: var(--text-secondary, #a0a0a0);
  font-weight: 400;
  margin-top: 2px;
}

.hint-btn {
  padding: 6px 12px;
  border: none;
  background: var(--accent-primary, #5c7cfa);
  color: white;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  background: var(--bg-primary, #0d0d0d);
}

.ai-messages.has-hint {
  padding-top: 8px;
}

.ai-welcome {
  text-align: center;
  padding: 20px 12px 12px;
}

.welcome-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 16px;
  background: var(--accent-primary, #5c7cfa);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.welcome-icon svg {
  width: 26px;
  height: 26px;
}

.ai-welcome h3 {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary, #fff);
}

.ai-welcome > p {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--text-secondary, #a0a0a0);
}

.shortcut-hint {
  font-size: 11px !important;
  color: var(--text-muted, #6b6b6b) !important;
  margin-bottom: 14px !important;
}

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

.quick-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color, #2a2a2a);
  background: var(--bg-tertiary, #1a1a1a);
  color: var(--text-secondary, #a0a0a0);
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.quick-btn:hover {
  background: var(--accent-primary, #5c7cfa);
  color: #fff;
  border-color: var(--accent-primary, #5c7cfa);
}

.ai-message {
  display: flex;
  gap: 8px;
  max-width: 88%;
}

.ai-message.user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--accent-primary, #5c7cfa);
  color: white;
}

.msg-avatar svg {
  width: 14px;
  height: 14px;
}

.msg-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ai-message.user .msg-content {
  align-items: flex-end;
}

.thinking-block {
  width: 100%;
  margin-bottom: 6px;
  border: 1px solid var(--border-color, #2a2a2a);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-tertiary, #1a1a1a);
}

.thinking-block.is-thinking {
  border-color: var(--accent-primary, #5c7cfa);
}

.thinking-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #a0a0a0);
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s ease;
}

.thinking-toggle:hover {
  background: var(--bg-hover, #252525);
}

.thinking-toggle svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.thinking-toggle svg.rotated {
  transform: rotate(180deg);
}

.thinking-label {
  flex: 1;
  text-align: left;
}

.thinking-badge {
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--accent-primary, #5c7cfa);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.thinking-content {
  padding: 10px 12px;
  border-top: 1px solid var(--border-color, #2a2a2a);
  background: var(--bg-secondary, #141414);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary, #a0a0a0);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

.thinking-content::-webkit-scrollbar {
  width: 4px;
}

.thinking-content::-webkit-scrollbar-thumb {
  background: var(--border-color, #2a2a2a);
  border-radius: 2px;
}

.thinking-slide-enter-active,
.thinking-slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.thinking-slide-enter-from,
.thinking-slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.msg-bubble {
  padding: 9px 13px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.ai-message.user .msg-bubble {
  background: var(--accent-primary, #5c7cfa);
  color: white;
  border-bottom-right-radius: 4px;
}

.ai-message.assistant .msg-bubble {
  background: var(--bg-secondary, #141414);
  color: var(--text-primary, #e5e7eb);
  border: 1px solid var(--border-color, #2a2a2a);
  border-bottom-left-radius: 4px;
}

.ai-message.error .msg-bubble {
  background: rgba(250, 82, 82, 0.1);
  border-color: rgba(250, 82, 82, 0.25);
  color: #fca5a5;
}

.msg-bubble :deep(h1),
.msg-bubble :deep(h2),
.msg-bubble :deep(h3) {
  margin: 8px 0 4px;
  font-weight: 700;
  color: inherit;
}

.msg-bubble :deep(h1) { font-size: 16px; }
.msg-bubble :deep(h2) { font-size: 15px; }
.msg-bubble :deep(h3) { font-size: 14px; }

.msg-bubble :deep(li) {
  margin: 2px 0;
  padding-left: 4px;
}

.msg-bubble :deep(.code-block) {
  background: var(--bg-tertiary, #1a1a1a);
  padding: 8px 10px;
  border-radius: 8px;
  margin: 6px 0;
  overflow-x: auto;
  font-family: 'Consolas', 'Monaco', 'Cascadia Code', monospace;
  font-size: 12px;
  border: 1px solid var(--border-color, #2a2a2a);
}

.msg-bubble :deep(.inline-code) {
  background: var(--accent-primary, #5c7cfa);
  background: rgba(92, 124, 250, 0.2);
  padding: 1px 5px;
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', 'Cascadia Code', monospace;
  font-size: 12px;
  color: var(--accent-primary, #5c7cfa);
}

.typing-indicator {
  display: inline-flex;
  gap: 4px;
  padding: 4px 2px;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  background: var(--accent-primary, #5c7cfa);
  border-radius: 50%;
  animation: typingBounce 1s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.15s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes typingBounce {
  0%, 80%, 100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
}

.ai-message.user .msg-meta {
  flex-direction: row-reverse;
}

.msg-time {
  font-size: 10px;
  color: var(--text-muted, #6b6b6b);
}

.msg-copy-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-muted, #6b6b6b);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ai-message:hover .msg-copy-btn,
.msg-copy-btn:hover {
  opacity: 1;
  color: var(--text-secondary, #a0a0a0);
  background: var(--bg-hover, #252525);
}

.msg-copy-btn svg {
  width: 11px;
  height: 11px;
}

.ai-input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-secondary, #141414);
  border-top: 1px solid var(--border-color, #2a2a2a);
  flex-shrink: 0;
  align-items: flex-end;
}

.ai-input {
  flex: 1;
  padding: 9px 12px;
  border: 1px solid var(--border-color, #2a2a2a);
  background: var(--bg-tertiary, #1a1a1a);
  color: var(--text-primary, #fff);
  border-radius: 12px;
  font-size: 13px;
  resize: none;
  max-height: 120px;
  min-height: 38px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
  line-height: 1.5;
}

.ai-input::placeholder {
  color: var(--text-muted, #6b6b6b);
}

.ai-input:focus {
  border-color: var(--accent-primary, #5c7cfa);
}

.ai-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-send-btn,
.ai-stop-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  flex-shrink: 0;
}

.ai-send-btn {
  background: var(--accent-primary, #5c7cfa);
  color: white;
}

.ai-stop-btn {
  background: var(--error, #fa5252);
  color: white;
}

.ai-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-send-btn svg,
.ai-stop-btn svg {
  width: 16px;
  height: 16px;
}

.ai-panel-fade-enter-active,
.ai-panel-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.ai-panel-fade-enter-from,
.ai-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.ai-panel-slide-enter-active,
.ai-panel-slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.ai-panel-slide-enter-from,
.ai-panel-slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

@media (max-width: 768px) {
  .ai-floating-panel:not(.fullscreen) {
    width: calc(100vw - 20px) !important;
    height: 70vh !important;
    right: 10px !important;
    left: 10px !important;
    bottom: 10px !important;
    top: auto !important;
  }
}

.ai-messages::-webkit-scrollbar {
  width: 4px;
}

.ai-messages::-webkit-scrollbar-track {
  background: transparent;
}

.ai-messages::-webkit-scrollbar-thumb {
  background: var(--accent-secondary, #4c6ef5);
  border-radius: 2px;
}
</style>

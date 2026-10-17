<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const isMaximized = ref(false)

const handleMinimize = () => {
  window.electronAPI?.minimizeWindow?.()
}

const handleMaximize = () => {
  if (isMaximized.value) {
    window.electronAPI?.unmaximizeWindow?.()
  } else {
    window.electronAPI?.maximizeWindow?.()
  }
  isMaximized.value = !isMaximized.value
}

const handleClose = () => {
  window.electronAPI?.closeWindow?.()
}

const handleDoubleClick = () => {
  handleMaximize()
}

// 监听窗口最大化状态变化
onMounted(() => {
  const removeListener = window.electronAPI?.onWindowMaximized?.((maximized: boolean) => {
    isMaximized.value = maximized
  })
  onUnmounted(() => {
    removeListener?.()
  })
})
</script>

<template>
  <div class="window-frame" :class="{ maximized: isMaximized }">
    <div 
      class="title-bar"
      @dblclick="handleDoubleClick"
    >
      <div class="title-bar-left">
        <svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="20" height="20" rx="4" />
          <path d="M7 7h10v10H7z" />
          <line x1="12" y1="7" x2="12" y2="17" />
          <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
        <span class="app-title">ZNCL Launcher</span>
      </div>
      <div class="title-bar-right">
        <button 
          class="window-btn minimize-btn"
          @click="handleMinimize"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="6" y1="12" x2="18" y2="12" />
          </svg>
        </button>
        <button 
          class="window-btn maximize-btn"
          @click="handleMaximize"
        >
          <svg v-if="!isMaximized" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3h6v6H3zM21 3h-6v6h6zM3 21h6v-6H3zM21 21h-6v-6h6z" />
          </svg>
        </button>
        <button 
          class="window-btn close-btn"
          @click="handleClose"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
    <div class="window-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.window-frame {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  transition: border-radius 0.15s ease;
}

.window-frame.maximized {
  border-radius: 0;
}

.title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 36px;
  padding: 0 8px 0 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  user-select: none;
  -webkit-app-region: drag;
}

.title-bar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-icon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: var(--accent-primary);
}

.app-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--text-secondary);
}

.title-bar-right {
  display: flex;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.window-btn {
  width: 34px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--border-radius-sm);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.window-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.window-btn:active {
  opacity: 0.8;
}

.close-btn:hover {
  background: var(--error);
  color: white;
}

.window-btn svg {
  width: 14px;
  height: 14px;
}

.window-content {
  flex: 1;
  overflow: hidden;
}
</style>

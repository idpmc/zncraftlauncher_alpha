<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDownloadsStore, type DownloadTask, type DownloadCategory } from '../stores/downloads'
import { useVersionsStore } from '../stores/versions'

const { t } = useI18n()
const downloadsStore = useDownloadsStore()
const versionsStore = useVersionsStore()

const expanded = ref(false)

const activeTasks = computed(() => downloadsStore.activeTasks)
const completedTasks = computed(() => downloadsStore.tasks.filter(t =>
  t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
).slice(0, 10))

const statusLabels = computed<Record<DownloadTask['status'], string>>(() => ({
  queued: t('dl.statusQueued'),
  downloading: t('dl.statusDownloading'),
  paused: t('dl.statusPaused'),
  completed: t('dl.statusCompleted'),
  failed: t('dl.statusFailed'),
  cancelled: t('dl.statusCancelled')
}))

const statusColors: Record<DownloadTask['status'], string> = {
  queued: '#f39c12',
  downloading: '#3498db',
  paused: '#95a5a6',
  completed: '#2ecc71',
  failed: '#e74c3c',
  cancelled: '#7f8c8d'
}

const getCategoryIcon = (category: DownloadCategory): string => {
  const icons: Record<DownloadCategory, string> = {
    version: '🎮',
    mod: '🧩',
    modpack: '📦',
    java: '☕',
    frp: '🌐',
    easytier: '🔗',
    resourcepack: '🎨',
    shader: '🌈'
  }
  return icons[category] || '📥'
}

const getTaskProgress = (task: DownloadTask): number => task.progress || 0
const getTaskSpeed = (task: DownloadTask): string => downloadsStore.getFormattedSpeed(task)
const getTaskTimeLeft = (task: DownloadTask): string => downloadsStore.getTimeLeft(task)
const getTaskDownloaded = (task: DownloadTask): string => downloadsStore.getFormattedDownloaded(task)
const getTaskTotal = (task: DownloadTask): string => downloadsStore.getFormattedTotal(task)

const cancelVersionDownload = async (directoryName: string) => {
  const taskId = `version-${directoryName}`
  if (downloadsStore.getTask(taskId)) {
    downloadsStore.setStatus(taskId, 'cancelled')
  }
  await versionsStore.cancelDownload(directoryName)
}

const handleCancel = (task: DownloadTask) => {
  if (task.category === 'version') {
    const dirName = task.id.replace('version-', '')
    cancelVersionDownload(dirName)
  } else {
    downloadsStore.setStatus(task.id, 'cancelled')
  }
}

const handlePauseResume = (task: DownloadTask) => {
  if (task.category === 'version') {
    const dirName = task.id.replace('version-', '')
    if (task.status === 'paused') {
      versionsStore.resumeDownload(dirName)
    } else {
      versionsStore.pauseDownload(dirName)
    }
  }
}

const toggleExpand = () => {
  expanded.value = !expanded.value
}
</script>

<template>
  <div class="download-panel">
    <div class="panel-header" @click="toggleExpand">
      <div class="header-left">
        <span class="panel-icon">📥</span>
        <h3 class="panel-title">{{ t('dl.title') }}</h3>
        <span v-if="activeTasks.length > 0" class="task-count-badge">{{ activeTasks.length }}</span>
      </div>
      <div class="header-right">
        <span v-if="downloadsStore.totalSpeed > 0" class="total-speed">
          {{ downloadsStore.formatSpeed(downloadsStore.totalSpeed) }}
        </span>
        <span class="expand-icon" :class="{ expanded }">▼</span>
      </div>
    </div>

    <Transition name="expand">
      <div v-show="expanded" class="panel-content">
        <div v-if="downloadsStore.tasks.length === 0" class="empty-state">
          <span class="empty-icon">📭</span>
          <span class="empty-text">{{ t('dl.empty') }}</span>
        </div>

        <div v-else class="task-list">
          <div
            v-for="task in activeTasks"
            :key="task.id"
            class="task-item downloading-task"
          >
            <div class="task-row">
              <div class="task-icon" :style="{ background: downloadsStore.categoryColors[task.category] + '20', color: downloadsStore.categoryColors[task.category] }">
                {{ getCategoryIcon(task.category) }}
              </div>
              <div class="task-info">
                <div class="task-header">
                  <span class="task-name">{{ task.name }}</span>
                  <span class="task-category">{{ downloadsStore.categoryLabels[task.category] }}</span>
                </div>
                <div class="task-progress-row">
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      :style="{ width: getTaskProgress(task) + '%', background: downloadsStore.categoryColors[task.category] }"
                    ></div>
                  </div>
                  <span class="progress-percent">{{ getTaskProgress(task) }}%</span>
                </div>
                <div class="task-meta">
                  <span v-if="getTaskSpeed(task)" class="meta-item speed">
                    ⚡ {{ getTaskSpeed(task) }}
                  </span>
                  <span v-if="task.threads && task.threads > 1" class="meta-item threads">
                    🧵 {{ t('dl.threads', { n: task.threads }) }}
                  </span>
                  <span v-if="getTaskDownloaded(task) && getTaskTotal(task)" class="meta-item size">
                    📊 {{ getTaskDownloaded(task) }} / {{ getTaskTotal(task) }}
                  </span>
                  <span v-if="task.status === 'downloading'" class="meta-item eta">
                    ⏱ {{ getTaskTimeLeft(task) }}
                  </span>
                  <span class="meta-item status" :style="{ color: statusColors[task.status] }">
                    {{ statusLabels[task.status] }}
                  </span>
                </div>
              </div>
              <div class="task-actions">
                <button
                  v-if="task.category === 'version'"
                  class="action-btn"
                  @click="handlePauseResume(task)"
                  :title="task.status === 'paused' ? t('dl.resume') : t('dl.pause')"
                >
                  {{ task.status === 'paused' ? '▶' : '⏸' }}
                </button>
                <button
                  v-if="task.status !== 'completed' && task.status !== 'failed' && task.status !== 'cancelled'"
                  class="action-btn cancel"
                  @click="handleCancel(task)"
                  :title="t('dl.cancelDownload')"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <div v-if="completedTasks.length > 0" class="completed-section">
            <div class="section-title">
              <span>{{ t('dl.completedHistory') }}</span>
              <button v-if="completedTasks.length > 0" class="clear-btn" @click="downloadsStore.clearCompleted()">
                {{ t('dl.clear') }}
              </button>
            </div>
            <div
              v-for="task in completedTasks"
              :key="task.id"
              class="task-item completed-task"
            >
              <div class="task-row">
                <div class="task-icon small" :style="{ background: downloadsStore.categoryColors[task.category] + '15', color: downloadsStore.categoryColors[task.category] }">
                  {{ getCategoryIcon(task.category) }}
                </div>
                <div class="task-info">
                  <div class="task-header small">
                    <span class="task-name">{{ task.name }}</span>
                    <span class="task-category">{{ downloadsStore.categoryLabels[task.category] }}</span>
                    <span class="meta-item status" :style="{ color: statusColors[task.status] }">
                      {{ statusLabels[task.status] }}
                    </span>
                  </div>
                  <div class="task-meta small">
                    <span v-if="task.error" class="meta-item error">{{ task.error }}</span>
                    <span v-if="getTaskTotal(task)" class="meta-item size">{{ t('dl.size', { s: getTaskTotal(task) }) }}</span>
                  </div>
                </div>
                <div class="task-actions">
                  <button class="action-btn remove" @click="downloadsStore.removeTask(task.id)" :title="t('dl.remove')">
                    ✕
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.download-panel {
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: var(--border-radius-md, 12px);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.panel-header:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-icon {
  font-size: 20px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.task-count-badge {
  padding: 2px 8px;
  background: var(--accent-primary, #3b82f6);
  color: white;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.total-speed {
  font-size: 12px;
  color: var(--accent-primary, #3b82f6);
  font-weight: 600;
  font-family: 'Cascadia Mono', monospace;
}

.expand-icon {
  font-size: 10px;
  color: var(--text-tertiary, #9ca3af);
  transition: transform 0.2s;
}

.expand-icon.expanded {
  transform: rotate(180deg);
}

.panel-content {
  border-top: 1px solid var(--border-color, #e5e7eb);
}

.expand-enter-active,
.expand-leave-active {
  transition: max-height 0.3s ease, opacity 0.2s;
  overflow: hidden;
  max-height: 800px;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--text-tertiary, #9ca3af);
}

.empty-icon {
  font-size: 36px;
  opacity: 0.5;
}

.empty-text {
  font-size: 13px;
}

.task-list {
  max-height: 600px;
  overflow-y: auto;
}

.task-item {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-light, #f3f4f6);
}

.task-item:last-child {
  border-bottom: none;
}

.task-item.completed-task {
  background: var(--bg-secondary, #f9fafb);
  opacity: 0.85;
}

.task-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.task-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}

.task-icon.small {
  width: 32px;
  height: 32px;
  font-size: 16px;
  border-radius: 8px;
}

.task-info {
  flex: 1;
  min-width: 0;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.task-header.small {
  margin-bottom: 4px;
}

.task-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-category {
  padding: 2px 6px;
  background: var(--bg-secondary, #f3f4f6);
  color: var(--text-secondary, #6b7280);
  border-radius: 4px;
  font-size: 10.5px;
  flex-shrink: 0;
}

.task-progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-secondary, #e5e7eb);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.progress-percent {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  font-family: 'Cascadia Mono', monospace;
  flex-shrink: 0;
  min-width: 40px;
  text-align: right;
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
}

.task-meta.small {
  gap: 4px 10px;
}

.meta-item {
  font-size: 11.5px;
  color: var(--text-secondary, #6b7280);
  display: flex;
  align-items: center;
  gap: 3px;
}

.meta-item.error {
  color: #e74c3c;
}

.task-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-primary, #ffffff);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.action-btn:hover {
  background: var(--bg-hover, #f3f4f6);
  color: var(--text-primary, #111827);
}

.action-btn.cancel:hover,
.action-btn.remove:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: #e74c3c;
}

.completed-section {
  border-top: 1px solid var(--border-light, #f3f4f6);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px 8px;
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  font-weight: 500;
}

.clear-btn {
  padding: 4px 10px;
  font-size: 11px;
  background: transparent;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.15s;
}

.clear-btn:hover {
  background: var(--bg-hover, #f3f4f6);
  color: var(--text-primary, #111827);
}
</style>

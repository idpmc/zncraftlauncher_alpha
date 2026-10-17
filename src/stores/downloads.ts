import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { i18n } from '../locales'

export type DownloadCategory = 'version' | 'mod' | 'java' | 'frp' | 'easytier' | 'resourcepack' | 'modpack' | 'shader'

export interface DownloadTask {
  id: string
  name: string
  category: DownloadCategory
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled'
  progress: number
  speed: number
  downloadedBytes: number
  totalBytes: number
  startTime: number
  lastUpdateTime: number
  error?: string
  subType?: string
  icon?: string
  threads?: number
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatSpeed = (bytesPerSec: number): string => {
  return formatBytes(bytesPerSec) + '/s'
}

const formatTimeLeft = (seconds: number): string => {
  if (!isFinite(seconds) || seconds <= 0) return i18n.global.t('rt.stDownloads.calculating')
  if (seconds < 60) return i18n.global.t('rt.stDownloads.seconds', { n: Math.round(seconds) })
  if (seconds < 3600) return i18n.global.t('rt.stDownloads.minutesSeconds', { m: Math.floor(seconds / 60), s: Math.round(seconds % 60) })
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return i18n.global.t('rt.stDownloads.hoursMinutes', { h: hours, m: mins })
}

export const useDownloadsStore = defineStore('downloads', () => {
  const tasks = ref<DownloadTask[]>([])

  const activeTasks = computed(() => tasks.value.filter(t => t.status === 'downloading' || t.status === 'paused' || t.status === 'queued'))
  const downloadingCount = computed(() => tasks.value.filter(t => t.status === 'downloading').length)
  const hasActiveDownloads = computed(() => activeTasks.value.length > 0)

  const totalSpeed = computed(() => {
    return tasks.value
      .filter(t => t.status === 'downloading')
      .reduce((sum, t) => sum + t.speed, 0)
  })

  const categoryLabels: Record<DownloadCategory, string> = {
    version: i18n.global.t('rt.stDownloads.catVersion'),
    mod: 'Mod',
    modpack: i18n.global.t('rt.stDownloads.catModpack'),
    java: 'Java',
    frp: 'FRP',
    easytier: 'EasyTier',
    resourcepack: i18n.global.t('rt.stDownloads.catResourcepack'),
    shader: i18n.global.t('rt.stDownloads.catShader')
  }

  const categoryColors: Record<DownloadCategory, string> = {
    version: '#3498db',
    mod: '#9b59b6',
    modpack: '#e67e22',
    java: '#f39c12',
    frp: '#1abc9c',
    easytier: '#2ecc71',
    resourcepack: '#e91e63',
    shader: '#673ab7'
  }

  const addTask = (task: Omit<DownloadTask, 'startTime' | 'lastUpdateTime' | 'status' | 'progress' | 'speed' | 'downloadedBytes' | 'totalBytes'> & Partial<DownloadTask>) => {
    const existing = tasks.value.find(t => t.id === task.id)
    if (existing) {
      if (existing.status === 'completed' || existing.status === 'cancelled' || existing.status === 'failed') {
        const idx = tasks.value.findIndex(t => t.id === task.id)
        tasks.value.splice(idx, 1)
      } else {
        return existing
      }
    }

    const newTask: DownloadTask = {
      id: task.id,
      name: task.name,
      category: task.category,
      status: task.status || 'queued',
      progress: task.progress || 0,
      speed: task.speed || 0,
      downloadedBytes: task.downloadedBytes || 0,
      totalBytes: task.totalBytes || 0,
      startTime: task.startTime || Date.now(),
      lastUpdateTime: task.lastUpdateTime || Date.now(),
      subType: task.subType,
      icon: task.icon,
      error: task.error
    }

    tasks.value.unshift(newTask)
    return newTask
  }

  const updateTask = (id: string, updates: Partial<DownloadTask>) => {
    const task = tasks.value.find(t => t.id === id)
    if (!task) return

    Object.assign(task, updates)
    task.lastUpdateTime = Date.now()

    if (updates.progress !== undefined && updates.progress >= 100) {
      task.status = 'completed'
      task.progress = 100
      task.speed = 0
    }
  }

  const updateProgress = (id: string, progress: number, speed?: number, downloadedBytes?: number, totalBytes?: number, threads?: number) => {
    const task = tasks.value.find(t => t.id === id)
    if (!task) return

    task.progress = Math.min(Math.max(progress, 0), 100)
    if (speed !== undefined) task.speed = speed
    if (downloadedBytes !== undefined) task.downloadedBytes = downloadedBytes
    if (totalBytes !== undefined) task.totalBytes = totalBytes
    if (threads !== undefined) task.threads = threads
    task.lastUpdateTime = Date.now()

    if (task.progress >= 100) {
      task.status = 'completed'
      task.speed = 0
    }
  }

  const setStatus = (id: string, status: DownloadTask['status'], error?: string) => {
    const task = tasks.value.find(t => t.id === id)
    if (!task) return
    task.status = status
    if (error) task.error = error
    task.lastUpdateTime = Date.now()
    if (status === 'downloading') {
      task.startTime = Date.now()
    }
    if (status === 'completed') {
      task.progress = 100
      task.speed = 0
    }
    if (status === 'cancelled' || status === 'failed') {
      task.speed = 0
    }
  }

  const removeTask = (id: string) => {
    const idx = tasks.value.findIndex(t => t.id === id)
    if (idx > -1) tasks.value.splice(idx, 1)
  }

  const clearCompleted = () => {
    tasks.value = tasks.value.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'failed')
  }

  const getTask = (id: string) => tasks.value.find(t => t.id === id)

  const getTimeLeft = (task: DownloadTask): string => {
    if (task.status !== 'downloading' || task.speed <= 0 || task.progress >= 100) {
      return task.status === 'completed' ? i18n.global.t('rt.stDownloads.completed') : i18n.global.t('rt.stDownloads.calculating')
    }
    const remainingBytes = task.totalBytes - task.downloadedBytes
    if (remainingBytes <= 0) return i18n.global.t('rt.stDownloads.almostDone')
    const seconds = remainingBytes / task.speed
    return formatTimeLeft(seconds)
  }

  const getFormattedSpeed = (task: DownloadTask): string => {
    if (task.status !== 'downloading' || task.speed <= 0) return ''
    return formatSpeed(task.speed)
  }

  const getFormattedTotal = (task: DownloadTask): string => {
    if (task.totalBytes <= 0) return ''
    return formatBytes(task.totalBytes)
  }

  const getFormattedDownloaded = (task: DownloadTask): string => {
    if (task.downloadedBytes <= 0) return ''
    return formatBytes(task.downloadedBytes)
  }

  return {
    tasks,
    activeTasks,
    downloadingCount,
    hasActiveDownloads,
    totalSpeed,
    categoryLabels,
    categoryColors,
    addTask,
    updateTask,
    updateProgress,
    setStatus,
    removeTask,
    clearCompleted,
    getTask,
    getTimeLeft,
    getFormattedSpeed,
    getFormattedTotal,
    getFormattedDownloaded,
    formatBytes,
    formatSpeed,
    formatTimeLeft
  }
})

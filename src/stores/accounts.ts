import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { i18n } from '../locales'

export interface OfflineAccount {
  id: string
  username: string
  skinUrl: string
  capeUrl: string
  createdAt: string
  lastUsed: string
  enabled: boolean
  avatarUrl: string  // 自定义头像图片URL
}

export const useAccountsStore = defineStore('accounts', () => {
  // 预设头像颜色
  const presetAvatars = [
    { id: 'blue', gradient: 'linear-gradient(135deg, #00d4ff, #0077aa)', label: i18n.global.t('rt.stAccounts.colorBlue') },
    { id: 'green', gradient: 'linear-gradient(135deg, #2ecc71, #27ae60)', label: i18n.global.t('rt.stAccounts.colorGreen') },
    { id: 'orange', gradient: 'linear-gradient(135deg, #e67e22, #d35400)', label: i18n.global.t('rt.stAccounts.colorOrange') },
    { id: 'purple', gradient: 'linear-gradient(135deg, #9b59b6, #8e44ad)', label: i18n.global.t('rt.stAccounts.colorPurple') },
    { id: 'red', gradient: 'linear-gradient(135deg, #e74c3c, #c0392b)', label: i18n.global.t('rt.stAccounts.colorRed') },
    { id: 'pink', gradient: 'linear-gradient(135deg, #fd79a8, #e84393)', label: i18n.global.t('rt.stAccounts.colorPink') },
    { id: 'yellow', gradient: 'linear-gradient(135deg, #f1c40f, #f39c12)', label: i18n.global.t('rt.stAccounts.colorYellow') },
    { id: 'cyan', gradient: 'linear-gradient(135deg, #00cec9, #00b894)', label: i18n.global.t('rt.stAccounts.colorCyan') },
    { id: 'gray', gradient: 'linear-gradient(135deg, #636e72, #2d3436)', label: i18n.global.t('rt.stAccounts.colorGray') },
  ]
  
  // 预设皮肤列表
  const presetSkins = [
    { id: 'steve', name: 'Steve', isSlim: false },
    { id: 'alex', name: 'Alex', isSlim: true },
    { id: 'ari', name: 'Ari', isSlim: true },
    { id: 'efe', name: 'Efe', isSlim: false },
    { id: 'kai', name: 'Kai', isSlim: false },
    { id: 'makena', name: 'Makena', isSlim: true },
    { id: 'noor', name: 'Noor', isSlim: true },
    { id: 'sunny', name: 'Sunny', isSlim: true },
    { id: 'zuri', name: 'Zuri', isSlim: true },
    { id: 'zombie', name: i18n.global.t('rt.stAccounts.skinZombie'), isSlim: false },
    { id: 'creeper', name: i18n.global.t('rt.stAccounts.skinCreeper'), isSlim: false },
  ]
  // 离线账号列表
  const offlineAccounts = ref<OfflineAccount[]>([])
  
  // 当前选中的账号
  const currentAccountId = ref<string | null>(null)
  
  // 加载保存的账号
  const loadAccounts = () => {
    try {
      const saved = localStorage.getItem('mc-offline-accounts')
      if (saved) {
        offlineAccounts.value = JSON.parse(saved)
        // 确保旧账号有enabled和avatarUrl字段
        offlineAccounts.value.forEach(account => {
          if (account.enabled === undefined) {
            account.enabled = true
          }
          if (account.avatarUrl === undefined) {
            account.avatarUrl = ''  // 默认无自定义头像
          }
        })
      }
      const selectedId = localStorage.getItem('mc-current-account')
      if (selectedId) {
        currentAccountId.value = selectedId
      }
    } catch (e) {
      console.error('加载账号失败:', e)
    }
  }
  
  // 保存账号到本地
  const saveAccounts = () => {
    try {
      localStorage.setItem('mc-offline-accounts', JSON.stringify(offlineAccounts.value))
      if (currentAccountId.value) {
        localStorage.setItem('mc-current-account', currentAccountId.value)
      }
    } catch (e) {
      console.error('保存账号失败:', e)
    }
  }
  
  // 检查用户名是否已存在
  const isUsernameTaken = (username: string, excludeId?: string): boolean => {
    return offlineAccounts.value.some(
      account => account.username.toLowerCase() === username.toLowerCase().trim() && account.id !== excludeId
    )
  }
  
  // 添加离线账号
  const addOfflineAccount = (username: string, skinUrl: string = '', capeUrl: string = '', avatarUrl: string = ''): OfflineAccount | null => {
    const trimmedUsername = username.trim()
    if (!trimmedUsername) return null
    if (isUsernameTaken(trimmedUsername)) return null
    
    const account: OfflineAccount = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      username: trimmedUsername,
      skinUrl,
      capeUrl,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      enabled: true,
      avatarUrl
    }
    offlineAccounts.value.push(account)
    saveAccounts()
    return account
  }
  
  // 删除离线账号
  const removeOfflineAccount = (id: string) => {
    const index = offlineAccounts.value.findIndex(a => a.id === id)
    if (index !== -1) {
      offlineAccounts.value.splice(index, 1)
      if (currentAccountId.value === id) {
        currentAccountId.value = null
      }
      saveAccounts()
    }
  }
  
  // 更新离线账号
  const updateOfflineAccount = (id: string, updates: Partial<OfflineAccount>) => {
    const account = offlineAccounts.value.find(a => a.id === id)
    if (account) {
      Object.assign(account, updates)
      saveAccounts()
    }
  }
  
  // 切换账号启用状态
  const toggleAccountEnabled = (id: string) => {
    const account = offlineAccounts.value.find(a => a.id === id)
    if (account) {
      account.enabled = !account.enabled
      saveAccounts()
    }
  }
  
  // 选择账号
  const selectAccount = (id: string) => {
    currentAccountId.value = id
    const account = offlineAccounts.value.find(a => a.id === id)
    if (account) {
      account.lastUsed = new Date().toISOString()
      saveAccounts()
    }
  }
  
  // 获取当前账号
  const currentAccount = computed(() => {
    return offlineAccounts.value.find(a => a.id === currentAccountId.value) || null
  })
  
  // 导出账号
  const exportAccounts = (): string => {
    return JSON.stringify(offlineAccounts.value, null, 2)
  }
  
  // 导入账号
  const importAccounts = (jsonStr: string): { success: number; failed: number } => {
    try {
      const imported = JSON.parse(jsonStr) as OfflineAccount[]
      let success = 0
      let failed = 0
      
      imported.forEach(account => {
        if (account.username && isUsernameTaken(account.username, account.id)) {
          failed++
        } else {
          const newAccount: OfflineAccount = {
            id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            username: account.username?.trim() || 'Unknown',
            skinUrl: account.skinUrl || '',
            capeUrl: account.capeUrl || '',
            createdAt: account.createdAt || new Date().toISOString(),
            lastUsed: account.lastUsed || new Date().toISOString(),
            enabled: account.enabled !== undefined ? account.enabled : true,
            avatarUrl: account.avatarUrl || ''
          }
          offlineAccounts.value.push(newAccount)
          success++
        }
      })
      
      if (success > 0) saveAccounts()
      return { success, failed }
    } catch (e) {
      console.error('导入账号失败:', e)
      return { success: 0, failed: 0 }
    }
  }
  
  // 初始化
  loadAccounts()
  
  return {
    offlineAccounts,
    currentAccountId,
    currentAccount,
    isUsernameTaken,
    addOfflineAccount,
    removeOfflineAccount,
    updateOfflineAccount,
    toggleAccountEnabled,
    selectAccount,
    exportAccounts,
    importAccounts,
    loadAccounts,
    presetAvatars,
    presetSkins
  }
})

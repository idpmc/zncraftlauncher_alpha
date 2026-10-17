<template>
  <div class="account-panel-simple">
    <div class="panel-header">
      <h2>{{ t('acctPanel.title') }}</h2>
      <span class="header-subtitle">{{ t('acctPanel.subtitle') }}</span>
    </div>

    <div v-if="currentAccount" class="current-account-card">
      <div class="account-avatar" :style="{ background: getAvatarGradient(currentAccount) }">
        <img v-if="hasAvatarImage(currentAccount)" :src="currentAccount.avatarUrl" :alt="t('acctPanel.avatar')" class="avatar-img" />
        <template v-else>{{ currentAccount.username.charAt(0).toUpperCase() }}</template>
      </div>
      <div class="account-info">
        <div class="account-name">{{ currentAccount.username }}</div>
        <div class="account-meta">{{ t('acctPanel.offlineAccount') }} · {{ getCurrentSkinLabel }}</div>
      </div>
      <div class="card-actions">
        <button class="icon-btn" @click="openRenameModal" :title="t('acctPanel.rename')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
        <button class="icon-btn danger" @click="confirmDeleteCurrent" :title="t('acctPanel.deleteAccount')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="settings-list">
      <div class="setting-item">
        <div class="setting-label">
          <span class="setting-title">UUID</span>
          <span class="setting-desc">{{ t('acctPanel.uuidDesc') }}</span>
        </div>
        <div class="setting-control uuid-control">
          <span class="uuid-value">{{ currentAccountUuid }}</span>
          <button class="text-btn" @click="copyUuid">{{ t('acctPanel.copy') }}</button>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span class="setting-title">{{ t('acctPanel.accountType') }}</span>
          <span class="setting-desc">{{ t('acctPanel.loginMethod') }}</span>
        </div>
        <div class="setting-control">
          <span class="type-badge">{{ t('acctPanel.offline') }}</span>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span class="setting-title">{{ t('acctPanel.avatarColor') }}</span>
          <span class="setting-desc">{{ t('acctPanel.avatarColorDesc') }}</span>
        </div>
        <div class="setting-control">
          <div class="avatar-picker">
            <div 
              v-for="avatar in accountsStore.presetAvatars" 
              :key="avatar.id"
              class="avatar-dot"
              :class="{ active: isAvatarSelected(avatar.id) }"
              :style="{ background: avatar.gradient }"
              :title="avatar.label"
              @click="selectAvatar(avatar.id)"
            />
          </div>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span class="setting-title">{{ t('acctPanel.customAvatar') }}</span>
          <span class="setting-desc">{{ t('acctPanel.customAvatarDesc') }}</span>
        </div>
        <div class="setting-control">
          <button class="outline-btn" @click="triggerAvatarUpload">{{ t('acctPanel.uploadAvatar') }}</button>
          <button v-if="hasAvatarImage(currentAccount)" class="text-btn danger" @click="clearCustomAvatar">{{ t('acctPanel.clear') }}</button>
          <input type="file" ref="avatarFileInput" accept="image/*" style="display:none" @change="handleAvatarUpload" />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span class="setting-title">{{ t('acctPanel.defaultSkin') }}</span>
          <span class="setting-desc">{{ t('acctPanel.defaultSkinDesc') }}</span>
        </div>
        <div class="setting-control">
          <select class="skin-select" :value="getCurrentSkinName" @change="onSkinChange">
            <option v-for="skin in accountsStore.presetSkins" :key="skin.id" :value="skin.id">
              {{ skin.name }}{{ skin.isSlim ? t('acctPanel.slimArm') : '' }}
            </option>
          </select>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span class="setting-title">{{ t('acctPanel.customSkin') }}</span>
          <span class="setting-desc">{{ t('acctPanel.customSkinDesc') }}</span>
        </div>
        <div class="setting-control">
          <button class="outline-btn" @click="triggerImportSkin">{{ t('acctPanel.importSkin') }}</button>
          <button v-if="hasCustomSkin" class="text-btn danger" @click="clearCustomSkin">{{ t('acctPanel.clear') }}</button>
          <input type="file" ref="skinFileInput" accept="image/png" style="display:none" @change="handleSkinImport" />
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-label">
          <span class="setting-title">{{ t('acctPanel.accountStatus') }}</span>
          <span class="setting-desc">{{ t('acctPanel.accountStatusDesc') }}</span>
        </div>
        <div class="setting-control">
          <label class="toggle-switch" :class="{ disabled: !currentAccount?.enabled }">
            <input type="checkbox" :checked="currentAccount?.enabled" @change="toggleEnabled" />
            <span class="toggle-slider"></span>
          </label>
          <span class="toggle-label">{{ currentAccount?.enabled ? t('acctPanel.enabled') : t('acctPanel.disabled') }}</span>
        </div>
      </div>
    </div>

    <div class="account-list-section">
      <div class="section-header">
        <span class="section-title">{{ t('acctPanel.accountList') }}</span>
        <div class="section-actions">
          <button class="text-btn" @click="triggerExport" :title="t('acctPanel.exportTooltip')">
            {{ t('acctPanel.export') }}
          </button>
          <button class="text-btn" @click="triggerImport" :title="t('acctPanel.importTooltip')">
            {{ t('acctPanel.import') }}
          </button>
          <button class="primary-btn small" @click="openAddAccount">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {{ t('acctPanel.add') }}
          </button>
        </div>
      </div>
      <div class="account-list">
        <div 
          v-for="account in accountsStore.offlineAccounts" 
          :key="account.id"
          class="account-row"
          :class="{ active: accountsStore.currentAccountId === account.id, disabled: !account.enabled }"
          @click="selectAccount(account.id)"
        >
          <div class="row-avatar" :style="{ background: getAvatarGradient(account) }">
            <img v-if="hasAvatarImage(account)" :src="account.avatarUrl" :alt="t('acctPanel.avatar')" class="avatar-img" />
            <template v-else>{{ account.username.charAt(0).toUpperCase() }}</template>
          </div>
          <div class="row-info">
            <span class="row-name">{{ account.username }}</span>
            <span class="row-desc">{{ getSkinLabel(account) }}{{ !account.enabled ? t('acctPanel.disabledSuffix') : '' }}</span>
          </div>
          <div class="row-actions" @click.stop>
            <button v-if="accountsStore.currentAccountId !== account.id" class="row-icon-btn" @click="selectAccount(account.id)" :title="t('acctPanel.switchToAccount')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </button>
            <button class="row-icon-btn danger" @click="confirmDelete(account)" :title="t('acctPanel.deleteAccount')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
              </svg>
            </button>
          </div>
          <div v-if="accountsStore.currentAccountId === account.id" class="row-badge">{{ t('acctPanel.current') }}</div>
        </div>
        <div v-if="accountsStore.offlineAccounts.length === 0" class="empty-list">
          {{ t('acctPanel.emptyList') }}
        </div>
      </div>
    </div>

    <!-- 添加账号弹窗 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal-small">
        <h3>{{ t('acctPanel.addOfflineAccount') }}</h3>
        <input 
          v-model="newAccountName" 
          type="text" 
          :placeholder="t('acctPanel.usernamePlaceholder')"
          maxlength="16"
          @keyup.enter="addAccount"
        />
        <p v-if="addError" class="modal-error">{{ addError }}</p>
        <div class="modal-actions">
          <button class="cancel-btn" @click="showAddModal = false">{{ t('acctPanel.cancel') }}</button>
          <button class="confirm-btn" @click="addAccount">{{ t('acctPanel.add') }}</button>
        </div>
      </div>
    </div>

    <!-- 重命名弹窗 -->
    <div v-if="showRenameModal" class="modal-overlay" @click.self="showRenameModal = false">
      <div class="modal-small">
        <h3>{{ t('acctPanel.renameAccount') }}</h3>
        <input 
          v-model="renameValue" 
          type="text" 
          :placeholder="t('acctPanel.newUsernamePlaceholder')"
          maxlength="16"
          @keyup.enter="confirmRename"
        />
        <p v-if="renameError" class="modal-error">{{ renameError }}</p>
        <div class="modal-actions">
          <button class="cancel-btn" @click="showRenameModal = false">{{ t('acctPanel.cancel') }}</button>
          <button class="confirm-btn" @click="confirmRename">{{ t('acctPanel.confirm') }}</button>
        </div>
      </div>
    </div>

    <!-- 确认删除弹窗 -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal-small">
        <h3>{{ t('acctPanel.confirmDelete') }}</h3>
        <p class="modal-text">{{ t('acctPanel.deleteConfirmBefore') }}<strong>"{{ deleteTargetName }}"</strong>{{ t('acctPanel.deleteConfirmAfter') }}</p>
        <div class="modal-actions">
          <button class="cancel-btn" @click="showDeleteModal = false">{{ t('acctPanel.cancel') }}</button>
          <button class="danger-btn" @click="doDelete">{{ t('acctPanel.delete') }}</button>
        </div>
      </div>
    </div>

    <!-- 隐藏的导入文件输入 -->
    <input type="file" ref="importFileInput" accept="application/json" style="display:none" @change="handleImportAccounts" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccountsStore } from '../stores/accounts'

const { t } = useI18n()
const accountsStore = useAccountsStore()

const currentAccount = computed(() => accountsStore.currentAccount)

const showAddModal = ref(false)
const showRenameModal = ref(false)
const showDeleteModal = ref(false)

const newAccountName = ref('')
const renameValue = ref('')
const addError = ref('')
const renameError = ref('')
const deleteTargetId = ref<string | null>(null)
const deleteTargetName = ref('')

const skinFileInput = ref<HTMLInputElement | null>(null)
const importFileInput = ref<HTMLInputElement | null>(null)
const avatarFileInput = ref<HTMLInputElement | null>(null)

// 是否为图片类型的自定义头像（data URL 或 http(s) 图片地址）
const hasAvatarImage = (account: any): boolean => {
  const url = account?.avatarUrl || ''
  return !!url && !url.startsWith('preset:')
}

const getAvatarGradient = (account: any): string => {
  if (hasAvatarImage(account)) {
    return '#8e8e8e' // 有图片时背景兜底
  }
  const avatarId = account?.avatarUrl?.replace('preset:', '') || 'blue'
  const avatar = accountsStore.presetAvatars.find(a => a.id === avatarId)
  return avatar ? avatar.gradient : accountsStore.presetAvatars[0].gradient
}

const triggerAvatarUpload = () => {
  avatarFileInput.value?.click()
}

const handleAvatarUpload = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  if (file.size > 2 * 1024 * 1024) {
    alert(t('acctPanel.imageTooLarge'))
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    if (currentAccount.value) {
      accountsStore.updateOfflineAccount(currentAccount.value.id, { avatarUrl: dataUrl })
    }
  }
  reader.readAsDataURL(file)
}

const clearCustomAvatar = () => {
  if (currentAccount.value) {
    accountsStore.updateOfflineAccount(currentAccount.value.id, { avatarUrl: '' })
  }
}

const isAvatarSelected = (avatarId: string): boolean => {
  if (!currentAccount.value) return avatarId === 'blue'
  return currentAccount.value.avatarUrl === `preset:${avatarId}` || 
         (!currentAccount.value.avatarUrl && avatarId === 'blue')
}

const selectAvatar = (avatarId: string) => {
  if (currentAccount.value) {
    accountsStore.updateOfflineAccount(currentAccount.value.id, {
      avatarUrl: `preset:${avatarId}`
    })
  }
}

const getCurrentSkinName = computed(() => {
  if (!currentAccount.value) return 'steve'
  const skinUrl = currentAccount.value.skinUrl
  if (skinUrl?.startsWith('preset:')) {
    return skinUrl.replace('preset:', '')
  }
  if (skinUrl) return 'custom'
  return 'steve'
})

const getCurrentSkinLabel = computed(() => {
  if (!currentAccount.value) return ''
  const skinUrl = currentAccount.value.skinUrl
  if (skinUrl?.startsWith('preset:')) {
    const skinId = skinUrl.replace('preset:', '')
    const skin = accountsStore.presetSkins.find(s => s.id === skinId)
    return skin ? skin.name : skinId
  }
  if (skinUrl) return t('acctPanel.customSkin')
  return 'Steve'
})

const hasCustomSkin = computed(() => {
  return currentAccount.value?.skinUrl && !currentAccount.value.skinUrl.startsWith('preset:')
})

const getSkinLabel = (account: any): string => {
  const skinUrl = account.skinUrl
  if (skinUrl?.startsWith('preset:')) {
    const skinId = skinUrl.replace('preset:', '')
    const skin = accountsStore.presetSkins.find(s => s.id === skinId)
    return skin ? skin.name : skinId
  }
  if (skinUrl) return t('acctPanel.custom')
  return 'Steve'
}

// 字符串转 UTF-8 字节数组
const stringToBytes = (str: string): number[] => {
  const bytes: number[] = []
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i)
    if (charCode < 0x80) {
      bytes.push(charCode)
    } else if (charCode < 0x800) {
      bytes.push(0xc0 | (charCode >> 6))
      bytes.push(0x80 | (charCode & 0x3f))
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      bytes.push(0xe0 | (charCode >> 12))
      bytes.push(0x80 | ((charCode >> 6) & 0x3f))
      bytes.push(0x80 | (charCode & 0x3f))
    } else {
      i++
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff))
      bytes.push(0xf0 | (charCode >> 18))
      bytes.push(0x80 | ((charCode >> 12) & 0x3f))
      bytes.push(0x80 | ((charCode >> 6) & 0x3f))
      bytes.push(0x80 | (charCode & 0x3f))
    }
  }
  return bytes
}

// 简单的 MD5 实现（用于生成 Minecraft 离线 UUID）
const md5 = (bytes: number[]): number[] => {
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ]
  const K = new Uint32Array(64)
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * Math.pow(2, 32))
  }

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const msg = bytes.slice()
  const origLen = msg.length * 8
  msg.push(0x80)
  while (msg.length % 64 !== 56) {
    msg.push(0)
  }
  for (let i = 0; i < 8; i++) {
    msg.push((origLen >>> (i * 8)) & 0xff)
  }

  const leftRotate = (x: number, n: number): number => {
    return (x << n) | (x >>> (32 - n))
  }

  for (let offset = 0; offset < msg.length; offset += 64) {
    const M = new Uint32Array(16)
    for (let i = 0; i < 16; i++) {
      M[i] = msg[offset + i * 4] |
             (msg[offset + i * 4 + 1] << 8) |
             (msg[offset + i * 4 + 2] << 16) |
             (msg[offset + i * 4 + 3] << 24)
    }

    let A = a0, B = b0, C = c0, D = d0

    for (let i = 0; i < 64; i++) {
      let F: number, g: number
      if (i < 16) {
        F = (B & C) | (~B & D)
        g = i
      } else if (i < 32) {
        F = (D & B) | (~D & C)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        F = B ^ C ^ D
        g = (3 * i + 5) % 16
      } else {
        F = C ^ (B | ~D)
        g = (7 * i) % 16
      }
      F = (F + A + K[i] + M[g]) | 0
      A = D
      D = C
      C = B
      B = (B + leftRotate(F, S[i])) | 0
    }

    a0 = (a0 + A) | 0
    b0 = (b0 + B) | 0
    c0 = (c0 + C) | 0
    d0 = (d0 + D) | 0
  }

  const result: number[] = []
  const ints = [a0, b0, c0, d0]
  for (const n of ints) {
    result.push(n & 0xff)
    result.push((n >>> 8) & 0xff)
    result.push((n >>> 16) & 0xff)
    result.push((n >>> 24) & 0xff)
  }
  return result
}

// 生成 Minecraft 离线账号 UUID (与官方一致: UUID.nameUUIDFromBytes("OfflinePlayer:" + name))
const generateOfflineUuid = (username: string): string => {
  const bytes = stringToBytes('OfflinePlayer:' + username)
  const hash = md5(bytes)
  // 设置版本号为 3 (MD5)
  hash[6] = (hash[6] & 0x0f) | 0x30
  // 设置变体位
  hash[8] = (hash[8] & 0x3f) | 0x80

  const hex = hash.map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20,32)}`
}

const currentAccountUuid = computed(() => {
  if (!currentAccount.value) return '00000000-0000-0000-0000-000000000000'
  return generateOfflineUuid(currentAccount.value.username)
})

const copyUuid = async () => {
  try {
    await navigator.clipboard.writeText(currentAccountUuid.value)
  } catch (e) {
    console.error('复制失败:', e)
  }
}

const onSkinChange = (e: Event) => {
  const skinId = (e.target as HTMLSelectElement).value
  if (currentAccount.value) {
    accountsStore.updateOfflineAccount(currentAccount.value.id, {
      skinUrl: `preset:${skinId}`
    })
  }
}

const toggleEnabled = () => {
  if (currentAccount.value) {
    accountsStore.toggleAccountEnabled(currentAccount.value.id)
  }
}

const selectAccount = (id: string) => {
  accountsStore.selectAccount(id)
}

// 添加账号
const openAddAccount = () => {
  newAccountName.value = ''
  addError.value = ''
  showAddModal.value = true
}

const addAccount = () => {
  const name = newAccountName.value.trim()
  if (!name) {
    addError.value = t('acctPanel.usernameEmpty')
    return
  }
  if (accountsStore.isUsernameTaken(name)) {
    addError.value = t('acctPanel.usernameExists')
    return
  }
  const newAccount = accountsStore.addOfflineAccount(name, 'preset:steve', '', 'preset:blue')
  if (newAccount) {
    accountsStore.selectAccount(newAccount.id)
  }
  showAddModal.value = false
}

// 重命名
const openRenameModal = () => {
  if (!currentAccount.value) return
  renameValue.value = currentAccount.value.username
  renameError.value = ''
  showRenameModal.value = true
}

const confirmRename = () => {
  const name = renameValue.value.trim()
  if (!name) {
    renameError.value = t('acctPanel.usernameEmpty')
    return
  }
  if (!currentAccount.value) return
  if (accountsStore.isUsernameTaken(name, currentAccount.value.id)) {
    renameError.value = t('acctPanel.usernameExists')
    return
  }
  accountsStore.updateOfflineAccount(currentAccount.value.id, { username: name })
  showRenameModal.value = false
}

// 删除
const confirmDeleteCurrent = () => {
  if (!currentAccount.value) return
  confirmDelete(currentAccount.value)
}

const confirmDelete = (account: any) => {
  deleteTargetId.value = account.id
  deleteTargetName.value = account.username
  showDeleteModal.value = true
}

const doDelete = () => {
  if (deleteTargetId.value) {
    accountsStore.removeOfflineAccount(deleteTargetId.value)
  }
  showDeleteModal.value = false
  deleteTargetId.value = null
  deleteTargetName.value = ''
}

// 皮肤导入
const triggerImportSkin = () => {
  skinFileInput.value?.click()
}

const clearCustomSkin = () => {
  if (currentAccount.value) {
    accountsStore.updateOfflineAccount(currentAccount.value.id, {
      skinUrl: 'preset:steve'
    })
  }
}

const handleSkinImport = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  if (file.size > 2 * 1024 * 1024) {
    alert(t('acctPanel.skinTooLarge'))
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string
    if (currentAccount.value) {
      accountsStore.updateOfflineAccount(currentAccount.value.id, {
        skinUrl: dataUrl
      })
    }
  }
  reader.readAsDataURL(file)
  ;(event.target as HTMLInputElement).value = ''
}

// 导出/导入
const triggerExport = () => {
  const json = accountsStore.exportAccounts()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `minecraft-accounts-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const triggerImport = () => {
  importFileInput.value?.click()
}

const handleImportAccounts = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const json = e.target?.result as string
      const result = accountsStore.importAccounts(json)
      alert(t('acctPanel.importResult', { success: result.success, failed: result.failed }))
    } catch {
      alert(t('acctPanel.importFailed'))
    }
  }
  reader.readAsText(file)
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<style scoped>
.account-panel-simple {
  width: 100%;
  height: 100%;
  background: var(--bg-primary);
  padding: 24px 32px;
  overflow-y: auto;
  box-sizing: border-box;
}

.panel-header {
  margin-bottom: 20px;
}

.panel-header h2 {
  margin: 0 0 4px 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.header-subtitle {
  font-size: 13px;
  color: var(--text-tertiary);
}

.current-account-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  margin-bottom: 24px;
}

.account-avatar {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.account-avatar .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

.account-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.account-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.account-meta {
  font-size: 13px;
  color: var(--text-tertiary);
}

.card-actions {
  display: flex;
  gap: 6px;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.icon-btn svg {
  width: 16px;
  height: 16px;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.icon-btn.danger:hover {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  border-color: rgba(231, 76, 60, 0.3);
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 24px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: var(--border-radius-md);
  transition: background 0.15s;
}

.setting-item:hover {
  background: var(--bg-hover);
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.setting-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

.setting-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.uuid-control {
  max-width: 360px;
}

.uuid-value {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 6px 10px;
  border-radius: var(--border-radius-sm);
  border: 1px solid var(--border-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
}

.text-btn {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.text-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.text-btn.danger {
  color: #e74c3c;
  border-color: rgba(231, 76, 60, 0.3);
}

.text-btn.danger:hover {
  background: rgba(231, 76, 60, 0.1);
  color: #e74c3c;
}

.type-badge {
  padding: 5px 12px;
  background: rgba(0, 212, 255, 0.1);
  color: var(--accent-primary);
  border-radius: var(--border-radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.avatar-picker {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.avatar-dot {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.15s;
}

.avatar-dot:hover {
  transform: scale(1.1);
}

.avatar-dot.active {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.2);
}

.skin-select {
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  outline: none;
  min-width: 160px;
}

.skin-select:focus {
  border-color: var(--accent-primary);
}

.outline-btn {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.outline-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

/* 开关样式 */
.toggle-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: relative;
  width: 40px;
  height: 22px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 22px;
  transition: all 0.2s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  top: 2px;
  background: var(--text-tertiary);
  border-radius: 50%;
  transition: all 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
  background: #000;
}

.toggle-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 8px;
}

.account-list-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.primary-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  background: var(--accent-primary);
  color: #000;
  border: none;
  border-radius: var(--border-radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.primary-btn.small {
  padding: 5px 10px;
  font-size: 12px;
}

.primary-btn svg {
  width: 14px;
  height: 14px;
}

.primary-btn:hover {
  background: #00b8e6;
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 280px;
  overflow-y: auto;
}

.empty-list {
  padding: 32px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.account-row:hover {
  background: var(--bg-hover);
}

.account-row.active {
  background: rgba(0, 212, 255, 0.08);
}

.account-row.disabled {
  opacity: 0.5;
}

.row-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.row-avatar .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.row-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.row-desc {
  font-size: 11px;
  color: var(--text-tertiary);
}

.row-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.account-row:hover .row-actions {
  opacity: 1;
}

.row-icon-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.row-icon-btn svg {
  width: 14px;
  height: 14px;
}

.row-icon-btn:hover {
  background: var(--bg-primary);
  color: var(--accent-primary);
}

.row-icon-btn.danger:hover {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}

.row-badge {
  padding: 3px 8px;
  background: var(--accent-primary);
  color: #000;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-small {
  background: var(--bg-secondary);
  border-radius: var(--border-radius-lg);
  padding: 24px;
  width: 360px;
  max-width: 90vw;
}

.modal-small h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
  font-size: 18px;
}

.modal-text {
  margin: 0 0 20px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.modal-text strong {
  color: var(--text-primary);
}

.modal-error {
  margin: -8px 0 12px 0;
  color: #e74c3c;
  font-size: 12px;
}

.modal-small input {
  width: 100%;
  padding: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  box-sizing: border-box;
  margin-bottom: 16px;
}

.modal-small input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.cancel-btn, .confirm-btn, .danger-btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--border-radius-sm);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.cancel-btn {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.confirm-btn {
  background: var(--accent-primary);
  color: #000;
  font-weight: 500;
}

.confirm-btn:hover {
  background: #00b8e6;
}

.danger-btn {
  background: #e74c3c;
  color: #fff;
  font-weight: 500;
}

.danger-btn:hover {
  background: #c0392b;
}
</style>

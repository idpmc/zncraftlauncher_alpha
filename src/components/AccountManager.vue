<template>
  <div class="account-manager">
    <div class="manager-header">
      <h3>{{ t('acctMgr.title') }}</h3>
      <div class="header-actions">
        <button class="action-btn" @click="exportAccounts" :title="t('acctMgr.exportTitle')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {{ t('acctMgr.export') }}
        </button>
        <button class="action-btn" @click="triggerImport" :title="t('acctMgr.importTitle')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {{ t('acctMgr.import') }}
        </button>
        <input type="file" ref="fileInput" accept=".json" style="display:none" @change="importAccounts">
        <button class="add-btn" @click="openAddModal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ t('acctMgr.addAccount') }}
        </button>
      </div>
    </div>
    
    <div class="accounts-list">
      <div 
        v-for="account in accountsStore.offlineAccounts" 
        :key="account.id"
        class="account-item"
        :class="{ 
          selected: accountsStore.currentAccountId === account.id,
          disabled: !account.enabled
        }"
        @click="selectAccount(account.id)"
      >
        <div class="account-avatar">
          <img 
            v-if="account.avatarUrl" 
            :src="account.avatarUrl" 
            :alt="t('acctMgr.avatar')" 
            class="avatar-img"
          />
          <div v-else class="avatar-placeholder">{{ account.username.charAt(0).toUpperCase() }}</div>
        </div>
        <div class="account-info">
          <span class="account-name">{{ account.username }}</span>
          <span class="account-type">
            {{ t('acctMgr.offlineAccount') }}
            <span v-if="!account.enabled" class="disabled-tag">{{ t('acctMgr.disabledTag') }}</span>
          </span>
          <span class="account-meta">
            {{ t('acctMgr.created', { date: formatDate(account.createdAt) }) }}
          </span>
        </div>
        <div class="account-actions">
          <button class="action-btn" @click.stop="toggleEnabled(account)" :title="account.enabled ? t('acctMgr.disable') : t('acctMgr.enable')">
            <svg v-if="account.enabled" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
          <button class="action-btn" @click.stop="editAccount(account)" :title="t('acctMgr.edit')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn delete" @click.stop="confirmDelete(account)" :title="t('acctMgr.delete')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div v-if="accountsStore.offlineAccounts.length === 0" class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <p>{{ t('acctMgr.noOfflineAccounts') }}</p>
        <button class="add-first-btn" @click="openAddModal">{{ t('acctMgr.addFirstAccount') }}</button>
      </div>
    </div>
    
    <!-- 添加/编辑账号弹窗 -->
    <div class="modal-overlay" v-if="showAddModal || editingAccount" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingAccount ? t('acctMgr.editAccount') : t('acctMgr.addOfflineAccount') }}</h3>
          <button class="close-btn" @click="closeModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        
        <div class="modal-body">
          <div class="form-group">
            <label>{{ t('acctMgr.usernameLabel') }}</label>
            <input 
              v-model="formData.username" 
              type="text" 
              :placeholder="t('acctMgr.usernamePlaceholder')"
              maxlength="16"
              @input="checkUsername"
            />
            <p v-if="usernameError" class="error-hint">{{ usernameError }}</p>
          </div>

          <div class="form-group">
            <label>{{ t('acctMgr.customAvatar') }}</label>
            <div class="avatar-upload-section">
              <div class="avatar-preview" :class="{ 'has-image': previewAvatarUrl }">
                <img v-if="previewAvatarUrl" :src="previewAvatarUrl" :alt="t('acctMgr.avatarPreview')" />
                <span v-else>{{ formData.username ? formData.username.charAt(0).toUpperCase() : '?' }}</span>
              </div>
              <div class="avatar-actions">
                <button type="button" class="upload-btn" @click="triggerAvatarUpload">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  {{ t('acctMgr.uploadAvatar') }}
                </button>
                <button v-if="formData.avatarUrl" type="button" class="remove-btn" @click="removeAvatar">
                  {{ t('acctMgr.remove') }}
                </button>
              </div>
              <input type="file" ref="avatarInput" accept="image/*" style="display:none" @change="handleAvatarUpload" />
              <p class="hint">{{ t('acctMgr.avatarHint') }}</p>
            </div>
          </div>
          
          <div class="form-group">
            <label>{{ t('acctMgr.selectSkin') }}</label>
            <div class="skin-selector">
              <div 
                v-for="skin in accountsStore.presetSkins" 
                :key="skin.id"
                class="skin-option"
                :class="{ selected: formData.skinUrl === `/skins/${skin.id}.png` }"
                @click="formData.skinUrl = `/skins/${skin.id}.png`"
              >
                <div class="skin-preview-mini" :class="[skin.id, skin.isSlim ? 'slim' : 'wide']"></div>
                <span>{{ skin.name }}</span>
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label>{{ t('acctMgr.customSkinUrl') }}</label>
            <input 
              v-model="formData.skinUrl" 
              type="url" 
              :placeholder="t('acctMgr.skinUrlPlaceholder')"
            />
          </div>
          
          <div class="form-group">
            <label>{{ t('acctMgr.capeUrl') }}</label>
            <input 
              v-model="formData.capeUrl" 
              type="url" 
              :placeholder="t('acctMgr.capeUrlPlaceholder')"
            />
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="cancel-btn" @click="closeModal">{{ t('acctMgr.cancel') }}</button>
          <button class="confirm-btn" @click="saveAccount" :disabled="!canSave">
            {{ editingAccount ? t('acctMgr.save') : t('acctMgr.add') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Toast通知 -->
    <div v-if="toast.show" class="toast" :class="toast.type">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAccountsStore, type OfflineAccount } from '../stores/accounts'

const { t } = useI18n()
const accountsStore = useAccountsStore()

const showAddModal = ref(false)
const editingAccount = ref<OfflineAccount | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const usernameError = ref('')

const toast = reactive({
  show: false,
  message: '',
  type: 'info' as 'success' | 'error' | 'info'
})

const formData = reactive({
  username: '',
  skinUrl: '',
  capeUrl: '',
  avatarUrl: ''
})

const avatarInput = ref<HTMLInputElement | null>(null)
const previewAvatarUrl = ref('')  // 本地预览用

const canSave = computed(() => {
  return formData.username.trim().length >= 1 && !usernameError.value
})

// 头像上传处理
const triggerAvatarUpload = () => {
  avatarInput.value?.click()
}

const handleAvatarUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  if (file.size > 2 * 1024 * 1024) {
    showToast(t('acctMgr.imageTooLarge'), 'error')
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    formData.avatarUrl = e.target?.result as string
    previewAvatarUrl.value = formData.avatarUrl
  }
  reader.readAsDataURL(file)
  
  // 清空input
  ;(event.target as HTMLInputElement).value = ''
}

const removeAvatar = () => {
  formData.avatarUrl = ''
  previewAvatarUrl.value = ''
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  toast.message = message
  toast.type = type
  toast.show = true
  setTimeout(() => { toast.show = false }, 3000)
}

const checkUsername = () => {
  const username = formData.username.trim()
  if (!username) {
    usernameError.value = ''
    return
  }
  if (username.length < 1) {
    usernameError.value = t('acctMgr.usernameMin')
  } else if (accountsStore.isUsernameTaken(username, editingAccount.value?.id)) {
    usernameError.value = t('acctMgr.usernameTaken')
  } else {
    usernameError.value = ''
  }
}

const openAddModal = () => {
  showAddModal.value = true
  editingAccount.value = null
  formData.username = ''
  formData.skinUrl = ''
  formData.capeUrl = ''
  formData.avatarUrl = ''
  previewAvatarUrl.value = ''
  usernameError.value = ''
}

const selectAccount = (id: string) => {
  accountsStore.selectAccount(id)
}

const editAccount = (account: OfflineAccount) => {
  editingAccount.value = account
  formData.username = account.username
  formData.skinUrl = account.skinUrl
  formData.capeUrl = account.capeUrl
  formData.avatarUrl = account.avatarUrl
  previewAvatarUrl.value = account.avatarUrl
  usernameError.value = ''
}

const toggleEnabled = (account: OfflineAccount) => {
  accountsStore.toggleAccountEnabled(account.id)
  showToast(account.enabled ? t('acctMgr.accountDisabled') : t('acctMgr.accountEnabled'), 'info')
}

const confirmDelete = (account: OfflineAccount) => {
  if (confirm(t('acctMgr.deleteConfirm', { name: account.username }))) {
    accountsStore.removeOfflineAccount(account.id)
    showToast(t('acctMgr.accountDeleted'), 'success')
  }
}

const closeModal = () => {
  showAddModal.value = false
  editingAccount.value = null
  formData.username = ''
  formData.skinUrl = ''
  formData.capeUrl = ''
  formData.avatarUrl = ''
  previewAvatarUrl.value = ''
  usernameError.value = ''
}

const saveAccount = () => {
  const username = formData.username.trim()
  if (!username || usernameError.value) return
  
  if (editingAccount.value) {
    accountsStore.updateOfflineAccount(editingAccount.value.id, {
      username,
      skinUrl: formData.skinUrl.trim(),
      capeUrl: formData.capeUrl.trim(),
      avatarUrl: formData.avatarUrl
    })
    showToast(t('acctMgr.accountSaved'), 'success')
  } else {
    const newAccount = accountsStore.addOfflineAccount(
      username,
      formData.skinUrl.trim(),
      formData.capeUrl.trim(),
      formData.avatarUrl
    )
    if (newAccount) {
      accountsStore.selectAccount(newAccount.id)
      showToast(t('acctMgr.accountAdded'), 'success')
    } else {
      showToast(t('acctMgr.addFailed'), 'error')
      return
    }
  }
  
  closeModal()
}

const exportAccounts = () => {
  if (accountsStore.offlineAccounts.length === 0) {
    showToast(t('acctMgr.noAccountsToExport'), 'error')
    return
  }
  const json = accountsStore.exportAccounts()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mc-accounts-${new Date().toISOString().slice(0,10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  showToast(t('acctMgr.exportedCount', { n: accountsStore.offlineAccounts.length }), 'success')
}

const triggerImport = () => {
  fileInput.value?.click()
}

const importAccounts = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    const result = accountsStore.importAccounts(content)
    if (result.success > 0) {
      showToast(result.failed > 0 ? t('acctMgr.importPartial', { success: result.success, failed: result.failed }) : t('acctMgr.importSuccess', { n: result.success }), 'success')
    } else {
      showToast(t('acctMgr.importFailed'), 'error')
    }
  }
  reader.readAsText(file)
  // 清空input以允许重复选择同一文件
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<style scoped>
.account-manager {
  padding: 16px;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.manager-header h3 {
  margin: 0;
  color: #fff;
  font-size: 16px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.add-btn, .action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #00d4ff;
  color: #000;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.add-btn:hover {
  background: #00b8e6;
}

.add-btn svg, .action-btn svg {
  width: 16px;
  height: 16px;
}

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.account-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.account-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.account-item.selected {
  background: rgba(0, 212, 255, 0.15);
  border-color: #00d4ff;
}

.account-item.disabled {
  opacity: 0.5;
}

.account-avatar {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #00d4ff, #0077aa);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
}

.account-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-name {
  color: #fff;
  font-weight: 500;
  font-size: 14px;
}

.account-type {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.disabled-tag {
  color: #ff6b6b;
}

.account-meta {
  color: rgba(255, 255, 255, 0.3);
  font-size: 10px;
}

.account-actions {
  display: flex;
  gap: 4px;
}

.account-actions .action-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  justify-content: center;
}

.action-btn.delete:hover {
  background: rgba(255, 68, 68, 0.3);
  color: #ff4444;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: rgba(255, 255, 255, 0.4);
}

.empty-state svg {
  width: 60px;
  height: 60px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0 0 16px 0;
}

.add-first-btn {
  padding: 10px 20px;
  background: #00d4ff;
  color: #000;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
}

/* Modal */
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

.modal {
  background: #1a1a2e;
  border-radius: 16px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header h3 {
  margin: 0;
  color: #fff;
  font-size: 18px;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.close-btn svg {
  width: 18px;
  height: 18px;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  margin-bottom: 8px;
}

.form-group input {
  width: 100%;
  padding: 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #00d4ff;
}

.form-group input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.hint {
  margin: 6px 0 0 0;
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
}

.avatar-upload-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00d4ff, #0077aa);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 3px solid rgba(255, 255, 255, 0.2);
}

.avatar-preview.has-image {
  background: none;
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-preview span {
  color: #fff;
  font-size: 32px;
  font-weight: bold;
}

.avatar-actions {
  display: flex;
  gap: 8px;
}

.upload-btn, .remove-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn {
  background: rgba(0, 212, 255, 0.2);
  color: #00d4ff;
}

.upload-btn:hover {
  background: rgba(0, 212, 255, 0.3);
}

.upload-btn svg {
  width: 16px;
  height: 16px;
}

.remove-btn {
  background: rgba(255, 68, 68, 0.2);
  color: #ff6b6b;
}

.remove-btn:hover {
  background: rgba(255, 68, 68, 0.3);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.skin-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skin-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
  min-width: 60px;
}

.skin-option:hover {
  background: rgba(255, 255, 255, 0.1);
}

.skin-option.selected {
  border-color: #00d4ff;
  background: rgba(0, 212, 255, 0.1);
}

.skin-preview-mini {
  width: 20px;
  height: 28px;
  background: #8b8b8b;
  border-radius: 2px;
  position: relative;
}

.skin-preview-mini.wide {
  width: 22px;
}

.skin-preview-mini::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  background: #c4a484;
  border-radius: 2px;
}

.skin-option span {
  color: rgba(255, 255, 255, 0.7);
  font-size: 10px;
}

.error-hint {
  margin: 6px 0 0 0;
  color: #ff6b6b;
  font-size: 11px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.cancel-btn {
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.confirm-btn {
  padding: 10px 20px;
  background: #00d4ff;
  color: #000;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.confirm-btn:hover {
  background: #00b8e6;
}

.confirm-btn:disabled {
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.5);
  cursor: not-allowed;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  z-index: 2000;
  animation: toastIn 0.3s ease;
}

.toast.success {
  background: #2ecc71;
}

.toast.error {
  background: #e74c3c;
}

.toast.info {
  background: #3498db;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>

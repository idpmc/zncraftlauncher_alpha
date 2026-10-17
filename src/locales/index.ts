import { createI18n } from 'vue-i18n'
import zh from './zh'
import en from './en'
import { parts } from './parts'

export type LocaleType = 'zh' | 'en'

export const localeList = [
  { id: 'zh', name: '简体中文' },
  { id: 'en', name: 'English' }
]

// 深合并：把各分片（./parts/*）合并进主语言包，允许分片扩展/覆盖同名命名空间
function deepMerge(target: any, source: any): any {
  if (!source || typeof source !== 'object') return target
  for (const key of Object.keys(source)) {
    const value = (source as any)[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const base = target[key] && typeof target[key] === 'object' && !Array.isArray(target[key]) ? target[key] : {}
      target[key] = deepMerge(base, value)
    } else {
      target[key] = value
    }
  }
  return target
}

const zhMessages: any = deepMerge(deepMerge({}, zh), {})
const enMessages: any = deepMerge(deepMerge({}, en), {})
for (const part of parts) {
  if (part?.zh) deepMerge(zhMessages, part.zh)
  if (part?.en) deepMerge(enMessages, part.en)
}

const savedLocale = localStorage.getItem('locale') as LocaleType | null

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale || 'zh',
  fallbackLocale: 'zh',
  messages: {
    zh: zhMessages,
    en: enMessages
  }
})

export const setLocale = (locale: LocaleType) => {
  i18n.global.locale.value = locale
  localStorage.setItem('locale', locale)
  document.documentElement.setAttribute('lang', locale)
  // 同步到主进程，使主进程发出的日志/状态/错误消息也使用对应语言
  try { (window as any).electronAPI?.setLocale?.(locale) } catch { /* ignore */ }
}

export const getLocale = () => i18n.global.locale.value

// 启动时把持久化的语言同步给主进程
export function initMainLocale() {
  try { (window as any).electronAPI?.setLocale?.(getLocale()) } catch { /* ignore */ }
}

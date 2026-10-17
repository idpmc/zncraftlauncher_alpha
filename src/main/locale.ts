import { translate } from '../shared/rt'

let mainLocale: 'zh' | 'en' = 'zh'

export function setMainLocale(locale: string) {
  mainLocale = locale === 'en' ? 'en' : 'zh'
}

export function getMainLocale(): 'zh' | 'en' {
  return mainLocale
}

// 主进程翻译助手：mt('mc.someKey', { n: 1 })
export function mt(key: string, params?: Record<string, any>): string {
  return translate(mainLocale, key, params)
}

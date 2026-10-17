import storesCore from './storesCore'
import storesNet from './storesNet'
import storesMisc from './storesMisc'
import mainCore from './mainCore'
import mainUtils from './mainUtils'

// 运行时消息（主进程 + 渲染进程 store 共用）的合并语言包
function merge(target: any, source: any): any {
  if (!source || typeof source !== 'object') return target
  for (const key of Object.keys(source)) {
    const value = (source as any)[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const base = target[key] && typeof target[key] === 'object' ? target[key] : {}
      target[key] = merge(base, value)
    } else {
      target[key] = value
    }
  }
  return target
}

const tables: any[] = [storesCore, storesNet, storesMisc, mainCore, mainUtils]

export const rt: { zh: any; en: any } = { zh: {}, en: {} }
for (const table of tables) {
  if (table?.zh) merge(rt.zh, table.zh)
  if (table?.en) merge(rt.en, table.en)
}

// 纯函数翻译：供主进程使用（不带 vue-i18n 依赖）
export function translate(locale: string, key: string, params?: Record<string, any>): string {
  const table = locale === 'en' ? rt.en : rt.zh
  let cur: any = table
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object') { cur = undefined; break }
    cur = cur[part]
  }
  let str = typeof cur === 'string' ? cur : key
  if (params) {
    for (const name of Object.keys(params)) {
      str = str.split('{' + name + '}').join(String(params[name]))
    }
  }
  return str
}

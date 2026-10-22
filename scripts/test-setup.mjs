/**
 * 单元测试环境准备（node --import）
 *
 * 1) 补齐浏览器 API：src/locales/index.ts 等模块在导入时会读 localStorage。
 * 2) 模块解析钩子：项目源码用的是 Vite/bundler 风格的无扩展名相对导入
 *    （如 `from './telemetry'`），Vite 能解析，但 Node 的 ESM 解析要求显式扩展名。
 *    这里把无扩展名的相对导入补成 .ts / index.ts，让单元测试可以直接
 *    import 真实的 store，而不必为此改动生产代码。
 *
 * 用法：node --import ./scripts/test-setup.mjs --test "src 全局匹配 *.test.ts"
 */
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// ---------- 0) 构建期常量（Vite define 的等价物） ----------
// src/stores/telemetry.ts 等模块在顶层会引用 __APP_VERSION__，
// 这些常量平时由 vite.config.ts 的 define 注入，node 下需手动补上。
const require = createRequire(import.meta.url)
const { version: pkgVersion = '0.0.0-test' } = require('../package.json')
const appVersionCore = String(pkgVersion).split('-')[0]
globalThis.__APP_VERSION__ = pkgVersion
globalThis.__APP_VERSION_CORE__ = appVersionCore
globalThis.__APP_LABEL__ = appVersionCore

// ---------- 1) 浏览器 API polyfill ----------
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)) },
    removeItem: (k) => { store.delete(String(k)) },
    clear: () => { store.clear() },
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size }
  }
}

// ---------- 2) 无扩展名相对导入的解析钩子 ----------
registerHooks({
  resolve(specifier, context, nextResolve) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier)

    if (isRelative && !hasExtension && context.parentURL) {
      const base = new URL(specifier, context.parentURL)
      const candidates = [`${base.href}.ts`, `${base.href}/index.ts`, `${base.href}.js`]
      for (const url of candidates) {
        if (existsSync(fileURLToPath(url))) {
          return {
            url,
            format: url.endsWith('.ts') ? 'module-typescript' : 'module',
            shortCircuit: true
          }
        }
      }
    }

    return nextResolve(specifier, context)
  }
})

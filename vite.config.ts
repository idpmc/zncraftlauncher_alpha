import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// 版本号的唯一来源是 package.json，界面各处不再硬编码
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }
const APP_VERSION: string = pkg.version
const APP_VERSION_CORE = APP_VERSION.split('-')[0]
const APP_LABEL = APP_VERSION.includes('-') ? `Alpha ${APP_VERSION_CORE}` : APP_VERSION_CORE

// vite-plugin-electron 会为主进程 / preload 各跑一次独立的 Vite 构建，
// 它构造的子配置（resolveViteConfig）**不继承**根配置的 define。
// 所以这些常量必须显式注入到每个子构建，否则 out/main/index.js 里
// 会残留裸的 __APP_VERSION__ 之类的标识符，运行时抛
// "ReferenceError: __APP_VERSION__ is not defined"。
function buildDefines() {
  return {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_VERSION_CORE__: JSON.stringify(APP_VERSION_CORE),
    __APP_LABEL__: JSON.stringify(APP_LABEL)
  }
}

// index.html 的 <title> 拿不到 define 注入的常量，用占位符在这里替换
function htmlVersionPlugin(): Plugin {
  return {
    name: 'zncl-html-version',
    transformIndexHtml(html) {
      return html
        .replace(/__APP_LABEL__/g, APP_LABEL)
        .replace(/__APP_VERSION_CORE__/g, APP_VERSION_CORE)
    }
  }
}

export default defineConfig({
  define: buildDefines(),
  plugins: [
    htmlVersionPlugin(),
    vue(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          define: buildDefines(),
          build: {
            outDir: 'out/main',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        entry: 'src/preload/index.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          define: buildDefines(),
          build: {
            outDir: 'out/preload',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ])
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5174
  }
})

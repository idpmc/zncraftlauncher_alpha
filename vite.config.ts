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

// 是否启用「原版游戏本体下载」能力。
// 国内发行版（npm run build）为 false：构建期物理剔除 src/main/download/ 整个目录，
// 产物中不含 bmclapi / launchermeta.mojang.com 等字符串，反编译也找不到下载逻辑。
// 开源开发版（npm run build:intl）显式置 true 才开启。
const ENABLE_MC_DOWNLOAD = process.env.ZNCL_MC_DOWNLOAD === '1'

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
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_VERSION_CORE__: JSON.stringify(APP_VERSION_CORE),
    __APP_LABEL__: JSON.stringify(APP_LABEL),
    __ENABLE_MC_DOWNLOAD__: JSON.stringify(ENABLE_MC_DOWNLOAD)
  },
  plugins: [
    htmlVersionPlugin(),
    vue(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
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

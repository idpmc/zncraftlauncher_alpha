// 由 vite.config.ts 的 define 注入，取值全部来自 package.json 的 version
declare const __APP_VERSION__: string
declare const __APP_VERSION_CORE__: string
declare const __APP_LABEL__: string

// 构建开关：是否启用原版游戏本体下载（见 vite.config.ts / docs/合规整改清单.md）
// 国内发行版 build 为 false，开源开发版 build:intl 为 true
declare const __ENABLE_MC_DOWNLOAD__: boolean
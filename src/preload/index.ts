import { contextBridge, ipcRenderer } from 'electron'

// 暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 游戏启动（支持自定义目录名，传递 Java 设置用于自动匹配）
  launchGame: (versionId: string, username?: string, directoryName?: string, settings?: { javaPath?: string; customJavaArgs?: string; skipJavaCheck?: boolean; autoDownloadJava?: boolean }) => ipcRenderer.invoke('launch-game', versionId, username, directoryName, settings),

  // 检查 Java
  checkJava: (allowNewerJava?: boolean) => ipcRenderer.invoke('check-java', allowNewerJava),

  // 列出所有已安装的 Java
  listJavas: () => ipcRenderer.invoke('list-javas'),

  // 打开 Minecraft 目录
  openMinecraftDir: () => ipcRenderer.invoke('open-minecraft-dir'),

  // 获取/设置游戏目录
  getGameDir: () => ipcRenderer.invoke('get-game-dir'),
  setGameDir: (dir: string) => ipcRenderer.invoke('set-game-dir', dir),

  // 设置下载源策略：official / mirror / auto
  setDownloadSource: (mode: string) => ipcRenderer.invoke('set-download-source', mode),

  // 下载并发线程数（全局连接预算）
  setDownloadThreads: (n: number) => ipcRenderer.invoke('set-download-threads', n),
  getDownloadThreads: () => ipcRenderer.invoke('get-download-threads'),

  // Modrinth 国内镜像开关
  setModrinthMirror: (enabled: boolean) => ipcRenderer.invoke('set-modrinth-mirror', enabled),

  // 下载代理（HTTP / SOCKS5）：只接管启动器自身的资源下载，节点由用户自行提供
  setProxy: (cfg: { enabled?: boolean; type?: 'http' | 'socks5'; host?: string; port?: number; username?: string; password?: string; forGame?: boolean }) => ipcRenderer.invoke('set-proxy', cfg),
  getProxy: () => ipcRenderer.invoke('get-proxy'),
  testProxy: (cfg?: { enabled?: boolean; type?: 'http' | 'socks5'; host?: string; port?: number; username?: string; password?: string }) => ipcRenderer.invoke('test-proxy', cfg),

  // 同步界面语言到主进程
  setLocale: (locale: string) => ipcRenderer.invoke('set-locale', locale),

  // 打开版本文件夹
  openVersionDir: (versionId: string, directoryName?: string) => ipcRenderer.invoke('open-version-dir', versionId, directoryName),

  // 打开存档文件夹
  openSavesDir: (directoryName?: string) => ipcRenderer.invoke('open-saves-dir', directoryName),

  // 下载版本（支持自定义目录名）
  downloadVersion: (versionId: string, versionUrl: string, directoryName?: string) => ipcRenderer.invoke('download-version', versionId, versionUrl, directoryName),

  // 监听下载进度
  onDownloadProgress: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('download-progress', callback)
    return () => ipcRenderer.removeListener('download-progress', callback)
  },

  // 监听下载完成
  onDownloadComplete: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('download-complete', callback)
    return () => ipcRenderer.removeListener('download-complete', callback)
  },

  // 暂停下载
  pauseDownload: (versionId: string) => ipcRenderer.invoke('pause-download', versionId),

  // 继续下载
  resumeDownload: (versionId: string) => ipcRenderer.invoke('resume-download', versionId),

  // 取消下载
  cancelDownload: (versionId: string) => ipcRenderer.invoke('cancel-download', versionId),

  // 获取当前仍在进行中的版本下载（刷新后恢复下载状态用）
  getActiveDownloads: () => ipcRenderer.invoke('get-active-downloads'),

  // 监听下载暂停
  onDownloadPaused: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('download-paused', callback)
    return () => ipcRenderer.removeListener('download-paused', callback)
  },

  // 监听下载继续
  onDownloadResumed: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('download-resumed', callback)
    return () => ipcRenderer.removeListener('download-resumed', callback)
  },

  // 监听下载取消
  onDownloadCancelled: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('download-cancelled', callback)
    return () => ipcRenderer.removeListener('download-cancelled', callback)
  },

  // 强制重置所有下载状态（应急）
  forceResetDownloads: () => ipcRenderer.invoke('force-reset-downloads'),

  // 下载模组/资源包/光影包（支持版本隔离 + 真实文件名 + 完整性校验）
  downloadMod: (modId: string, modName: string, downloadUrl: string, versionId: string, targetGameVersion?: string, subDir?: string, fileName?: string, expectedSize?: number, expectedSha1?: string) =>
    ipcRenderer.invoke('download-mod', modId, modName, downloadUrl, versionId, targetGameVersion, subDir, fileName, expectedSize, expectedSha1),

  // 管理已安装文件：删除 / 禁用（ .disabled ）/ 启用
  manageInstalledFile: (action: 'delete' | 'disable' | 'enable', subDir?: string, targetGameVersion?: string, fileName?: string, modName?: string, versionId?: string) =>
    ipcRenderer.invoke('manage-installed-file', action, subDir, targetGameVersion, fileName, modName, versionId),

  // 真正取消模组/光影/资源包/整合包下载（中断主进程 HTTP 请求，而不是只改界面状态）
  cancelModDownload: (modId: string) => ipcRenderer.invoke('cancel-mod-download', modId),

  // 安装整合包（独立版本，不依赖原版）
  installModpack: (modId: string, modName: string, downloadUrl: string, versionId: string, expectedSize?: number, expectedSha1?: string) =>
    ipcRenderer.invoke('install-modpack', modId, modName, downloadUrl, versionId, expectedSize, expectedSha1),

  // 监听模组下载进度
  onModDownloadProgress: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('mod-download-progress', callback)
    return () => ipcRenderer.removeListener('mod-download-progress', callback)
  },

  // 检查版本是否实际安装
  checkVersionInstalled: (versionId: string, directoryName?: string) => ipcRenderer.invoke('check-version-installed', versionId, directoryName),

  // 扫描当前游戏目录下已安装的版本
  scanInstalledVersions: () => ipcRenderer.invoke('scan-installed-versions'),

  // 检查资源完整性并修复缺失资源
  checkAndFixAssets: (versionId: string, directoryName?: string) => ipcRenderer.invoke('check-and-fix-assets', versionId, directoryName),

  // 监听资源修复进度（全局持久，切换界面不丢失）
  onCheckAssetsProgress: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('check-assets-progress', callback)
    return () => ipcRenderer.removeListener('check-assets-progress', callback)
  },

  // 删除版本
  deleteVersion: (versionId: string) => ipcRenderer.invoke('delete-version', versionId),

  // 下载 Java
  downloadJava: (javaVersion: string) => ipcRenderer.invoke('download-java', javaVersion),

  // 取消 Java 下载
  cancelJavaDownload: () => ipcRenderer.invoke('cancel-java-download'),

  // 删除 Java
  deleteJava: (javaVersion: string) => ipcRenderer.invoke('delete-java', javaVersion),

  // 监听 Java 下载进度
  onJavaDownloadProgress: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('java-download-progress', callback)
    return () => ipcRenderer.removeListener('java-download-progress', callback)
  },
  onJavaDownloadLog: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('java-download-log', callback)
    return () => ipcRenderer.removeListener('java-download-log', callback)
  },
  getJavaDownloadLogs: (javaVersion: string) => ipcRenderer.invoke('get-java-download-logs', javaVersion),
  clearJavaDownloadLogs: (javaVersion: string) => ipcRenderer.invoke('clear-java-download-logs', javaVersion),

  // 监听游戏日志
  onGameLog: (callback: (event: any, data: { level: string; message: string; timestamp: string }) => void) => {
    ipcRenderer.on('game-log', callback)
    return () => ipcRenderer.removeListener('game-log', callback)
  },

  // 监听游戏启动状态（自动补齐文件时的进度提示）
  onGameLaunchStatus: (callback: (event: any, data: { versionId: string; message: string }) => void) => {
    ipcRenderer.on('game-launch-status', callback)
    return () => ipcRenderer.removeListener('game-launch-status', callback)
  },

  // 监听游戏崩溃
  onGameCrash: (callback: (event: any, data: { versionId: string; exitCode: number; stderr: string; nativeHint?: string }) => void) => {
    ipcRenderer.on('game-crash', callback)
    return () => ipcRenderer.removeListener('game-crash', callback)
  },

  // 服务器相关
  checkServerJar: (versionId: string) => ipcRenderer.invoke('check-server-jar', versionId),
  downloadServerJar: (versionId: string) => ipcRenderer.invoke('download-server-jar', versionId),
  startServer: (versionId: string, maxMemory?: string, options?: { skipJavaCheck?: boolean; autoDownloadJava?: boolean }) => ipcRenderer.invoke('start-server', versionId, maxMemory, options),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  sendServerCommand: (command: string) => ipcRenderer.invoke('send-server-command', command),

  // 打开服务器目录
  openServerDir: (versionId: string) => ipcRenderer.invoke('open-server-dir', versionId),

  // FRP 内网穿透
  checkFrpDownloaded: () => ipcRenderer.invoke('check-frp-downloaded'),
  downloadFrp: () => ipcRenderer.invoke('download-frp'),
  startFrpTunnel: (config: any) => ipcRenderer.invoke('start-frp-tunnel', config),
  stopFrpTunnel: () => ipcRenderer.invoke('stop-frp-tunnel'),
  onFrpDownloadProgress: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('frp-download-progress', callback)
    return () => ipcRenderer.removeListener('frp-download-progress', callback)
  },

  // EasyTier 虚拟局域网
  checkEasyTierDownloaded: () => ipcRenderer.invoke('check-easytier-downloaded'),
  downloadEasyTier: () => ipcRenderer.invoke('download-easytier'),
  startEasyTier: (config: any) => ipcRenderer.invoke('start-easytier', config),
  stopEasyTier: () => ipcRenderer.invoke('stop-easytier'),
  onEasyTierDownloadProgress: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('easytier-download-progress', callback)
    return () => ipcRenderer.removeListener('easytier-download-progress', callback)
  },

  // P2P 联机
  startP2PForward: (isHost: boolean) => ipcRenderer.invoke('start-p2p-forward', isHost),
  sendP2PData: (data: ArrayBuffer) => ipcRenderer.invoke('send-p2p-data', data),
  stopP2PForward: () => ipcRenderer.invoke('stop-p2p-forward'),
  onP2PTCPData: (callback: (event: any, data: ArrayBuffer) => void) => {
    ipcRenderer.on('p2p-tcp-data', callback)
    return () => ipcRenderer.removeListener('p2p-tcp-data', callback)
  },

  // 监听服务器日志
  onServerLog: (callback: (event: any, data: { level: string; message: string; timestamp: string }) => void) => {
    ipcRenderer.on('server-log', callback)
    return () => ipcRenderer.removeListener('server-log', callback)
  },

  // 监听服务器下载进度
  onServerDownloadProgress: (callback: (event: any, data: { versionId: string; progress: number; speed: number }) => void) => {
    ipcRenderer.on('server-download-progress', callback)
    return () => ipcRenderer.removeListener('server-download-progress', callback)
  },

  // 监听服务器停止
  onServerStopped: (callback: (event: any, data: { exitCode: number }) => void) => {
    ipcRenderer.on('server-stopped', callback)
    return () => ipcRenderer.removeListener('server-stopped', callback)
  },

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  unmaximizeWindow: () => ipcRenderer.invoke('unmaximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  onWindowMaximized: (callback: (event: any, maximized: boolean) => void) => {
    ipcRenderer.on('window-maximized', callback)
    return () => ipcRenderer.removeListener('window-maximized', callback)
  },

  // 自动更新
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('update-status', callback)
    return () => ipcRenderer.removeListener('update-status', callback)
  },

  // 平台信息
  platform: process.platform,

  // 获取系统内存信息
  getSystemMemory: () => ipcRenderer.invoke('get-system-memory'),

  // 获取磁盘使用信息
  getDiskUsage: () => ipcRenderer.invoke('get-disk-usage'),

  // 打开外部链接
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // 内置浏览器
  openBrowser: (url: string) => ipcRenderer.invoke('open-browser', url),
  closeBrowser: () => ipcRenderer.invoke('close-browser'),
  browserAction: (action: string, url?: string) => ipcRenderer.invoke('browser-action', action, url),
  onBrowserState: (callback) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('browser-state', listener)
    return () => ipcRenderer.removeListener('browser-state', listener)
  },
  onBrowserDownload: (callback) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('browser-download', listener)
    return () => ipcRenderer.removeListener('browser-download', listener)
  },
  onBrowserDownloadDone: (callback) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('browser-download-done', listener)
    return () => ipcRenderer.removeListener('browser-download-done', listener)
  },
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('show-item-in-folder', filePath),
  installLocalFile: (filePath: string, target: string, targetGameVersion?: string) => ipcRenderer.invoke('install-local-file', filePath, target, targetGameVersion),
  getLauncherLog: () => ipcRenderer.invoke('get-launcher-log'),
  openLogDir: () => ipcRenderer.invoke('open-log-dir'),

  // 版本信息
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
})

// 暴露 electron 对象（兼容 types/electron.ts 声明）
contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.invoke('minimize-window'),
  maximize: () => ipcRenderer.invoke('maximize-window'),
  unmaximize: () => ipcRenderer.invoke('unmaximize-window'),
  close: () => ipcRenderer.invoke('close-window'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters: { name: string; extensions: string[] }[]) => ipcRenderer.invoke('select-file', filters)
})

// 为了兼容性，同时暴露到 window 对象
declare global {
  interface Window {
    electronAPI: {
      launchGame: (versionId: string, username?: string, directoryName?: string, settings?: { javaPath?: string; customJavaArgs?: string; skipJavaCheck?: boolean; autoDownloadJava?: boolean }) => Promise<{ success: boolean; message?: string; error?: string }>
      checkJava: (allowNewerJava?: boolean) => Promise<{ success: boolean; installed: boolean; path: string | null; version: number | null }>
      listJavas: () => Promise<{ success: boolean; list: { version: string; path: string }[]; error?: string }>
      openMinecraftDir: () => Promise<{ success: boolean; error?: string }>
      getGameDir: () => Promise<string>
      setGameDir: (dir: string) => Promise<{ success: boolean; error?: string }>
      setDownloadSource: (mode: string) => Promise<{ success: boolean; mode?: string }>
      setDownloadThreads: (n: number) => Promise<{ success: boolean; threads?: number }>
      getDownloadThreads: () => Promise<{ success: boolean; threads?: number }>
      setModrinthMirror: (enabled: boolean) => Promise<{ success: boolean; enabled?: boolean }>
      setProxy: (cfg: { enabled?: boolean; type?: 'http' | 'socks5'; host?: string; port?: number; username?: string; password?: string; forGame?: boolean }) => Promise<{ success: boolean; config?: any }>
      getProxy: () => Promise<{ success: boolean; config?: any }>
      testProxy: (cfg?: { enabled?: boolean; type?: 'http' | 'socks5'; host?: string; port?: number; username?: string; password?: string }) => Promise<{ success: boolean; ok?: boolean; ms?: number; kbs?: number; error?: string }>
      setLocale: (locale: string) => Promise<{ success: boolean; locale?: string }>
      openVersionDir: (versionId: string, directoryName?: string) => Promise<{ success: boolean; error?: string }>
      openSavesDir: (directoryName?: string) => Promise<{ success: boolean; error?: string }>
      downloadVersion: (versionId: string, versionUrl: string, directoryName?: string) => Promise<{ success: boolean; message?: string; error?: string; cancelled?: boolean; alreadyInstalled?: boolean }>
      onDownloadProgress: (callback: (event: any, data: any) => void) => () => void
      onJavaDownloadLog: (callback: (event: any, data: any) => void) => () => void
      getJavaDownloadLogs: (javaVersion: string) => Promise<string[]>
      clearJavaDownloadLogs: (javaVersion: string) => Promise<void>
      onDownloadComplete: (callback: (event: any, data: { versionId: string; success: boolean; error?: string }) => void) => () => void
      pauseDownload: (versionId: string) => Promise<{ success: boolean; error?: string }>
      resumeDownload: (versionId: string) => Promise<{ success: boolean; error?: string }>
      cancelDownload: (versionId: string) => Promise<{ success: boolean; error?: string }>
      getActiveDownloads: () => Promise<{ success: boolean; downloads: { versionId: string; paused: boolean }[] }>
      onDownloadPaused: (callback: (event: any, data: { versionId: string }) => void) => () => void
      onDownloadResumed: (callback: (event: any, data: { versionId: string }) => void) => () => void
      onDownloadCancelled: (callback: (event: any, data: { versionId: string }) => void) => () => void
      forceResetDownloads: () => Promise<{ success: boolean; message?: string; error?: string }>
      cancelModDownload: (modId: string) => Promise<{ success: boolean }>
      downloadMod: (modId: string, modName: string, downloadUrl: string, versionId: string, targetGameVersion?: string, subDir?: string, fileName?: string, expectedSize?: number, expectedSha1?: string) => Promise<{ success: boolean; message?: string; error?: string; skipped?: boolean; filePath?: string; fileName?: string; cancelled?: boolean }>
      manageInstalledFile: (action: 'delete' | 'disable' | 'enable', subDir?: string, targetGameVersion?: string, fileName?: string, modName?: string, versionId?: string) => Promise<{ success: boolean; skipped?: boolean; removed?: number; newPath?: string; newFileName?: string; message?: string; error?: string }>
      installModpack: (modId: string, modName: string, downloadUrl: string, versionId: string, expectedSize?: number, expectedSha1?: string) => Promise<{ success: boolean; message?: string; error?: string; cancelled?: boolean; versionId?: string; versionDir?: string; hasVersionJson?: boolean }>
      onModDownloadProgress: (callback: (event: any, data: any) => void) => () => void
      checkVersionInstalled: (versionId: string, directoryName?: string) => Promise<{ success: boolean; installed: boolean; reason?: string }>
      scanInstalledVersions: () => Promise<{ success: boolean; versions: { directoryName: string; versionId: string }[]; error?: string }>
      checkAndFixAssets: (versionId: string, directoryName?: string) => Promise<{ success: boolean; error?: string }>
      onCheckAssetsProgress: (callback: (event: any, data: any) => void) => () => void
      deleteVersion: (versionId: string) => Promise<{ success: boolean; message?: string; error?: string }>
      downloadJava: (javaVersion: string) => Promise<{ success: boolean; path?: string; error?: string }>
      cancelJavaDownload: () => Promise<{ success: boolean; error?: string }>
      deleteJava: (javaVersion: string) => Promise<{ success: boolean; error?: string }>
      onJavaDownloadProgress: (callback: (event: any, data: any) => void) => () => void
      onJavaDownloadLog: (callback: (event: any, data: any) => void) => () => void
      getJavaDownloadLogs: (javaVersion: string) => Promise<string[]>
      clearJavaDownloadLogs: (javaVersion: string) => Promise<void>
      onJavaDownloadLog: (callback: (event: any, data: any) => void) => () => void
      getJavaDownloadLogs: (javaVersion: string) => Promise<string[]>
      clearJavaDownloadLogs: (javaVersion: string) => Promise<void>
      onGameLog: (callback: (event: any, data: { level: string; message: string; timestamp: string }) => void) => () => void
      onGameCrash: (callback: (event: any, data: { versionId: string; exitCode: number; stderr: string; nativeHint?: string }) => void) => () => void
      onGameLaunchStatus: (callback: (event: any, data: { versionId: string; message: string }) => void) => () => void
      checkServerJar: (versionId: string) => Promise<{ exists: boolean; serverJar: string }>
      downloadServerJar: (versionId: string) => Promise<{ success: boolean; message?: string; error?: string }>
      startServer: (versionId: string, maxMemory?: string, options?: { skipJavaCheck?: boolean; autoDownloadJava?: boolean }) => Promise<{ success: boolean; error?: string }>
      stopServer: () => Promise<{ success: boolean; error?: string }>
      sendServerCommand: (command: string) => Promise<{ success: boolean; error?: string }>
      openServerDir: (versionId: string) => Promise<{ success: boolean; error?: string }>
      checkFrpDownloaded: () => Promise<{ exists: boolean; path: string }>
      downloadFrp: () => Promise<{ success: boolean; path?: string; error?: string }>
      startFrpTunnel: (config: any) => Promise<{ success: boolean; pid?: number; remotePort?: number; remoteAddress?: string; error?: string }>
      stopFrpTunnel: () => Promise<{ success: boolean; error?: string }>
      onFrpDownloadProgress: (callback: (event: any, data: any) => void) => () => void
      checkEasyTierDownloaded: () => Promise<{ exists: boolean; path: string }>
      downloadEasyTier: () => Promise<{ success: boolean; path?: string; error?: string }>
      startEasyTier: (config: any) => Promise<{ success: boolean; pid?: number; error?: string }>
      stopEasyTier: () => Promise<{ success: boolean; error?: string }>
      onEasyTierDownloadProgress: (callback: (event: any, data: any) => void) => () => void
      startP2PForward: (isHost: boolean) => Promise<{ success: boolean; error?: string; port?: number; mode?: string }>
      sendP2PData: (data: ArrayBuffer) => Promise<{ success: boolean; error?: string }>
      stopP2PForward: () => Promise<{ success: boolean; error?: string }>
      onP2PTCPData: (callback: (event: any, data: ArrayBuffer) => void) => () => void
      onServerLog: (callback: (event: any, data: { level: string; message: string; timestamp: string }) => void) => () => void
      onServerDownloadProgress: (callback: (event: any, data: { versionId: string; progress: number; speed: number }) => void) => () => void
      onServerStopped: (callback: (event: any, data: { exitCode: number }) => void) => () => void
      minimizeWindow: () => Promise<void>
      maximizeWindow: () => Promise<void>
      unmaximizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
      onWindowMaximized: (callback: (event: any, maximized: boolean) => void) => () => void
      checkForUpdates: () => Promise<{ checking: boolean }>
      downloadUpdate: () => Promise<{ downloading: boolean }>
      installUpdate: () => Promise<{ installing: boolean }>
      getAppVersion: () => Promise<{ version: string }>
      onUpdateStatus: (callback: (event: any, data: any) => void) => () => void
      platform: string
      getSystemMemory: () => Promise<{ total: number; used: number; free: number; totalBytes: number; usedBytes: number; freeBytes: number }>
      getDiskUsage: () => Promise<{ totalGB: number; usedGB: number; freeGB: number; usedPercent: number; gameSizeGB: number; gameSizeMB: number }>
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
      openBrowser: (url: string) => Promise<{ success: boolean; error?: string }>
      closeBrowser: () => Promise<void>
      browserAction: (action: string, url?: string) => Promise<void>
      onBrowserState: (callback: (data: any) => void) => () => void
      onBrowserDownload: (callback: (data: any) => void) => () => void
      onBrowserDownloadDone: (callback: (data: any) => void) => () => void
      showItemInFolder: (filePath: string) => Promise<void>
      installLocalFile: (filePath: string, target: string, targetGameVersion?: string) => Promise<{ success: boolean; skipped?: boolean; message?: string; filePath?: string; fileName?: string; error?: string }>
      getLauncherLog: () => Promise<{ success: boolean; text?: string; filePath?: string; dir?: string; error?: string }>
      openLogDir: () => Promise<{ success: boolean; error?: string }>
      versions: {
        node: string
        chrome: string
        electron: string
      }
    }
  }
}

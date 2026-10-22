export default {
  zh: {
    mc: {
      // 通用
      unknownError: '未知错误',
      downloadFailed: '下载失败: {err}',
      downloadFailedShort: '下载失败',
      downloadCancelled: '下载已取消',
      allSourcesFailed: '所有源均失败',
      allDownloadSourcesFailed: '所有下载源均失败: {err}',
      allTypeSourcesFailed: '所有{type}下载源均失败',
      installFailed: '安装失败',
      deleteFailed: '删除失败',
      pauseFailed: '暂停失败',
      resumeFailed: '继续失败',
      cancelFailed: '取消失败',
      resetFailed: '重置失败',
      sentenceSep: '。',
      appDataDirNotFound: '无法找到应用数据目录',

      // Java 下载/安装
      javaSizeApprox: '约 {mb} MB',
      javaStartInternal: '开始下载 Java {version}（内部自动下载）',
      javaUnsupported: '不支持的 Java 版本: {version}',
      javaSourceFailed: '源 {index} 下载失败: {err}',
      javaInstallComplete: 'Java {version} 安装完成',
      javaDownloadFailed: '下载 Java 失败: {err}',
      javaNotFoundAfterInstall: '无法找到安装的 Java ({name} 不存在)。若刚被 Windows 安全中心拦截，请检查「病毒和威胁防护 → 保护历史记录」',
      noDownloadInProgress: '没有正在进行的下载',
      javaNotInstalledOrCannotDelete: 'Java 未安装或无法删除',

      // 解压
      extractBlockedHint: '。可能是 Windows 安全中心正在扫描或拦截了该文件：请在「Windows 安全中心 → 病毒和威胁防护 → 保护历史记录」中允许该文件，然后重试',
      extractFailed: '解压失败: {detail}{hint}',
      extractFailedManual: '解压失败: {err}，请手动解压 {path}',

      // 内置浏览器
      browserLoadFailed: '加载失败 ({code})',

      // 本地文件安装
      fileNotExist: '文件不存在',
      installedToGameDir: '已安装到游戏 {target} 文件夹',

      // 基础游戏文件 / 加载器安装
      completingClientFiles: '正在补全 {loader} 客户端文件...',
      fetchingGameFiles: '正在获取 Minecraft {version} 游戏文件...',
      mcDownloadInfoNotFound: '未找到 Minecraft {version} 的下载信息，请检查网络连接',
      downloadingMcClient: '正在下载 Minecraft {version} 客户端...',
      downloadingComponent: '正在下载 {type}... {progress}%',
      componentVersionConfig: '版本配置',
      componentClient: '客户端',
      componentLibraries: '依赖库',
      componentAssets: '游戏资源',
      installingLoader: '正在安装 {loader} 加载器 {version}...',
      checkingModpackIntegrity: '正在检查整合包文件完整性...',
      downloadingModpackFiles: '正在下载整合包文件 ({done}/{total}){pct}{speed} [{threads}线程]: {name}',
      downloadGameFilesFailed: '下载游戏文件失败: {err}',
      completingLibrary: '正在补全库文件: {label}',
      fabricInfoFailed: '无法获取 Fabric 加载器 {version} 的信息（请检查网络）',
      downloadingFabricDep: '正在下载 Fabric 依赖: {name}',
      installerJavaMissing: '未找到可运行加载器安装程序的 Java（需 Java 21）',
      runningInstaller: '正在运行 {loader} 官方安装程序生成客户端文件（首次安装需下载约 50MB，请耐心等待）...',
      installerRunFailed: '{loader} 安装程序运行失败（exit {code}），详见日志',
      downloadingInstaller: '正在下载 {loader} {version} 安装程序...',
      cannotDownloadInstaller: '无法下载 {loader} 加载器安装程序: {err}',
      cannotReadVersionInfo: '无法从 {loader} 安装程序中读取版本信息',
      downloadingLoaderDep: '正在下载 {loader} 依赖: {name}',
      mergeVersionJsonFailed: '合并 {loader} 版本 json 失败: {err}',

      // 原生退出码提示
      nativeAccessViolation: '访问冲突 (0xC0000005)：通常是显卡驱动或 Java 虚拟机在原生代码中出错。可尝试更新显卡驱动、关闭/切换图形后端（Vulkan/OpenGL），或更换 Java 后重试',
      nativeStackOverflow: '栈溢出 (0xC00000FD)：可能是栈空间不足，或某个模组/库递归过深',
      nativeStackBufferOverrun: '栈缓冲区溢出 (0xC0000409)：原生库或驱动异常',
      nativeMissingDll: '缺少 DLL (0xC0000135)：Java 或系统运行库不完整，建议重新安装/更换 Java',
      nativeDllInitFailed: 'DLL 初始化失败 (0xC0000142)：通常是环境变量或依赖库问题',
      nativeHeapCorruption: '堆损坏 (0xC0000374)：内存被原生代码破坏，常见于驱动/模组冲突',

      // 启动游戏
      autoDownloadSuccess: '自动下载成功，使用: {path}',
      autoDownloadFailed: '自动下载失败: {err}',
      javaNotFoundAutoDownloaded: '未找到适合 Minecraft {version} 的 Java。需要的最低版本: Java {required}。自动下载也没成功，请到设置的 Java 页面手动下载或指定路径',
      javaNotFoundAutoDownloadOff: '未找到适合 Minecraft {version} 的 Java。需要的最低版本: Java {required}。自动下载已关闭，请到设置的 Java 页面手动下载或指定路径',
      javaIncompatible: 'Java 版本不兼容！当前 Java 版本为 {current}，但 Minecraft {version} 需要 Java {required} 或更高版本',
      versionNotInstalled: '版本 {version} 未安装，请先下载',
      missingGameFilesFilling: '缺少游戏文件，正在自动补齐...',
      gameFileNotFound: '找不到游戏文件: {path}',
      clientJarMissing: '找不到客户端文件: {path}，请重新下载该版本',
      gameError: '游戏启动错误: {err}',
      stdoutLabel: '标准输出: {text}',
      stderrLabel: '错误输出: {text}',
      hintJavaVersion: 'Java 版本不兼容，请安装更高版本的 Java',
      hintMissingLibs: '缺少游戏库文件，请重新下载该版本',
      hintOutOfMemory: '内存不足，请在设置中增加最大内存',
      hintLwjgl: ' natives 库加载失败，请检查 natives 文件',
      hintMainClass: '主类加载失败，请检查游戏文件完整性',
      hintSecurity: '安全异常，可能是Java权限问题',
      hintRuntime: '运行时异常，可能是游戏配置问题',
      launchFailed: '游戏启动失败，退出代码: {code}{hint}。错误: {err}',
      gameExitedWithHint: '游戏异常退出（退出代码 {code}）：{hint}',
      gameExited: '游戏异常退出（退出代码 {code}）',
      launchSuccess: 'Minecraft {version} 启动成功！',
      launchGameFailed: '启动游戏失败',

      // 服务端
      serverAlreadyExists: '服务端已存在',
      cannotGetServerUrl: '无法获取服务端下载地址',
      serverAlreadyRunning: '已有服务器正在运行',
      serverJarMissing: '服务端 JAR 不存在，请先下载',
      serverStarting: '正在启动 Minecraft {version} 服务器...',
      serverMaxMemory: '最大内存: {max}M (初始 {min}M)',
      serverExited: '服务器已退出 (退出码: {code})',
      serverError: '服务器错误: {err}',
      noServerRunning: '没有服务器正在运行',
      stoppingServer: '正在关闭服务器...',
      serverStopTimeout: '服务器超时未停止，强制终止',
      javaAutoDownloadNeeded: '自动下载：需要 Java {required}+，开始下载 Java {version}',
      javaNotFoundServerAutoOn: '未找到 Java {required}+，自动下载也没成功，请到设置的 Java 页面手动下载',
      javaNotFoundServerAutoOff: '未找到 Java {required}+，自动下载已关闭，请到设置的 Java 页面手动下载',

      // FRP 内网穿透
      frpTunnelAlreadyRunning: '已有 FRP 隧道正在运行',
      frpcNotDownloaded: 'frpc 未下载，请先下载',
      fetchServerAddress: '请填写服务器地址',
      frpProcessExitCode: '进程退出，代码: {code}',
      frpProcessStartFailed: 'FRP 进程启动失败',
      frpcNotFoundAfterExtract: '解压后未找到 {name}',
      noFrpTunnelRunning: '没有 FRP 隧道正在运行',

      // EasyTier 虚拟局域网
      easytierAlreadyRunning: '已有 EasyTier 正在运行',
      easytierNotDownloaded: 'EasyTier 未下载，请先下载',
      easytierProcessStartFailed: 'EasyTier 进程启动失败',
      easytierExeNotFound: '解压后未找到 easytier 可执行文件',
      noEasyTierRunning: '没有 EasyTier 正在运行',

      // P2P 转发
      cannotConnectLocalMc: '无法连接本地 MC 服务器 (25565): {err}',
      noTcpSocket: '没有连接的 TCP socket',

      // 目录 / 版本
      dirNotExist: '目录不存在',
      dirNotExistCannotCreate: '目录不存在且无法创建: {err}',
      dirCreateFailed: '目录创建失败: {path}',
      versionDirNotExist: '版本目录不存在',
      cannotParseModrinthIndex: '无法解析 modrinth.index.json',

      // 下载版本
      versionAlreadyDownloading: '版本 {version} 已在下载中',
      versionInstalled: '版本 {version} 已安装！',
      versionDownloadComplete: '版本 {version} 下载完成！',
      noActiveDownloadTask: '没有正在进行的下载任务',
      noPausedDownloadTask: '没有暂停的下载任务',
      allDownloadsReset: '所有下载状态已重置',

      // 模组 / 整合包
      modAlreadyDownloading: '模组 {name} 已在下载中',
      modDownloadComplete: '模组 {name} 下载完成！',
      modpackDownloadingIdle: '整合包 {name} 正在下载中（已运行 {mins} 分钟，{secs} 秒无进展）。请等待完成，或关闭启动器后重试。',
      baseGameDownloadFailed: '基础游戏文件下载失败（Minecraft {version}），请检查网络后重试',
      modpackLoaderInstallFailed: '整合包加载器安装失败，无法启动游戏。请删除此版本后重新安装',
      modpackConfigIncomplete: '整合包版本配置不完整（缺少 inheritsFrom/mainClass/libraries），请删除此版本后重新安装',
      modpackInstallComplete: '整合包 {name} 安装完成',
      modpackInstallFailed: '整合包安装失败',

      // 已安装文件管理
      installedFileNotFound: '未找到已安装文件: {name}',
      installedFileDeleted: '已删除 {count} 个文件',
      installedFileDisabled: '已禁用（重命名为 .disabled）',
      installedFileEnabled: '已启用（已还原文件名）',
      invalidAction: '无效操作',

      // 版本安装检查
      jsonFileMissing: 'JSON文件缺失',
      jarFileMissing: 'JAR文件缺失',
      jarTooSmall: 'JAR文件过小（小于50KB）',

      // 资源完整性
      versionJsonNotExist: '版本JSON文件不存在',
      noAssetIndex: '版本没有资源索引',
      assetIndexEmpty: '资源索引数据为空',
      assetsIntact: '资源文件完整，无需修复',
      assetsRepaired: '修复完成！成功修复 {count} 个资源文件',

      // 删除版本
      versionDeletedPartial: '版本已删除，但部分文件删除失败（可能被其他程序占用）',
      versionDeleted: '版本 {version} 及相关资源已删除'
    }
  },
  en: {
    mc: {
      // Common
      unknownError: 'Unknown error',
      downloadFailed: 'Download failed: {err}',
      downloadFailedShort: 'Download failed',
      downloadCancelled: 'Download cancelled',
      allSourcesFailed: 'all sources failed',
      allDownloadSourcesFailed: 'All download sources failed: {err}',
      allTypeSourcesFailed: 'All {type} download sources failed',
      installFailed: 'Installation failed',
      deleteFailed: 'Delete failed',
      pauseFailed: 'Pause failed',
      resumeFailed: 'Resume failed',
      cancelFailed: 'Cancel failed',
      resetFailed: 'Reset failed',
      sentenceSep: '. ',
      appDataDirNotFound: 'Could not find the application data directory',

      // Java download / install
      javaSizeApprox: '~{mb} MB',
      javaStartInternal: 'Starting Java {version} download (internal auto-download)',
      javaUnsupported: 'Unsupported Java version: {version}',
      javaSourceFailed: 'Source {index} download failed: {err}',
      javaInstallComplete: 'Java {version} installed',
      javaDownloadFailed: 'Java download failed: {err}',
      javaNotFoundAfterInstall: 'Could not find the installed Java ({name} does not exist). If it was just blocked by Windows Security, check "Virus & threat protection → Protection history"',
      noDownloadInProgress: 'No download in progress',
      javaNotInstalledOrCannotDelete: 'Java is not installed or cannot be deleted',

      // Extraction
      extractBlockedHint: '. Windows Security may be scanning or blocking the file: allow it in "Windows Security → Virus & threat protection → Protection history", then retry',
      extractFailed: 'Extraction failed: {detail}{hint}',
      extractFailedManual: 'Extraction failed: {err}; please extract {path} manually',

      // Built-in browser
      browserLoadFailed: 'Failed to load ({code})',

      // Local file install
      fileNotExist: 'File does not exist',
      installedToGameDir: 'Installed to the game {target} folder',

      // Base game files / loader install
      completingClientFiles: 'Completing {loader} client files...',
      fetchingGameFiles: 'Fetching Minecraft {version} game files...',
      mcDownloadInfoNotFound: 'Could not find download information for Minecraft {version}. Check your network connection',
      downloadingMcClient: 'Downloading Minecraft {version} client...',
      downloadingComponent: 'Downloading {type}... {progress}%',
      componentVersionConfig: 'version config',
      componentClient: 'client',
      componentLibraries: 'libraries',
      componentAssets: 'game assets',
      installingLoader: 'Installing {loader} loader {version}...',
      checkingModpackIntegrity: 'Checking modpack file integrity...',
      downloadingModpackFiles: 'Downloading modpack files ({done}/{total}){pct}{speed} [{threads} threads]: {name}',
      downloadGameFilesFailed: 'Failed to download game files: {err}',
      completingLibrary: 'Completing library file: {label}',
      fabricInfoFailed: 'Could not retrieve information for Fabric loader {version} (check your network)',
      downloadingFabricDep: 'Downloading Fabric dependency: {name}',
      installerJavaMissing: 'No Java found to run the loader installer (Java 21 required)',
      runningInstaller: 'Running the official {loader} installer to generate client files (the first install downloads about 50 MB, please wait)...',
      installerRunFailed: '{loader} installer run failed (exit {code}); see the log for details',
      downloadingInstaller: 'Downloading {loader} {version} installer...',
      cannotDownloadInstaller: 'Could not download {loader} loader installer: {err}',
      cannotReadVersionInfo: 'Could not read version information from the {loader} installer',
      downloadingLoaderDep: 'Downloading {loader} dependency: {name}',
      mergeVersionJsonFailed: 'Failed to merge {loader} version json: {err}',

      // Native exit code hints
      nativeAccessViolation: 'Access violation (0xC0000005): usually the graphics driver or the Java VM crashed in native code. Try updating your graphics driver, disabling/switching the graphics backend (Vulkan/OpenGL), or using a different Java',
      nativeStackOverflow: 'Stack overflow (0xC00000FD): possibly insufficient stack space, or a mod/library recursing too deeply',
      nativeStackBufferOverrun: 'Stack buffer overrun (0xC0000409): a native library or driver error',
      nativeMissingDll: 'Missing DLL (0xC0000135): Java or the system runtime is incomplete; reinstall or switch Java',
      nativeDllInitFailed: 'DLL initialization failed (0xC0000142): usually an environment variable or dependency issue',
      nativeHeapCorruption: 'Heap corruption (0xC0000374): memory was corrupted by native code, often caused by driver/mod conflicts',

      // Launch game
      autoDownloadSuccess: 'Auto-download succeeded, using: {path}',
      autoDownloadFailed: 'Auto-download failed: {err}',
      javaNotFoundAutoDownloaded: 'No suitable Java found for Minecraft {version}. Minimum required: Java {required}. Auto-download also failed; download Java manually or specify a path in Settings → Java',
      javaNotFoundAutoDownloadOff: 'No suitable Java found for Minecraft {version}. Minimum required: Java {required}. Auto-download is off; download Java manually or specify a path in Settings → Java',
      javaIncompatible: 'Incompatible Java version! Current Java is {current}, but Minecraft {version} requires Java {required} or newer',
      versionNotInstalled: 'Version {version} is not installed; please download it first',
      missingGameFilesFilling: 'Game files are missing; filling them in automatically...',
      gameFileNotFound: 'Game file not found: {path}',
      clientJarMissing: 'Client file not found: {path}; please re-download this version',
      gameError: 'Game launch error: {err}',
      stdoutLabel: 'Standard output: {text}',
      stderrLabel: 'Error output: {text}',
      hintJavaVersion: 'Incompatible Java version; please install a newer Java',
      hintMissingLibs: 'Missing game library files; please re-download this version',
      hintOutOfMemory: 'Out of memory; increase the maximum memory in Settings',
      hintLwjgl: 'Failed to load the natives libraries; please check the natives files',
      hintMainClass: 'Failed to load the main class; please verify the integrity of the game files',
      hintSecurity: 'Security exception; possibly a Java permission issue',
      hintRuntime: 'Runtime exception; possibly a game configuration issue',
      launchFailed: 'Game launch failed, exit code: {code}{hint}. Error: {err}',
      gameExitedWithHint: 'Game exited abnormally (exit code {code}): {hint}',
      gameExited: 'Game exited abnormally (exit code {code})',
      launchSuccess: 'Minecraft {version} launched successfully!',
      launchGameFailed: 'Failed to launch the game',

      // Server
      serverAlreadyExists: 'Server already exists',
      cannotGetServerUrl: 'Could not get the server download URL',
      serverAlreadyRunning: 'A server is already running',
      serverJarMissing: 'Server JAR not found; please download it first',
      serverStarting: 'Starting Minecraft {version} server...',
      serverMaxMemory: 'Max memory: {max}M (initial {min}M)',
      serverExited: 'Server stopped (exit code: {code})',
      serverError: 'Server error: {err}',
      noServerRunning: 'No server is running',
      stoppingServer: 'Stopping the server...',
      serverStopTimeout: 'The server did not stop in time; forcing termination',
      javaAutoDownloadNeeded: 'Auto-download: Java {required}+ required, starting Java {version} download',
      javaNotFoundServerAutoOn: 'No Java {required}+ found and auto-download failed; download Java manually in Settings → Java',
      javaNotFoundServerAutoOff: 'No Java {required}+ found and auto-download is off; download Java manually in Settings → Java',

      // FRP tunneling
      frpTunnelAlreadyRunning: 'An FRP tunnel is already running',
      frpcNotDownloaded: 'frpc is not downloaded; please download it first',
      fetchServerAddress: 'Please enter the server address',
      frpProcessExitCode: 'Process exited with code: {code}',
      frpProcessStartFailed: 'Failed to start the FRP process',
      frpcNotFoundAfterExtract: '{name} not found after extraction',
      noFrpTunnelRunning: 'No FRP tunnel is running',

      // EasyTier LAN
      easytierAlreadyRunning: 'EasyTier is already running',
      easytierNotDownloaded: 'EasyTier is not downloaded; please download it first',
      easytierProcessStartFailed: 'Failed to start the EasyTier process',
      easytierExeNotFound: 'easytier executable not found after extraction',
      noEasyTierRunning: 'No EasyTier is running',

      // P2P forwarding
      cannotConnectLocalMc: 'Could not connect to the local MC server (25565): {err}',
      noTcpSocket: 'No connected TCP socket',

      // Directories / versions
      dirNotExist: 'Directory does not exist',
      dirNotExistCannotCreate: 'Directory does not exist and could not be created: {err}',
      dirCreateFailed: 'Failed to create directory: {path}',
      versionDirNotExist: 'Version directory does not exist',
      cannotParseModrinthIndex: 'Could not parse modrinth.index.json',

      // Download version
      versionAlreadyDownloading: 'Version {version} is already downloading',
      versionInstalled: 'Version {version} already installed!',
      versionDownloadComplete: 'Version {version} download complete!',
      noActiveDownloadTask: 'No active download task',
      noPausedDownloadTask: 'No paused download task',
      allDownloadsReset: 'All download states have been reset',

      // Mods / modpacks
      modAlreadyDownloading: 'Mod {name} is already downloading',
      modDownloadComplete: 'Mod {name} download complete!',
      modpackDownloadingIdle: 'Modpack {name} is downloading (running for {mins} min, no progress for {secs} s). Please wait for it to finish, or close the launcher and retry.',
      baseGameDownloadFailed: 'Failed to download base game files (Minecraft {version}); check your network and retry',
      modpackLoaderInstallFailed: 'Modpack loader installation failed; the game cannot launch. Delete this version and reinstall',
      modpackConfigIncomplete: 'Modpack version config is incomplete (missing inheritsFrom/mainClass/libraries). Delete this version and reinstall',
      modpackInstallComplete: 'Modpack {name} installed',
      modpackInstallFailed: 'Modpack installation failed',

      // Installed-file management
      installedFileNotFound: 'Installed file not found: {name}',
      installedFileDeleted: '{count} file(s) deleted',
      installedFileDisabled: 'Disabled (renamed to .disabled)',
      installedFileEnabled: 'Enabled (filename restored)',
      invalidAction: 'Invalid action',

      // Version install check
      jsonFileMissing: 'JSON file missing',
      jarFileMissing: 'JAR file missing',
      jarTooSmall: 'JAR file too small (less than 50 KB)',

      // Asset integrity
      versionJsonNotExist: 'Version JSON file does not exist',
      noAssetIndex: 'Version has no asset index',
      assetIndexEmpty: 'Asset index data is empty',
      assetsIntact: 'Asset files are intact; no repair needed',
      assetsRepaired: 'Repair complete! Successfully repaired {count} asset files',

      // Delete version
      versionDeletedPartial: 'Version deleted, but some files could not be deleted (they may be in use by another program)',
      versionDeleted: 'Version {version} and its assets have been deleted'
    }
  }
}

export default {
  zh: {
    home: {

      news31Title: '启动日志：中文分步输出',
      news31Desc: '启动游戏时，日志面板与日志文件现在会逐步打印中文启动流程：预检测是否通过、当前账号、需要的 Java 版本、选中的 Java 及路径、系统内存与分配的内存、垃圾回收器、文件编码、加载器（版本 JSON）注入的参数条数、类路径库数量、工作目录、最终启动命令，以及游戏进程的启动 PID 与退出结果。出问题时一眼就能看出卡在哪一步。',

      news30Title: '代理扩展：游戏进程与自动更新',
      news30Desc: '把上版的下载代理再补两块：①「游戏也走代理」开关（默认关闭）——开启后为 Minecraft 进程注入 JVM 代理参数（http/https 或 socks），让 Mojang 账号 / 皮肤 / Realms 等 API 调用以及使用标准网络库的模组也走代理；游戏与服务器之间的连接不受影响（不会被强行塞进代理）。②自动更新接入代理——electron-updater 用的是独立会话，现已在启动时一并配置，且代理设置会落盘，下次启动在界面同步前就已生效。③代理需要账号密码时，Chromium 的登录质询会自动补上。国内镜像与本机地址在下载和游戏内均自动直连。',

      news29Title: '下载代理',
      news29Desc: '新增 HTTP / SOCKS5 下载代理：在「设置 → 高级」填入你本机已运行的代理地址，启动器的资源下载即可走代理（Clash / V2Ray 等）。启动器不内置任何节点、不提供代理或 VPN 服务；国内镜像（BMCLAPI / MCIM 等）自动直连。',

      news28Title: '多链路分块下载：单文件并发铺到镜像+官方',
      news28Desc: '继续冲下载速度。实测这类源按单条连接限速（每连接约 16~20 KB/s），总吞吐随连接数近似线性；但 MCIM 镜像连接数一超约 64 就直接封 IP（实测 128 连接后 128/128 全部失败）。因此这版做三件事：① 线程数直接等于单个大文件的并发分块数（设置里拉多少，大文件就切多少块，每块至少 1MB、上限 128）；② 分块轮流铺到 MCIM 镜像 + 官方 CDN 两条链路上，单源并发天然减半，既能拉高总并发又不会把源打爆，某条链路失败时该分块会自动换到另一条重试；③ 整合包 mods 阶段的并发文件数也跟随线程设置（8~64）。默认 48 线程时，113MB 的整合包从 16 块提升到 48 块。实测同一文件：16 块约 347 KB/s，128 块并发最高可到 2~3 MB/s。',

      news27Title: '修复线程设置不生效：分块数随线程数放大',
      news27Desc: '定位到下载慢的真正原因：分块数由文件体积写死（64–127MB 恒为 16 块），设置里的线程数只是个上限、从未被用上，所以拉到 128 也没有任何变化。实测 Modrinth 官方 CDN 与 MCIM 镜像都按连接线性限速（1→64 连接：27→1461 KB/s），并发数才是唯一有效的提速杆。现在分块数 = 体积基准 × (线程数/48)，并保证每块至少 512KB、绝对上限 64。默认 48 线程的行为与之前完全一致；128 线程时同一文件的分块数由 16 提升到 43。日志会打印',

      news26Title: '下载提速：并发线程数可调 + Modrinth 国内镜像',
      news26Desc: '新增两个下载设置：①「下载并发线程数」滑块（8–128，默认 48），可同时决定全局连接预算与单文件最大分块数，网络差可调低、想榨干带宽可调高；②「Modrinth 国内镜像」开关（默认开启），搜索与文件下载改走 MCIM 国内镜像（mod.mcimirror.top），镜像+官方双地址回退，失败自动切回官方源。三处 Modrinth API 调用与整合包 zip、整合包内文件、单个模组下载均已接入；镜像关闭时行为与此前完全一致。',

      news25Title: '下载进度显示并发线程数',
      news25Desc: '整合包 zip 与单个模组的下载进度也携带线程数：下载面板/通知会显示当前实际使用的并发线程数，方便确认多线程是否生效（此前只有整合包内文件阶段显示）。',

      news24Title: '下载提速：提高并发线程数',
      news24Desc: '多线程下载更激进：大文件分块数上调（≥128MB 用 16 线程、≥64MB 12、≥32MB 10、≥8MB 8）；整合包内 ≥16MB 的文件也启用分块并发（原 32MB）；全局连接预算 32→48、最大并发下载 24→32、分块阈值 4MB→2MB。整合包下载日志新增 [N线程] 显示，方便确认并发是否生效。暂停/取消/断点续传与全部错误提示保持不变。',

      news23Title: '自检修复：窗口控制与焦点样式',
      news23Desc: '自检修复：窗口控制（最小化/最大化/关闭）与最大化状态监听改为安全调用，避免在无 Electron 预加载环境（预览/测试）启动时报错；焦点样式统一——鼠标或程序化聚焦不再出现浏览器默认焦点圈，键盘 Tab 仍显示 2px 强调色描边，玻璃拟态下键盘焦点优先于装饰描边。',

      news22Title: '玻璃拟态底色不再纯黑',
      news22Desc: '玻璃模式的背景底部由近纯黑改为深蓝/藏青的同色系渐变（不再是纯黑，也不是多色彩虹），并保留两团极淡柔光；深色与浅色模式各自适配。面板与描边阴影维持不变。',

      news21Title: '重做玻璃拟态：更通透干净',
      news21Desc: '背景改为安静的近纯色 + 极淡柔光（不再用彩虹渐变，避免模糊后糊成一团）；面板改为比背景更亮的冷调半透明，并加上细描边（outline，不会被悬停阴影覆盖）、顶部内高光与更重的投影，层次更分明，白字对比更稳；模糊降到 18px 且不再拉高饱和度。图片/纯色背景仍保留，仅渐变在玻璃模式下换成安静底色。',

      news20Title: '新增玻璃拟态选项',
      news20Desc: '设置-外观新增「玻璃拟态」开关（默认关闭）：开启后界面表面改为半透明磨砂玻璃，透出自定义背景并对主要面板/卡片/弹窗做 16px 高斯模糊，深色与浅色模式各自适配；仅对叶子表面磨砂，避免破坏固定定位弹窗；关闭时不产生任何性能开销。',

      news19Title: '键盘焦点样式修复',
      news19Desc: '修正全局键盘焦点样式：移除会强制改变元素圆角（如输入框聚焦瞬间变形）的圆角覆盖，仅保留强调色轮廓；不影响鼠标操作体验。',

      news18Title: '交互动效与反馈优化',
      news18Desc: '页面切换加入轻微上移淡入（仅 transform/opacity，GPU 合成不卡顿）；全局按钮加入按下反馈（filter 压暗，不改动定位）；模组空状态加入淡入并弱化图标。全站已支持系统「减少动态效果」。',

      news17Title: '设置页视觉统一',
      news17Desc: '设置页侧栏激活项改为强调色胶囊并加入指示条，与主导航一致；分区卡片加入描边提升层次；路径/下拉输入框补充聚焦高亮环；开关旋钮加入阴影与键盘聚焦样式。',

      news16Title: '模组管理修复与视觉优化',
      news16Desc: '修复模组页 --primary/--primary-hover/--primary-dark 令牌缺失（此前所有主按钮、激活标签、选中态在模组页都是透明/失效的）；补全 --border-radius-md/lg、--bg、--border-light 等历史别名令牌，修复账号/联机/设置/下载/工具箱等页面圆角与输入框背景失效；模组卡片悬停加入抬升与阴影，分类激活态改为强调色胶囊，弹窗改为更高层级背景+阴影+入场动画。',

      news15Title: '首页视觉打磨与全局文字层级修复',
      news15Desc: '修复 --text-tertiary 变量缺失（此前各页面的次要/提示文字全部回退成主文字色，一次性修复全应用）；修复首页资讯标签与快捷操作图标因 CSS 变量无法拼接导致的背景失效；首页卡片标题加入强调色标记条，卡片/版本项悬停阴影统一改用主题令牌。',

      news14Title: '界面基础视觉升级',
      news14Desc: '统一设计令牌（新增层级/圆角/间距/字号/缓动/语义色）；侧边栏未激活项改为次要文字色并加入激活指示条；窗口标题栏加高并优化窗口按钮，最大化时去圆角；优化滚动条、文本选中、键盘焦点态；新增「减少动态效果」支持降低开销。',

      news13Title: '下载失败保护',
      news13Desc: '模组下载临时文件改为 .tmp 后缀：即使异常中断留下残文件，游戏也不会把它当作模组加载；清理逻辑不变。',

      news12Title: '模组安装流程修复',
      news12Desc: '修复模组/光影/资源包安装相关问题：取消下载真正中断云端请求而非只改状态；同版本重复安装自动跳过免重复下载；下载失败不再破坏已装好的同名文件；更新到新版本后自动清理旧文件避免游戏重复加载；本地整合包目录归类修正；从文件安装与拖拽安装文件真正生效并自动去重',

      news11Title: '修复直接安装装错版本',
      news11Desc: '修复直接点「安装」时未校验兼容性、把不支持当前游戏版本的模组/光影包也照样下载安装的问题；现在只有当项目确实发布了支持该游戏版本的文件时才可安装，否则会明确提示没有兼容版本。下载队列也不再在无匹配时回退装最新版。',

      news10Title: '安装版本选择崩溃修复',
      news10Desc: '修复在 Mod 下载页挑选版本时打开选择窗口崩溃的问题（版本号列表加载失败）。',

      news9Title: '光影/资源包版本筛选修复',
      news9Desc: '修复按游戏版本筛选时，不支持该版本的光影/资源包仍然出现在列表里的问题；现在按实际发布的文件精确过滤。',
      news8Title: '下载搭载优化',
      news8Desc: '模组/资源包/光影包下载安装升级：修复资源包与光影包扩展名错误导致不被游戏识别，按 MC 版本+加载器智能选版，下载带 SHA-1 校验并预解析重定向提速；卸载真正删除文件，禁用/启用通过 .disabled 真实生效',
      welcomeBack: '欢迎回来',
      statVersions: '版本',
      statMods: '模组',
      statAccounts: '账号',
      statGame: '游戏',
      launchVersion: '启动 {v}',
      goInstallVersion: '去安装版本',
      dragHint: '🔓 拖拽卡片调整位置，完成后点击锁定',
      editHint: '点击右侧按钮可自定义主页布局',
      reset: '↺ 重置',
      lockLayout: '🔒 锁定布局',
      editLayout: '✎ 编辑布局',
      quickLaunch: '⚡ 快速启动',
      viewAll: '查看全部 →',
      noVersions: '还没有安装版本',
      goInstall: '去安装',
      systemStatus: '📊 系统状态',
      memory: '💾 内存',
      disk: '🗄️ 磁盘',
      javaInstalled: '已安装',
      javaNotDetected: '未检测到',
      gameDir: '🎮 游戏目录',
      quickAccess: '🧭 快捷入口',
      newsTitle: '📰 动态',
      multiplayer: '多人联机',
      networkDesc: 'P2P 房间 · FRP · EasyTier · 陶瓦',
      goMultiplayer: '去联机',
      qaVersion: '版本管理',
      qaMods: '模组管理',
      qaNetwork: '联机',
      qaToolbox: '工具箱',
      qaSettings: '设置',
      qaAccounts: '账号',
      news1Title: '下载校验',
      news1Desc: '资源/库文件增加 SHA-1 校验，坏文件自动换源重下',
      news2Title: 'Java 自动选版',
      news2Desc: '根据版本自动选用官方推荐 Java，缺失时自动下载',
      news3Title: '下载源设置',
      news3Desc: '支持官方源 / BMCLAPI 镜像 / 自动测速',
      news4Title: '资源下载修复',
      news4Desc: '修复资源文件 404 问题，下载更稳定',
      news5Title: '性能优化',
      news5Desc: '首屏加载更快，操作更流畅',
      news6Title: '主页升级',
      news6Desc: '全新 Bento 布局，支持自定义拖拽',
      news7Title: 'P2P 联机',
      news7Desc: '零配置房间联机，和朋友直接玩',
      typeRelease: '正式版',
      typeSnapshot: '快照',
      typeAprilFools: '愚人节'
    },
    appUi: {
      eggDevFound: '你发现了开发者彩蛋！',
      eggCodeForever: '代码永无止境！',
      eggNotLooking: '你不是正在找这个对吧？',
      eggHiddenFeature: '恭喜你发现了隐藏功能！',
      eggDiamond: '钻石！',
      eggHungryBear: '饥饿的熊...',
      eggLightning: '闪电般的速度！',
      egg100k: '你是第10万个发现这个彩蛋的人！',
      eggMysteryGift: '神秘礼物：开挂模式已解锁！',
      eggProphecy: '预言：下一个版本会更好！',
      eggNetherPortal: '还记得小时候尝试激活天堂传送门吗？',
      eggTenK: '还我十万美刀！',
      eggPotatoKingdom: '我的马铃薯王国！',
      konamiActivated: '🎮 科乐米代码已激活！启动器变得更快了！⚡',
      turboMode: '⚡ 涡轮模式',
      launcher: '启动器',
      assetChecking: '正在检查资源完整性...'
    },
    sponsor: {
      launchTitle: '{n} 次启动！',
      body1Prefix: '启动器已经为你启动了',
      body1Suffix: '次游戏啦！',
      body2: '如果启动器还算好用的话，能不能考虑赞助一下呢……',
      body3: '如果没有大家的支持，启动器很难在免费、无任何广告的情况下维持更新（磕头）……！',
      supportBtn: '支持一下！',
      refuseBtn: '但是我拒绝'
    },
    legal: {
      titleUserAgreement: '用户协议',
      titlePrivacyPolicy: '隐私政策',
      titleSpecialNotice: '特别说明',
      loadFailed: '文件加载失败，请稍后重试。',
      loading: '加载中...',
      closeTitle: '关闭',
      gotIt: '我知道了'
    },
    dl: {
      statusQueued: '等待中',
      statusDownloading: '下载中',
      statusPaused: '已暂停',
      statusCompleted: '已完成',
      statusFailed: '失败',
      statusCancelled: '已取消',
      title: '下载明细',
      empty: '暂无下载任务',
      threads: '{n}线程',
      resume: '继续',
      pause: '暂停',
      cancelDownload: '取消下载',
      completedHistory: '已完成 / 历史记录',
      clear: '清空',
      size: '大小: {s}',
      remove: '移除'
    }
  },
  en: {
    home: {

      news31Title: 'Launch log: step-by-step Chinese output',
      news31Desc: 'When launching the game, the log panel and log file now print the launch pipeline step by step in Chinese: pre-checks, current account, required Java version, the selected Java and its path, system memory and allocated heap, garbage collector, file encoding, how many args the loader (version JSON) injected, classpath library count, working directory, the final launch command, plus the game process PID and exit result. When something goes wrong you can see exactly which step failed.',

      news30Title: 'Proxy: game process & auto-update',
      news30Desc: 'Two follow-ups to the download proxy: (1) a "Proxy for the game too" switch (off by default) that injects JVM proxy properties into the Minecraft process (http/https or socks), so Mojang account / skin / Realms API calls and mods using standard network libraries also go through the proxy; the game-to-server connection is untouched. (2) Auto-update now uses the proxy: electron-updater runs in its own session, which is now configured at startup, and the proxy settings are persisted so they apply before the UI syncs. (3) Chromium login challenges now supply proxy credentials automatically. China-based mirrors and local addresses still connect directly, both for downloads and in-game.',

      news29Title: 'Download Proxy',
      news29Desc: 'Added an HTTP / SOCKS5 download proxy: enter your locally running proxy in Settings -> Advanced to route the launcher downloads through it (Clash / V2Ray, etc.). No endpoints are bundled and no proxy/VPN service is provided; China-based mirrors (BMCLAPI / MCIM, etc.) always connect directly.',

      news28Title: '多链路分块下载：单文件并发铺到镜像+官方',
      news28Desc: 'More download speed. Measured: these sources throttle per TCP connection (about 16-20 KB/s each) and total throughput scales roughly linearly with connection count, but the MCIM mirror bans the IP once you exceed about 64 connections (at 128 connections, 128/128 failed). So this build: (1) the thread setting now directly equals the chunk count for a large file (at least 1MB per chunk, cap 128); (2) chunks are round-robined across the MCIM mirror and the official CDN, halving per-source concurrency, and a failed chunk automatically retries on the other link; (3) the mods phase file concurrency now follows the thread setting too (8-64). At the default 48 threads a 113MB modpack goes from 16 to 48 chunks. Measured on one file: about 347 KB/s at 16 chunks vs up to 2-3 MB/s at 128 concurrent chunks.',

      news27Title: '修复线程设置不生效：分块数随线程数放大',
      news27Desc: 'Fixed the real cause of slow downloads: the chunk count was hard-coded by file size (16 chunks for 64-127MB) and the thread setting was only a cap that was never applied, so raising it to 128 changed nothing. Measured: both Modrinth\'s official CDN and the MCIM mirror throttle per connection and scale linearly (1 -> 64 connections: 27 -> 1461 KB/s), so concurrency is the only effective lever. Chunk count is now size-baseline x (threads/48), with at least 512KB per chunk and a hard cap of 64. Default 48-thread behavior is unchanged; at 128 threads the same file now uses 43 chunks instead of 16. The log prints \'XXMB file -> N chunks\' so you can confirm.',

      news26Title: '下载提速：并发线程数可调 + Modrinth 国内镜像',
      news26Desc: 'Added two download settings: (1) a Download Threads slider (8–128, default 48) that scales both the global connection budget and the per-file chunk cap - lower it on a weak network, raise it to saturate bandwidth; (2) a Modrinth Mirror toggle (on by default) that routes search and file downloads through the MCIM China mirror (mod.mcimirror.top) with mirror+official dual-candidate fallback, automatically falling back to the official source on failure. Wired into all three Modrinth API calls, the modpack zip, modpack files and single-mod downloads; with the mirror off, behavior is identical to before.',

      news25Title: '下载进度显示并发线程数',
      news25Desc: 'The modpack zip and single-mod download progress now also carry the thread count, so the download panel/notifications show the actual number of parallel threads in use (previously only the modpack\'s per-file phase reported it).',

      news24Title: '下载提速：提高并发线程数',
      news24Desc: 'More aggressive parallel downloads: higher chunk counts for large files (≥128MB→16, ≥64MB→12, ≥32MB→10, ≥8MB→8 threads); modpack files ≥16MB now use chunked download (was 32MB); global connection budget 32→48; max concurrent downloads 24→32; parallel threshold 4MB→2MB. The modpack log now shows [Nthreads]. Pause/cancel/resume and all error messages are unchanged.',

      news23Title: '自检修复：窗口控制与焦点样式',
      news23Desc: 'Self-check fixes: window controls (minimize/maximize/close) and the maximize-state listener now use safe optional calls, so startup no longer throws without the Electron preload (preview/tests). Focus styling unified: mouse/programmatic focus no longer shows the browser default ring, while keyboard Tab keeps the 2px accent outline; in glass mode keyboard focus takes priority over the decorative ring.',

      news22Title: '玻璃拟态底色不再纯黑',
      news22Desc: 'In glass mode the backdrop is no longer near-black: it is now a calm deep blue/navy single-hue gradient (not pure black and not a rainbow), with the two faint glows kept. Dark and light themes each adapted; panels, outlines and shadows unchanged.',

      news21Title: '重做玻璃拟态：更通透干净',
      news21Desc: 'Reworked glassmorphism: backdrop is now a calm near-solid with two very faint glows (no rainbow gradient, which turned muddy once blurred); panels are a lighter cool translucent tint with a hairline outline edge (outline is not clobbered by hover shadows), a top inner highlight and stronger drop shadows for real layering; white-text contrast is stable; blur lowered to 18px with no saturation boost. Image/solid backgrounds are kept; only gradients are swapped for the calm base in glass mode.',

      news20Title: '新增玻璃拟态选项',
      news20Desc: 'New \'Glassmorphism\' toggle in Settings > Appearance (off by default): surfaces become translucent frosted glass that reveals the custom background, with a 16px backdrop blur on key panels/cards/modals, tuned for both dark and light themes; blur is limited to leaf surfaces so fixed-position dialogs stay correct, and there is zero cost while disabled.',

      news19Title: '键盘焦点样式修复',
      news19Desc: 'Fixed global keyboard-focus styling: removed the border-radius override that could temporarily deform focused elements (e.g. inputs), keeping only the accent outline; mouse interaction unaffected.',

      news18Title: '交互动效与反馈优化',
      news18Desc: 'Page switches now use a subtle slide-up fade (transform/opacity only, GPU-composited); global button press feedback (filter dim, keeps positioning intact); mod empty state fades in with a softened icon. The whole app honors the OS reduced-motion setting.',

      news17Title: '设置页视觉统一',
      news17Desc: 'Settings sidebar active item now uses an accent pill with indicator, matching the main nav; section cards got a subtle border for depth; path/select inputs got focus rings; toggle switch knob got a shadow and keyboard focus style.',

      news16Title: '模组管理修复与视觉优化',
      news16Desc: 'Fixed missing --primary/--primary-hover/--primary-dark tokens (all primary buttons and active/selected states were transparent in the mod manager); restored aliases --border-radius-md/lg, --bg, --border-light (fixing broken radii and input backgrounds in accounts/network/settings/downloads/toolbox); mod cards now lift on hover, category active state uses an accent pill, modals got elevation, shadow and entrance animation.',

      news15Title: '首页视觉打磨与全局文字层级修复',
      news15Desc: 'Fixed missing --text-tertiary variable (secondary/hint text was falling back to primary color app-wide); fixed broken backgrounds on home news tags and quick-action icons caused by invalid CSS var concatenation; added accent section markers to home card titles and tokenized hover shadows.',

      news14Title: '界面基础视觉升级',
      news14Desc: 'Unified design tokens; sidebar inactive items now secondary-colored with an active indicator bar; taller title bar with refined window buttons and no rounding when maximized; improved scrollbar, text selection and keyboard focus; added reduced-motion support.',

      news13Title: '下载失败保护',
      news13Desc: 'Mod download temp files now use a .tmp suffix: even if a crash leaves a leftover file, the game will not load it as a mod.',

      news12Title: '模组安装流程修复',
      news12Desc: 'Fixed mod/shader/resource-pack install issues: cancel actually aborts the download; re-installing the same version skips the re-download; failed downloads no longer destroy the existing file; old files are removed after updating to a new version; local modpack folder classification fixed; install-from-file and drag-drop now really install files and de-duplicate',

      news11Title: 'Fix wrong-version auto-install',
      news11Desc: 'Fixed the direct Install button skipping compatibility checks and downloading shader packs/mods that have no file for the current game version. Installing now requires an actual compatible file; otherwise a clear \'no compatible version\' notice is shown. The download queue no longer falls back to the newest file when no matching version exists.',

      news10Title: 'Fix version-picker crash',
      news10Desc: 'Fixed a crash when opening the version picker on the Mod download page (the version list failed to load).',

      news9Title: 'Version filter fix',
      news9Desc: 'Fixed an issue where shader/resource packs that do not support the selected game version still appeared in the list; results are now filtered by the actual released files.',

      news8Title: 'Download & Install Upgrade',
      news8Desc: 'Upgraded mod/resource-pack/shader-pack download & install: fixed extension so packs are recognized in-game, smart version+loader file selection, SHA-1 verified downloads with redirect pre-resolve; uninstall deletes files, enable/disable works via .disabled renaming',
      welcomeBack: 'Welcome back',
      statVersions: 'Versions',
      statMods: 'Mods',
      statAccounts: 'Accounts',
      statGame: 'Game',
      launchVersion: 'Launch {v}',
      goInstallVersion: 'Install a version',
      dragHint: '🔓 Drag cards to rearrange, then click lock when done',
      editHint: 'Click the button on the right to customize your home layout',
      reset: '↺ Reset',
      lockLayout: '🔒 Lock layout',
      editLayout: '✎ Edit layout',
      quickLaunch: '⚡ Quick Launch',
      viewAll: 'View all →',
      noVersions: 'No versions installed yet',
      goInstall: 'Install',
      systemStatus: '📊 System Status',
      memory: '💾 Memory',
      disk: '🗄️ Disk',
      javaInstalled: 'Installed',
      javaNotDetected: 'Not detected',
      gameDir: '🎮 Game Directory',
      quickAccess: '🧭 Quick Access',
      newsTitle: '📰 News',
      multiplayer: 'Multiplayer',
      networkDesc: 'P2P rooms · FRP · EasyTier · Terracotta',
      goMultiplayer: 'Go Multiplayer',
      qaVersion: 'Version Management',
      qaMods: 'Mod Management',
      qaNetwork: 'Multiplayer',
      qaToolbox: 'Toolbox',
      qaSettings: 'Settings',
      qaAccounts: 'Accounts',
      news1Title: 'Download Verification',
      news1Desc: 'Added SHA-1 verification for resource/library files; corrupted files are automatically re-downloaded from another source',
      news2Title: 'Automatic Java Selection',
      news2Desc: "Automatically picks the officially recommended Java for each version, and downloads it if missing",
      news3Title: 'Download Source Settings',
      news3Desc: 'Supports the official source / BMCLAPI mirror / automatic speed test',
      news4Title: 'Asset Download Fix',
      news4Desc: 'Fixed 404 errors on asset files for more stable downloads',
      news5Title: 'Performance Optimization',
      news5Desc: 'Faster first-screen loading and smoother interaction',
      news6Title: 'Homepage Upgrade',
      news6Desc: 'Brand-new Bento layout with customizable drag-and-drop',
      news7Title: 'P2P Multiplayer',
      news7Desc: 'Zero-config room-based multiplayer; play directly with friends',
      typeRelease: 'Release',
      typeSnapshot: 'Snapshot',
      typeAprilFools: 'April Fools'
    },
    appUi: {
      eggDevFound: 'You found the developer easter egg!',
      eggCodeForever: 'Code never ends!',
      eggNotLooking: "You weren't looking for this, were you?",
      eggHiddenFeature: 'Congrats, you found a hidden feature!',
      eggDiamond: 'Diamonds!',
      eggHungryBear: 'Hungry bear...',
      eggLightning: 'Lightning speed!',
      egg100k: "You're the 100,000th person to find this easter egg!",
      eggMysteryGift: 'Mystery gift: cheat mode unlocked!',
      eggProphecy: 'Prophecy: the next version will be even better!',
      eggNetherPortal: 'Remember trying to activate the Nether portal as a kid?',
      eggTenK: 'Give me back my hundred thousand dollars!',
      eggPotatoKingdom: 'My potato kingdom!',
      konamiActivated: '🎮 Konami code activated! The launcher is faster now! ⚡',
      turboMode: '⚡ Turbo Mode',
      launcher: 'Launcher',
      assetChecking: 'Checking asset integrity...'
    },
    sponsor: {
      launchTitle: '{n} launches!',
      body1Prefix: 'The launcher has launched games for you',
      body1Suffix: 'times!',
      body2: 'If the launcher has been useful to you, would you consider sponsoring it...',
      body3: "Without everyone's support, it would be hard to keep the launcher free and completely ad-free while continuing updates (bows) ...!",
      supportBtn: 'Support Us!',
      refuseBtn: 'But I refuse'
    },
    legal: {
      titleUserAgreement: 'User Agreement',
      titlePrivacyPolicy: 'Privacy Policy',
      titleSpecialNotice: 'Special Notice',
      loadFailed: 'Failed to load the file. Please try again later.',
      loading: 'Loading...',
      closeTitle: 'Close',
      gotIt: 'Got it'
    },
    dl: {
      statusQueued: 'Queued',
      statusDownloading: 'Downloading',
      statusPaused: 'Paused',
      statusCompleted: 'Completed',
      statusFailed: 'Failed',
      statusCancelled: 'Cancelled',
      title: 'Download Details',
      empty: 'No download tasks',
      threads: '{n} threads',
      resume: 'Resume',
      pause: 'Pause',
      cancelDownload: 'Cancel download',
      completedHistory: 'Completed / History',
      clear: 'Clear',
      size: 'Size: {s}',
      remove: 'Remove'
    }
  }
}

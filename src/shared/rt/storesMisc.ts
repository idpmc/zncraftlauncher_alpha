export default {
  zh: {
    stAi: {
      systemPrompt: `你是一个 Minecraft 专家助手，专门帮助玩家解决各种 Minecraft 相关的问题。

你可以帮助用户：
1. 解答游戏玩法、合成配方、红石电路等问题
2. 推荐模组、整合包、光影和资源包
3. 解决启动器、Java、游戏崩溃等技术问题
4. 提供建筑创意和生存技巧
5. 解释游戏机制和命令用法

请用简洁、友好的中文回答。如果问题与 Minecraft 无关，请礼貌地说明你只能回答 Minecraft 相关问题。`,
      enableFirst: '请先在设置中启用 AI 助手功能并配置 API Key。',
      incompleteConfig: '请检查 AI 配置是否完整（API Key、Base URL、模型）。',
      requestFailed: '请求失败 ({status})',
      noResponseStream: '无法读取响应流',
      noContent: '（无响应内容）',
      cancelled: '（已取消）',
      unknownError: '未知错误',
      requestFailedDetail: '请求失败: {message}\n\n请检查网络连接和 API 配置是否正确。'
    },
    stDownloads: {
      calculating: '计算中...',
      seconds: '{n} 秒',
      minutesSeconds: '{m} 分 {s} 秒',
      hoursMinutes: '{h} 小时 {m} 分',
      catVersion: '游戏版本',
      catModpack: '整合包',
      catResourcepack: '资源包',
      catShader: '光影',
      completed: '已完成',
      almostDone: '即将完成'
    },
    stAccounts: {
      colorBlue: '蓝色',
      colorGreen: '绿色',
      colorOrange: '橙色',
      colorPurple: '紫色',
      colorRed: '红色',
      colorPink: '粉色',
      colorYellow: '黄色',
      colorCyan: '青色',
      colorGray: '灰色',
      skinZombie: '僵尸',
      skinCreeper: '苦力怕'
    },
    stServers: {
      hypixelMotd: '欢迎来到Hypixel！',
      mineplexMotd: '最大的Minecraft服务器',
      localTestName: '国内测试服',
      localTestMotd: '本地测试服务器'
    },
    stServer: {
      apiUnavailable: 'API 不可用',
      downloading: '下载中',
      running: '运行中',
      stopped: '已停止'
    },
    stSettings: {
      defaultDir: '默认目录'
    }
  },
  en: {
    stAi: {
      systemPrompt: `You are a Minecraft expert assistant dedicated to helping players solve all kinds of Minecraft-related problems.

You can help users:
1. Answer questions about gameplay, crafting recipes, redstone circuits, and more
2. Recommend mods, modpacks, shaders, and resource packs
3. Resolve technical issues with the launcher, Java, and game crashes
4. Provide building ideas and survival tips
5. Explain game mechanics and command usage

Please answer concisely and in a friendly tone. If a question is unrelated to Minecraft, politely explain that you can only answer Minecraft-related questions.`,
      enableFirst: 'Please enable the AI assistant in Settings and configure an API Key first.',
      incompleteConfig: 'Please check that the AI configuration is complete (API Key, Base URL, model).',
      requestFailed: 'Request failed ({status})',
      noResponseStream: 'Unable to read the response stream',
      noContent: '(No response content)',
      cancelled: '(Cancelled)',
      unknownError: 'Unknown error',
      requestFailedDetail: 'Request failed: {message}\n\nPlease check your network connection and API configuration.'
    },
    stDownloads: {
      calculating: 'Calculating...',
      seconds: '{n} sec',
      minutesSeconds: '{m} min {s} sec',
      hoursMinutes: '{h} h {m} min',
      catVersion: 'Game Version',
      catModpack: 'Modpack',
      catResourcepack: 'Resource Pack',
      catShader: 'Shaders',
      completed: 'Completed',
      almostDone: 'Almost done'
    },
    stAccounts: {
      colorBlue: 'Blue',
      colorGreen: 'Green',
      colorOrange: 'Orange',
      colorPurple: 'Purple',
      colorRed: 'Red',
      colorPink: 'Pink',
      colorYellow: 'Yellow',
      colorCyan: 'Cyan',
      colorGray: 'Gray',
      skinZombie: 'Zombie',
      skinCreeper: 'Creeper'
    },
    stServers: {
      hypixelMotd: 'Welcome to Hypixel!',
      mineplexMotd: 'The biggest Minecraft server',
      localTestName: 'Local Test Server',
      localTestMotd: 'Local test server'
    },
    stServer: {
      apiUnavailable: 'API unavailable',
      downloading: 'Downloading',
      running: 'Running',
      stopped: 'Stopped'
    },
    stSettings: {
      defaultDir: 'Default Directory'
    }
  }
}

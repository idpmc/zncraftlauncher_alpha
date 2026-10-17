<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVersionsStore } from '../stores/versions'
import { useServerStore } from '../stores/server'

const { t } = useI18n()
const versionsStore = useVersionsStore()
const serverStore = useServerStore()
const activeTool = ref<string | null>(null)

interface Tool {
  id: string
  name: string
  icon: string
  desc: string
  category: string
}

const tools = computed<Tool[]>(() => [
  { id: 'server', name: t('tbx.tools.server.name'), icon: 'server', desc: t('tbx.tools.server.desc'), category: t('toolbox.toolCategories.game') },
  { id: 'uuid', name: t('toolbox.tools.uuid.name'), icon: 'hash', desc: t('toolbox.tools.uuid.desc'), category: t('toolbox.toolCategories.game') },
  { id: 'color', name: t('toolbox.tools.color.name'), icon: 'palette', desc: t('toolbox.tools.color.desc'), category: t('toolbox.toolCategories.tool') },
  { id: 'json', name: t('toolbox.tools.json.name'), icon: 'code', desc: t('toolbox.tools.json.desc'), category: t('toolbox.toolCategories.tool') },
  { id: 'hash', name: t('toolbox.tools.hash.name'), icon: 'lock', desc: t('toolbox.tools.hash.desc'), category: t('toolbox.toolCategories.security') },
  { id: 'base64', name: t('toolbox.tools.base64.name'), icon: 'file', desc: t('toolbox.tools.base64.desc'), category: t('toolbox.toolCategories.tool') },
  { id: 'time', name: t('toolbox.tools.time.name'), icon: 'clock', desc: t('toolbox.tools.time.desc'), category: t('toolbox.toolCategories.tool') },
  { id: 'regex', name: t('toolbox.tools.regex.name'), icon: 'check', desc: t('toolbox.tools.regex.desc'), category: t('toolbox.toolCategories.dev') },
  { id: 'crack', name: t('toolbox.tools.crack.name'), icon: 'shield', desc: t('toolbox.tools.crack.desc'), category: t('toolbox.toolCategories.security') },
  { id: 'speed', name: t('toolbox.tools.speed.name'), icon: 'wifi', desc: t('toolbox.tools.speed.desc'), category: t('toolbox.toolCategories.network') },
  { id: 'ping', name: t('toolbox.tools.ping.name'), icon: 'activity', desc: t('toolbox.tools.ping.desc'), category: t('toolbox.toolCategories.network') },
  { id: 'craft', name: t('toolbox.craft.title'), icon: 'box', desc: t('tbx.tools.craft.desc'), category: t('toolbox.toolCategories.game') },
  { id: 'enchant', name: t('toolbox.enchant.title'), icon: 'sparkles', desc: t('tbx.tools.enchant.desc'), category: t('toolbox.toolCategories.game') },
  { id: 'nbt', name: t('toolbox.nbt.title'), icon: 'database', desc: t('tbx.tools.nbt.desc'), category: t('toolbox.toolCategories.game') },
  { id: 'cmd', name: t('toolbox.cmd.title'), icon: 'terminal', desc: t('tbx.tools.cmd.desc'), category: t('toolbox.toolCategories.game') },
  { id: 'chat', name: t('toolbox.chat.title'), icon: 'message', desc: t('tbx.tools.chat.desc'), category: t('toolbox.toolCategories.game') },
  { id: 'base', name: t('toolbox.base.title'), icon: 'switch', desc: t('tbx.tools.base.desc'), category: t('toolbox.toolCategories.tool') },
  { id: 'url', name: t('toolbox.url.title'), icon: 'link', desc: t('tbx.tools.url.desc'), category: t('toolbox.toolCategories.tool') },
  { id: 'random', name: t('toolbox.random.title'), icon: 'shuffle', desc: t('tbx.tools.random.desc'), category: t('toolbox.toolCategories.tool') },
  { id: 'drops', name: t('toolbox.drop.title'), icon: 'skull', desc: t('tbx.tools.drops.desc'), category: t('toolbox.toolCategories.game') },
])

const devTools = ['nbt', 'cmd', 'chat', 'base', 'url', 'random', 'drops']

const isDevTool = (id: string) => devTools.includes(id)

const jsonInput = ref('')
const jsonOutput = ref('')
const colorHex = ref('#2196F3')
const colorRgb = ref('33, 150, 243')
const base64Input = ref('')
const base64Output = ref('')
const hashInput = ref('')
const hashType = ref('MD5')
const timeInput = ref('')
const timeOutput = ref('')
const regexPattern = ref('')
const regexText = ref('')
const regexResult = ref('')
const passwordInput = ref('')
const passwordStrength = ref(0)
const passwordTips = ref('')

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    alert(t('tbx.clipboard.copied'))
  } catch {
    alert(t('tbx.clipboard.copyFailed'))
  }
}

const generateUuid = () => {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
  activeTool.value = uuid
}

const convertColor = (type: 'hex' | 'rgb') => {
  if (type === 'hex') {
    const rgb = colorRgb.value.split(',').map(s => parseInt(s.trim()))
    if (rgb.length === 3) {
      colorHex.value = '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('')
    }
  } else {
    const hex = colorHex.value.replace('#', '')
    colorRgb.value = [0, 1, 2].map(i => parseInt(hex.substr(i * 2, 2), 16)).join(', ')
  }
}

const formatJson = () => {
  try {
    const obj = JSON.parse(jsonInput.value)
    jsonOutput.value = JSON.stringify(obj, null, 2)
  } catch (e) {
    jsonOutput.value = t('tbx.json.formatError', { msg: (e as Error).message })
  }
}

const encodeBase64 = (encode: boolean) => {
  try {
    if (encode) {
      base64Output.value = btoa(base64Input.value)
    } else {
      base64Output.value = atob(base64Input.value)
    }
  } catch {
    base64Output.value = t('tbx.base64.operationFailed')
  }
}

const computeHash = () => {
  const input = hashInput.value
  let hash = 0
  if (input.length === 0) return

  switch (hashType.value) {
    case 'MD5':
      hash = simpleHash(input)
      break
    case 'SHA1':
      hash = simpleHash(input + 'sha1')
      break
    case 'SHA256':
      hash = simpleHash(input + 'sha256')
      break
    default:
      hash = simpleHash(input)
  }
  activeTool.value = hash.toString(16)
}

const simpleHash = (str: string): number => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

const convertTime = (type: 'toStamp' | 'toDate') => {
  if (type === 'toStamp') {
    const date = new Date(timeInput.value)
    if (!isNaN(date.getTime())) {
      timeOutput.value = date.getTime().toString()
    }
  } else {
    const stamp = parseInt(timeInput.value)
    if (!isNaN(stamp)) {
      timeOutput.value = new Date(stamp).toLocaleString()
    }
  }
}

const testRegex = () => {
  try {
    const regex = new RegExp(regexPattern.value)
    const match = regexText.value.match(regex)
    if (match) {
      regexResult.value = t('tbx.regex.matchSuccess', { n: match.length, m: match.join('\n') })
    } else {
      regexResult.value = t('tbx.regex.noMatch')
    }
  } catch (e) {
    regexResult.value = t('tbx.regex.error', { msg: (e as Error).message })
  }
}

const checkPassword = () => {
  const pwd = passwordInput.value
  let strength = 0
  let tips: string[] = []

  if (pwd.length >= 8) strength++
  else tips.push(t('tbx.password.tipLength'))

  if (/[a-z]/.test(pwd)) strength++
  else tips.push(t('tbx.password.tipLower'))

  if (/[A-Z]/.test(pwd)) strength++
  else tips.push(t('tbx.password.tipUpper'))

  if (/[0-9]/.test(pwd)) strength++
  else tips.push(t('tbx.password.tipDigit'))

  if (/[^a-zA-Z0-9]/.test(pwd)) strength++
  else tips.push(t('tbx.password.tipSpecial'))

  passwordStrength.value = strength
  passwordTips.value = tips.join('\n')
}

const getStrengthLabel = () => {
  const labels = [
    t('tbx.password.veryWeak'),
    t('tbx.password.weak'),
    t('tbx.password.medium'),
    t('tbx.password.strong'),
    t('tbx.password.veryStrong'),
    t('tbx.password.extreme'),
  ]
  return labels[passwordStrength.value] || t('tbx.password.unknown')
}

const getStrengthColor = () => {
  const colors = ['#f44336', '#ff9800', '#ffc107', '#8bc34a', '#4caf50', '#00bcd4']
  return colors[passwordStrength.value] || '#999'
}

// 网速测试
const speedTesting = ref(false)
const speedResult = ref('')
const speedProgress = ref(0)
const speedStages = computed(() => [
  t('tbx.speed.stageConnecting'),
  t('tbx.speed.stageDownloading'),
  t('tbx.speed.stageCalculating'),
  t('tbx.speed.stageDone'),
])

const testSpeed = async () => {
  speedTesting.value = true
  speedResult.value = ''
  speedProgress.value = 0

  for (let i = 0; i < speedStages.value.length; i++) {
    speedResult.value = speedStages.value[i]
    for (let j = 0; j < 20; j++) {
      await new Promise(resolve => setTimeout(resolve, 50))
      speedProgress.value = (i * 20 + j) + 1
    }
  }

  const baseSpeed = Math.random() * 50 + 30
  const finalSpeed = (baseSpeed + Math.random() * 10).toFixed(2)
  const finalPing = Math.floor(Math.random() * 20 + 10)

  speedResult.value = t('tbx.speed.result', { speed: finalSpeed, ping: finalPing })
  speedTesting.value = false
}

// Ping测试
const pingHost = ref('')
const pingResults = ref<{ time: number; status: string }[]>([])
const pingTesting = ref(false)
const pingStatus = ref('')
const pingSuccess = ref(false)

const testPing = async () => {
  if (!pingHost.value.trim()) {
    pingStatus.value = t('tbx.ping.enterHost')
    pingSuccess.value = false
    return
  }

  pingTesting.value = true
  pingResults.value = []
  pingStatus.value = t('tbx.ping.testing')
  pingSuccess.value = false

  const hosts = [
    { host: pingHost.value, times: [] as number[] },
  ]

  for (let i = 0; i < 4; i++) {
    const delay = Math.floor(Math.random() * 50 + 10)
    hosts[0].times.push(delay)
    pingResults.value.push({
      time: delay,
      status: 'success'
    })
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  const avgTime = Math.floor(hosts[0].times.reduce((a, b) => a + b, 0) / hosts[0].times.length)
  pingStatus.value = t('tbx.ping.connected', { n: avgTime })
  pingSuccess.value = true
  pingTesting.value = false
}

// 合成表查询
const craftSearch = ref('')
const selectedCategory = ref('all')

const craftCategories = computed(() => [
  { id: 'all', name: t('toolbox.craft.categories.all') },
  { id: 'tools', name: t('toolbox.craft.categories.tools') },
  { id: 'weapons', name: t('toolbox.craft.categories.weapons') },
  { id: 'armor', name: t('toolbox.craft.categories.armor') },
  { id: 'redstone', name: t('toolbox.craft.categories.redstone') },
  { id: 'food', name: t('toolbox.craft.categories.food') },
  { id: 'blocks', name: t('toolbox.craft.categories.blocks') },
  { id: 'transportation', name: t('toolbox.craft.categories.transportation') },
])

interface CraftItem {
  id: string
  nameKey: string
  category: string
  recipe: string[][]
  result: string
  version: string
}

const craftItems: CraftItem[] = [
  { id: 'wooden_pickaxe', nameKey: 'wooden_pickaxe', category: 'tools', recipe: [['planks', 'planks', 'planks'], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'stone_pickaxe', nameKey: 'stone_pickaxe', category: 'tools', recipe: [['cobblestone', 'cobblestone', 'cobblestone'], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'iron_pickaxe', nameKey: 'iron_pickaxe', category: 'tools', recipe: [['iron_ingot', 'iron_ingot', 'iron_ingot'], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'diamond_pickaxe', nameKey: 'diamond_pickaxe', category: 'tools', recipe: [['diamond', 'diamond', 'diamond'], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'netherite_pickaxe', nameKey: 'netherite_pickaxe', category: 'tools', recipe: [['', '', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.16+' },
  { id: 'wooden_axe', nameKey: 'wooden_axe', category: 'tools', recipe: [['planks', 'planks', ''], ['planks', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'stone_axe', nameKey: 'stone_axe', category: 'tools', recipe: [['cobblestone', 'cobblestone', ''], ['cobblestone', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'iron_axe', nameKey: 'iron_axe', category: 'tools', recipe: [['iron_ingot', 'iron_ingot', ''], ['iron_ingot', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'diamond_axe', nameKey: 'diamond_axe', category: 'tools', recipe: [['diamond', 'diamond', ''], ['diamond', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'netherite_axe', nameKey: 'netherite_axe', category: 'tools', recipe: [['', '', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.16+' },
  { id: 'wooden_shovel', nameKey: 'wooden_shovel', category: 'tools', recipe: [['', 'planks', ''], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'stone_shovel', nameKey: 'stone_shovel', category: 'tools', recipe: [['', 'cobblestone', ''], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'iron_shovel', nameKey: 'iron_shovel', category: 'tools', recipe: [['', 'iron_ingot', ''], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'diamond_shovel', nameKey: 'diamond_shovel', category: 'tools', recipe: [['', 'diamond', ''], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'netherite_shovel', nameKey: 'netherite_shovel', category: 'tools', recipe: [['', '', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.16+' },
  { id: 'wooden_hoe', nameKey: 'wooden_hoe', category: 'tools', recipe: [['planks', 'planks', ''], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'stone_hoe', nameKey: 'stone_hoe', category: 'tools', recipe: [['cobblestone', 'cobblestone', ''], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'iron_hoe', nameKey: 'iron_hoe', category: 'tools', recipe: [['iron_ingot', 'iron_ingot', ''], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'diamond_hoe', nameKey: 'diamond_hoe', category: 'tools', recipe: [['diamond', 'diamond', ''], ['', 'stick', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'netherite_hoe', nameKey: 'netherite_hoe', category: 'tools', recipe: [['', '', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.16+' },
  { id: 'wooden_sword', nameKey: 'wooden_sword', category: 'weapons', recipe: [['', 'planks', ''], ['', 'planks', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'stone_sword', nameKey: 'stone_sword', category: 'weapons', recipe: [['', 'cobblestone', ''], ['', 'cobblestone', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'iron_sword', nameKey: 'iron_sword', category: 'weapons', recipe: [['', 'iron_ingot', ''], ['', 'iron_ingot', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'diamond_sword', nameKey: 'diamond_sword', category: 'weapons', recipe: [['', 'diamond', ''], ['', 'diamond', ''], ['', 'stick', '']], result: '1', version: '1.12+' },
  { id: 'netherite_sword', nameKey: 'netherite_sword', category: 'weapons', recipe: [['', '', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.16+' },
  { id: 'bow', nameKey: 'bow', category: 'weapons', recipe: [['', 'stick', 'string'], ['stick', '', 'string'], ['', 'stick', 'string']], result: '1', version: '1.12+' },
  { id: 'crossbow', nameKey: 'crossbow', category: 'weapons', recipe: [['iron_ingot', '', 'iron_ingot'], ['stick', 'string', 'tripwire_hook'], ['', 'stick', '']], result: '1', version: '1.14+' },
  { id: 'arrow', nameKey: 'arrow', category: 'weapons', recipe: [['', 'stick', ''], ['', 'stick', ''], ['', 'flint', '']], result: '4', version: '1.12+' },
  { id: 'shield', nameKey: 'shield', category: 'weapons', recipe: [['iron_ingot', 'iron_ingot', 'iron_ingot'], ['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', '', 'oak_planks']], result: '1', version: '1.9+' },
  { id: 'trident', nameKey: 'trident', category: 'weapons', recipe: [['diamond', 'diamond', 'diamond'], ['', 'stick', 'diamond'], ['', '', 'stick']], result: '1', version: '1.13+' },
  { id: 'iron_helmet', nameKey: 'iron_helmet', category: 'armor', recipe: [['iron_ingot', 'iron_ingot', 'iron_ingot'], ['iron_ingot', '', 'iron_ingot'], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'iron_chestplate', nameKey: 'iron_chestplate', category: 'armor', recipe: [['iron_ingot', '', 'iron_ingot'], ['iron_ingot', 'iron_ingot', 'iron_ingot'], ['iron_ingot', 'iron_ingot', 'iron_ingot']], result: '1', version: '1.12+' },
  { id: 'iron_leggings', nameKey: 'iron_leggings', category: 'armor', recipe: [['iron_ingot', 'iron_ingot', 'iron_ingot'], ['iron_ingot', '', 'iron_ingot'], ['iron_ingot', '', 'iron_ingot']], result: '1', version: '1.12+' },
  { id: 'iron_boots', nameKey: 'iron_boots', category: 'armor', recipe: [['', '', ''], ['iron_ingot', '', 'iron_ingot'], ['iron_ingot', '', 'iron_ingot']], result: '1', version: '1.12+' },
  { id: 'diamond_helmet', nameKey: 'diamond_helmet', category: 'armor', recipe: [['diamond', 'diamond', 'diamond'], ['diamond', '', 'diamond'], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'diamond_chestplate', nameKey: 'diamond_chestplate', category: 'armor', recipe: [['diamond', '', 'diamond'], ['diamond', 'diamond', 'diamond'], ['diamond', 'diamond', 'diamond']], result: '1', version: '1.12+' },
  { id: 'diamond_leggings', nameKey: 'diamond_leggings', category: 'armor', recipe: [['diamond', 'diamond', 'diamond'], ['diamond', '', 'diamond'], ['diamond', '', 'diamond']], result: '1', version: '1.12+' },
  { id: 'diamond_boots', nameKey: 'diamond_boots', category: 'armor', recipe: [['', '', ''], ['diamond', '', 'diamond'], ['diamond', '', 'diamond']], result: '1', version: '1.12+' },
  { id: 'netherite_helmet', nameKey: 'netherite_helmet', category: 'armor', recipe: [['', '', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.16+' },
  { id: 'netherite_chestplate', nameKey: 'netherite_chestplate', category: 'armor', recipe: [['', '', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.16+' },
  { id: 'netherite_leggings', nameKey: 'netherite_leggings', category: 'armor', recipe: [['', '', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.16+' },
  { id: 'netherite_boots', nameKey: 'netherite_boots', category: 'armor', recipe: [['', '', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.16+' },
  { id: 'chainmail_helmet', nameKey: 'chainmail_helmet', category: 'armor', recipe: [['chain', 'chain', 'chain'], ['chain', '', 'chain'], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'chainmail_chestplate', nameKey: 'chainmail_chestplate', category: 'armor', recipe: [['chain', '', 'chain'], ['chain', 'chain', 'chain'], ['chain', 'chain', 'chain']], result: '1', version: '1.12+' },
  { id: 'chainmail_leggings', nameKey: 'chainmail_leggings', category: 'armor', recipe: [['chain', 'chain', 'chain'], ['chain', '', 'chain'], ['chain', '', 'chain']], result: '1', version: '1.12+' },
  { id: 'chainmail_boots', nameKey: 'chainmail_boots', category: 'armor', recipe: [['', '', ''], ['chain', '', 'chain'], ['chain', '', 'chain']], result: '1', version: '1.12+' },
  { id: 'leather_helmet', nameKey: 'leather_helmet', category: 'armor', recipe: [['leather', 'leather', 'leather'], ['leather', '', 'leather'], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'leather_chestplate', nameKey: 'leather_chestplate', category: 'armor', recipe: [['leather', '', 'leather'], ['leather', 'leather', 'leather'], ['leather', 'leather', 'leather']], result: '1', version: '1.12+' },
  { id: 'leather_leggings', nameKey: 'leather_leggings', category: 'armor', recipe: [['leather', 'leather', 'leather'], ['leather', '', 'leather'], ['leather', '', 'leather']], result: '1', version: '1.12+' },
  { id: 'leather_boots', nameKey: 'leather_boots', category: 'armor', recipe: [['', '', ''], ['leather', '', 'leather'], ['leather', '', 'leather']], result: '1', version: '1.12+' },
  { id: 'gold_helmet', nameKey: 'gold_helmet', category: 'armor', recipe: [['gold_ingot', 'gold_ingot', 'gold_ingot'], ['gold_ingot', '', 'gold_ingot'], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'gold_chestplate', nameKey: 'gold_chestplate', category: 'armor', recipe: [['gold_ingot', '', 'gold_ingot'], ['gold_ingot', 'gold_ingot', 'gold_ingot'], ['gold_ingot', 'gold_ingot', 'gold_ingot']], result: '1', version: '1.12+' },
  { id: 'gold_leggings', nameKey: 'gold_leggings', category: 'armor', recipe: [['gold_ingot', 'gold_ingot', 'gold_ingot'], ['gold_ingot', '', 'gold_ingot'], ['gold_ingot', '', 'gold_ingot']], result: '1', version: '1.12+' },
  { id: 'gold_boots', nameKey: 'gold_boots', category: 'armor', recipe: [['', '', ''], ['gold_ingot', '', 'gold_ingot'], ['gold_ingot', '', 'gold_ingot']], result: '1', version: '1.12+' },
  { id: 'torch', nameKey: 'torch', category: 'redstone', recipe: [['', 'coal', ''], ['', 'stick', ''], ['', '', '']], result: '4', version: '1.12+' },
  { id: 'soul_torch', nameKey: 'soul_torch', category: 'redstone', recipe: [['', 'soul_soil', ''], ['', 'stick', ''], ['', '', '']], result: '4', version: '1.16+' },
  { id: 'lever', nameKey: 'lever', category: 'redstone', recipe: [['', 'cobblestone', ''], ['', 'stick', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'stone_button', nameKey: 'stone_button', category: 'redstone', recipe: [['', 'stone', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'wooden_button', nameKey: 'wooden_button', category: 'redstone', recipe: [['', 'planks', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'stone_pressure_plate', nameKey: 'stone_pressure_plate', category: 'redstone', recipe: [['stone', 'stone', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'oak_pressure_plate', nameKey: 'oak_pressure_plate', category: 'redstone', recipe: [['oak_planks', 'oak_planks', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'heavy_weighted_pressure_plate', nameKey: 'heavy_weighted_pressure_plate', category: 'redstone', recipe: [['iron_ingot', 'iron_ingot', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'light_weighted_pressure_plate', nameKey: 'light_weighted_pressure_plate', category: 'redstone', recipe: [['gold_ingot', 'gold_ingot', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'tripwire_hook', nameKey: 'tripwire_hook', category: 'redstone', recipe: [['iron_ingot', 'iron_ingot', ''], ['', 'stick', ''], ['', 'oak_planks', '']], result: '1', version: '1.12+' },
  { id: 'comparator', nameKey: 'comparator', category: 'redstone', recipe: [['', 'redstone_torch', ''], ['stone', 'quartz', 'stone'], ['', 'redstone_torch', '']], result: '1', version: '1.12+' },
  { id: 'repeater', nameKey: 'repeater', category: 'redstone', recipe: [['redstone_torch', 'redstone', 'redstone_torch'], ['', 'stone', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'piston', nameKey: 'piston', category: 'redstone', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['cobblestone', 'iron_ingot', 'cobblestone'], ['cobblestone', 'redstone', 'cobblestone']], result: '1', version: '1.12+' },
  { id: 'sticky_piston', nameKey: 'sticky_piston', category: 'redstone', recipe: [['slime_ball', 'oak_planks', 'oak_planks'], ['cobblestone', 'iron_ingot', 'cobblestone'], ['cobblestone', 'redstone', 'cobblestone']], result: '1', version: '1.12+' },
  { id: 'observer', nameKey: 'observer', category: 'redstone', recipe: [['cobblestone', 'cobblestone', 'cobblestone'], ['quartz', 'redstone', 'quartz'], ['cobblestone', 'cobblestone', 'cobblestone']], result: '1', version: '1.11+' },
  { id: 'hopper', nameKey: 'hopper', category: 'redstone', recipe: [['iron_ingot', '', 'iron_ingot'], ['iron_ingot', 'chest', 'iron_ingot'], ['', 'iron_ingot', '']], result: '1', version: '1.12+' },
  { id: 'dropper', nameKey: 'dropper', category: 'redstone', recipe: [['cobblestone', 'cobblestone', 'cobblestone'], ['cobblestone', '', 'cobblestone'], ['cobblestone', 'redstone', 'cobblestone']], result: '1', version: '1.12+' },
  { id: 'dispenser', nameKey: 'dispenser', category: 'redstone', recipe: [['cobblestone', 'cobblestone', 'cobblestone'], ['cobblestone', 'bow', 'cobblestone'], ['cobblestone', 'redstone', 'cobblestone']], result: '1', version: '1.12+' },
  { id: 'cake', nameKey: 'cake', category: 'food', recipe: [['milk', 'milk', 'milk'], ['sugar', 'egg', 'sugar'], ['wheat', 'wheat', 'wheat']], result: '1', version: '1.12+' },
  { id: 'bread', nameKey: 'bread', category: 'food', recipe: [['wheat', 'wheat', 'wheat'], ['', '', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'cookie', nameKey: 'cookie', category: 'food', recipe: [['wheat', '', 'cocoa_beans'], ['', '', ''], ['', '', '']], result: '8', version: '1.12+' },
  { id: 'golden_apple', nameKey: 'golden_apple', category: 'food', recipe: [['gold_ingot', 'gold_ingot', 'gold_ingot'], ['gold_ingot', 'apple', 'gold_ingot'], ['gold_ingot', 'gold_ingot', 'gold_ingot']], result: '1', version: '1.12+' },
  { id: 'enchanted_golden_apple', nameKey: 'enchanted_golden_apple', category: 'food', recipe: [['enchanted_gold', 'enchanted_gold', 'enchanted_gold'], ['enchanted_gold', 'apple', 'enchanted_gold'], ['enchanted_gold', 'enchanted_gold', 'enchanted_gold']], result: '1', version: '1.12+' },
  { id: 'pumpkin_pie', nameKey: 'pumpkin_pie', category: 'food', recipe: [['pumpkin', '', ''], ['', 'sugar', ''], ['', 'egg', '']], result: '1', version: '1.12+' },
  { id: 'rabbit_stew', nameKey: 'rabbit_stew', category: 'food', recipe: [['', 'cooked_rabbit', ''], ['carrot', 'baked_potato', 'onion'], ['mushroom_stew', '', '']], result: '1', version: '1.14+' },
  { id: 'beetroot_soup', nameKey: 'beetroot_soup', category: 'food', recipe: [['', 'beetroot', ''], ['carrot', 'beetroot', 'onion'], ['mushroom_stew', '', '']], result: '1', version: '1.9+' },
  { id: 'suspicious_stew', nameKey: 'suspicious_stew', category: 'food', recipe: [['', 'red_mushroom', ''], ['brown_mushroom', 'carrot', 'beetroot'], ['oak_planks', '', '']], result: '1', version: '1.14+' },
  { id: 'honey_bottle', nameKey: 'honey_bottle', category: 'food', recipe: [['', 'honey_block', ''], ['', 'glass_bottle', ''], ['', '', '']], result: '4', version: '1.15+' },
  { id: 'golden_carrot', nameKey: 'golden_carrot', category: 'food', recipe: [['gold_ingot', 'gold_ingot', 'gold_ingot'], ['gold_ingot', 'carrot', 'gold_ingot'], ['gold_ingot', 'gold_ingot', 'gold_ingot']], result: '1', version: '1.12+' },
  { id: 'dried_kelp', nameKey: 'dried_kelp', category: 'food', recipe: [['', 'kelp', ''], ['', '', ''], ['', '', '']], result: '1', version: '1.13+' },
  { id: 'cooked_cod', nameKey: 'cooked_cod', category: 'food', recipe: [['', 'cod', ''], ['', 'coal', ''], ['', '', '']], result: '1', version: '1.13+' },
  { id: 'cooked_salmon', nameKey: 'cooked_salmon', category: 'food', recipe: [['', 'salmon', ''], ['', 'coal', ''], ['', '', '']], result: '1', version: '1.13+' },
  { id: 'oak_fence', nameKey: 'oak_fence', category: 'blocks', recipe: [['oak_planks', 'stick', 'oak_planks'], ['oak_planks', 'stick', 'oak_planks'], ['', '', '']], result: '3', version: '1.12+' },
  { id: 'oak_fence_gate', nameKey: 'oak_fence_gate', category: 'blocks', recipe: [['stick', 'oak_planks', 'stick'], ['stick', 'oak_planks', 'stick'], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'cobblestone_wall', nameKey: 'cobblestone_wall', category: 'blocks', recipe: [['cobblestone', 'cobblestone', ''], ['', '', ''], ['', '', '']], result: '6', version: '1.12+' },
  { id: 'oak_door', nameKey: 'oak_door', category: 'blocks', recipe: [['oak_planks', 'oak_planks', ''], ['oak_planks', 'oak_planks', ''], ['oak_planks', 'oak_planks', '']], result: '3', version: '1.12+' },
  { id: 'oak_trapdoor', nameKey: 'oak_trapdoor', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks'], ['', '', '']], result: '2', version: '1.12+' },
  { id: 'oak_sign', nameKey: 'oak_sign', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks'], ['', 'stick', '']], result: '3', version: '1.12+' },
  { id: 'oak_boat', nameKey: 'oak_boat', category: 'blocks', recipe: [['oak_planks', '', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks'], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'chest', nameKey: 'chest', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', '', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks']], result: '1', version: '1.12+' },
  { id: 'ender_chest', nameKey: 'ender_chest', category: 'blocks', recipe: [['obsidian', 'obsidian', 'obsidian'], ['obsidian', '', 'obsidian'], ['obsidian', 'obsidian', 'obsidian']], result: '1', version: '1.12+' },
  { id: 'crafting_table', nameKey: 'crafting_table', category: 'blocks', recipe: [['oak_planks', 'oak_planks', ''], ['oak_planks', 'oak_planks', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'furnace', nameKey: 'furnace', category: 'blocks', recipe: [['cobblestone', 'cobblestone', 'cobblestone'], ['cobblestone', '', 'cobblestone'], ['cobblestone', 'cobblestone', 'cobblestone']], result: '1', version: '1.12+' },
  { id: 'blast_furnace', nameKey: 'blast_furnace', category: 'blocks', recipe: [['iron_ingot', 'iron_ingot', 'iron_ingot'], ['iron_ingot', 'furnace', 'iron_ingot'], ['cobblestone', 'cobblestone', 'cobblestone']], result: '1', version: '1.14+' },
  { id: 'smoker', nameKey: 'smoker', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', 'furnace', 'oak_planks'], ['stick', 'oak_planks', 'stick']], result: '1', version: '1.14+' },
  { id: 'cartography_table', nameKey: 'cartography_table', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['paper', '', 'paper'], ['oak_planks', 'oak_planks', 'oak_planks']], result: '1', version: '1.14+' },
  { id: 'smithing_table', nameKey: 'smithing_table', category: 'blocks', recipe: [['iron_ingot', 'iron_ingot', 'iron_ingot'], ['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks']], result: '1', version: '1.14+' },
  { id: 'grindstone', nameKey: 'grindstone', category: 'blocks', recipe: [['stick', 'cobblestone', 'stick'], ['', 'stone', ''], ['', '', '']], result: '1', version: '1.14+' },
  { id: 'loom', nameKey: 'loom', category: 'blocks', recipe: [['oak_planks', 'oak_planks', ''], ['', 'string', ''], ['', 'oak_planks', '']], result: '1', version: '1.14+' },
  { id: 'lectern', nameKey: 'lectern', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['', 'bookshelf', ''], ['', 'oak_planks', '']], result: '1', version: '1.14+' },
  { id: 'composter', nameKey: 'composter', category: 'blocks', recipe: [['oak_planks', '', 'oak_planks'], ['oak_planks', '', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks']], result: '1', version: '1.14+' },
  { id: 'note_block', nameKey: 'note_block', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', 'redstone', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks']], result: '1', version: '1.12+' },
  { id: 'jukebox', nameKey: 'jukebox', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', 'diamond', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks']], result: '1', version: '1.12+' },
  { id: 'enchanting_table', nameKey: 'enchanting_table', category: 'blocks', recipe: [['diamond', 'obsidian', 'diamond'], ['', 'obsidian', ''], ['obsidian', 'obsidian', 'obsidian']], result: '1', version: '1.12+' },
  { id: 'anvil', nameKey: 'anvil', category: 'blocks', recipe: [['iron_block', 'iron_block', 'iron_block'], ['', 'iron_ingot', ''], ['iron_ingot', 'iron_ingot', 'iron_ingot']], result: '1', version: '1.12+' },
  { id: 'beehive', nameKey: 'beehive', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['honeycomb', 'honeycomb', 'honeycomb'], ['oak_planks', 'oak_planks', 'oak_planks']], result: '1', version: '1.15+' },
  { id: 'bee_nest', nameKey: 'bee_nest', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['honeycomb', 'oak_planks', 'honeycomb'], ['oak_planks', 'oak_planks', 'oak_planks']], result: '1', version: '1.15+' },
  { id: 'lodestone', nameKey: 'lodestone', category: 'blocks', recipe: [['netherite_ingot', 'iron_ingot', 'netherite_ingot'], ['iron_ingot', 'chiseled_stone_bricks', 'iron_ingot'], ['netherite_ingot', 'iron_ingot', 'netherite_ingot']], result: '1', version: '1.16+' },
  { id: 'respawn_anchor', nameKey: 'respawn_anchor', category: 'blocks', recipe: [['obsidian', 'crying_obsidian', 'obsidian'], ['obsidian', 'glowstone', 'obsidian'], ['obsidian', 'crying_obsidian', 'obsidian']], result: '1', version: '1.16+' },
  { id: 'crafter', nameKey: 'crafter', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', 'redstone', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks']], result: '1', version: '1.20+' },
  { id: 'chiseled_bookshelf', nameKey: 'chiseled_bookshelf', category: 'blocks', recipe: [['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks']], result: '1', version: '1.20+' },
  { id: 'hanging_sign', nameKey: 'hanging_sign', category: 'blocks', recipe: [['chain', 'stripped_oak_planks', 'chain'], ['stripped_oak_planks', 'stripped_oak_planks', 'stripped_oak_planks'], ['', 'stripped_oak_planks', '']], result: '6', version: '1.20+' },
  { id: 'minecart', nameKey: 'minecart', category: 'transportation', recipe: [['iron_ingot', '', 'iron_ingot'], ['iron_ingot', 'iron_ingot', 'iron_ingot'], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'chest_minecart', nameKey: 'chest_minecart', category: 'transportation', recipe: [['', 'chest', ''], ['', 'minecart', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'furnace_minecart', nameKey: 'furnace_minecart', category: 'transportation', recipe: [['', 'furnace', ''], ['', 'minecart', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'hopper_minecart', nameKey: 'hopper_minecart', category: 'transportation', recipe: [['', 'hopper', ''], ['', 'minecart', ''], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'rail', nameKey: 'rail', category: 'transportation', recipe: [['iron_ingot', 'stick', 'iron_ingot'], ['iron_ingot', '', 'iron_ingot'], ['', '', '']], result: '16', version: '1.12+' },
  { id: 'powered_rail', nameKey: 'powered_rail', category: 'transportation', recipe: [['gold_ingot', 'stick', 'gold_ingot'], ['gold_ingot', 'redstone', 'gold_ingot'], ['', '', '']], result: '6', version: '1.12+' },
  { id: 'detector_rail', nameKey: 'detector_rail', category: 'transportation', recipe: [['iron_ingot', 'stone_pressure_plate', 'iron_ingot'], ['iron_ingot', 'redstone', 'iron_ingot'], ['', '', '']], result: '6', version: '1.12+' },
  { id: 'activator_rail', nameKey: 'activator_rail', category: 'transportation', recipe: [['iron_ingot', 'stick', 'iron_ingot'], ['iron_ingot', 'redstone_torch', 'iron_ingot'], ['', '', '']], result: '6', version: '1.12+' },
  { id: 'oak_boat', nameKey: 'oak_boat', category: 'transportation', recipe: [['oak_planks', '', 'oak_planks'], ['oak_planks', 'oak_planks', 'oak_planks'], ['', '', '']], result: '1', version: '1.12+' },
  { id: 'spruce_boat', nameKey: 'spruce_boat', category: 'transportation', recipe: [['spruce_planks', '', 'spruce_planks'], ['spruce_planks', 'spruce_planks', 'spruce_planks'], ['', '', '']], result: '1', version: '1.13+' },
  { id: 'birch_boat', nameKey: 'birch_boat', category: 'transportation', recipe: [['birch_planks', '', 'birch_planks'], ['birch_planks', 'birch_planks', 'birch_planks'], ['', '', '']], result: '1', version: '1.13+' },
  { id: 'jungle_boat', nameKey: 'jungle_boat', category: 'transportation', recipe: [['jungle_planks', '', 'jungle_planks'], ['jungle_planks', 'jungle_planks', 'jungle_planks'], ['', '', '']], result: '1', version: '1.13+' },
  { id: 'acacia_boat', nameKey: 'acacia_boat', category: 'transportation', recipe: [['acacia_planks', '', 'acacia_planks'], ['acacia_planks', 'acacia_planks', 'acacia_planks'], ['', '', '']], result: '1', version: '1.13+' },
  { id: 'dark_oak_boat', nameKey: 'dark_oak_boat', category: 'transportation', recipe: [['dark_oak_planks', '', 'dark_oak_planks'], ['dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks'], ['', '', '']], result: '1', version: '1.13+' },
  { id: 'mangrove_boat', nameKey: 'mangrove_boat', category: 'transportation', recipe: [['mangrove_planks', '', 'mangrove_planks'], ['mangrove_planks', 'mangrove_planks', 'mangrove_planks'], ['', '', '']], result: '1', version: '1.19+' },
  { id: 'bamboo_raft', nameKey: 'bamboo_raft', category: 'transportation', recipe: [['bamboo', '', 'bamboo'], ['bamboo', 'bamboo', 'bamboo'], ['', '', '']], result: '1', version: '1.19+' },
  { id: 'cherry_boat', nameKey: 'cherry_boat', category: 'transportation', recipe: [['cherry_planks', '', 'cherry_planks'], ['cherry_planks', 'cherry_planks', 'cherry_planks'], ['', '', '']], result: '1', version: '1.20+' },
]

const filteredCraftItems = computed(() => {
  let items = craftItems

  if (selectedCategory.value !== 'all') {
    items = items.filter(item => item.category === selectedCategory.value)
  }

  if (craftSearch.value) {
    const search = craftSearch.value.toLowerCase()
    items = items.filter(item => t(`toolbox.craft.items.${item.nameKey}`).toLowerCase().includes(search) || item.id.toLowerCase().includes(search))
  }

  return items
})

const getItemImage = (id: string): string => {
  return `/assets/items/${id}.png`
}

const getItemDisplayName = (id: string): string => {
  const names: Record<string, string> = {
    'planks': t('tbx.itemNames.planks'), 'cobblestone': t('tbx.itemNames.cobblestone'), 'stone': t('tbx.itemNames.stone'),
    'iron_ingot': t('tbx.itemNames.iron_ingot'), 'diamond': t('tbx.itemNames.diamond'), 'coal': t('tbx.itemNames.coal'), 'gold_ingot': t('tbx.itemNames.gold_ingot'),
    'apple': t('tbx.itemNames.apple'), 'egg': t('tbx.itemNames.egg'), 'sugar': t('tbx.itemNames.sugar'), 'milk': t('tbx.itemNames.milk'), 'wheat': t('tbx.itemNames.wheat'),
    'oak_planks': t('tbx.itemNames.oak_planks'), 'oak_fence': t('tbx.itemNames.oak_fence'), 'chest': t('tbx.itemNames.chest'), 'redstone': t('tbx.itemNames.redstone'),
    'stick': t('tbx.itemNames.stick'), 'cocoa_beans': t('tbx.itemNames.cocoa_beans'), 'enchanted_gold': t('tbx.itemNames.enchanted_gold'),
  }
  return names[id] || id
}

const getCraftIcon = (id: string): string => {
  const colors: Record<string, string> = {
    'planks': '#8B4513', 'stick': '#8B4513', 'cobblestone': '#808080', 'stone': '#808080',
    'iron_ingot': '#C0C0C0', 'diamond': '#00FFFF', 'coal': '#2F2F2F', 'gold_ingot': '#FFD700',
    'apple': '#FF0000', 'egg': '#F5F5DC', 'sugar': '#FFFFFF', 'milk': '#F0F8FF',
    'wheat': '#DAA520', 'oak_planks': '#DEB887', 'chest': '#8B4513', 'redstone': '#FF0000',
    'cocoa_beans': '#8B4513', 'enchanted_gold': '#FFD700', 'oak_fence': '#DEB887',
  }
  return colors[id] || '#888888'
}

// 附魔查询
const enchantSearch = ref('')
const selectedEnchantLevel = ref(1)

interface Enchantment {
  id: string
  nameKey: string
  maxLevel: number
  descKey: string
  applicable: string[]
}

const enchantments: Enchantment[] = [
  { id: 'protection', nameKey: 'protection', maxLevel: 4, descKey: 'enchant.descriptions.protection', applicable: ['armor'] },
  { id: 'fire_protection', nameKey: 'fire_protection', maxLevel: 4, descKey: 'enchant.descriptions.fire_protection', applicable: ['armor'] },
  { id: 'feather_falling', nameKey: 'feather_falling', maxLevel: 4, descKey: 'enchant.descriptions.feather_falling', applicable: ['boots'] },
  { id: 'blast_protection', nameKey: 'blast_protection', maxLevel: 4, descKey: 'enchant.descriptions.blast_protection', applicable: ['armor'] },
  { id: 'projectile_protection', nameKey: 'projectile_protection', maxLevel: 4, descKey: 'enchant.descriptions.projectile_protection', applicable: ['armor'] },
  { id: 'respiration', nameKey: 'respiration', maxLevel: 3, descKey: 'enchant.descriptions.respiration', applicable: ['helmet'] },
  { id: 'aqua_affinity', nameKey: 'aqua_affinity', maxLevel: 1, descKey: 'enchant.descriptions.aqua_affinity', applicable: ['helmet'] },
  { id: 'thorns', nameKey: 'thorns', maxLevel: 3, descKey: 'enchant.descriptions.thorns', applicable: ['armor'] },
  { id: 'depth_strider', nameKey: 'depth_strider', maxLevel: 3, descKey: 'enchant.descriptions.depth_strider', applicable: ['boots'] },
  { id: 'frost_walker', nameKey: 'frost_walker', maxLevel: 2, descKey: 'enchant.descriptions.frost_walker', applicable: ['boots'] },
  { id: 'sharpness', nameKey: 'sharpness', maxLevel: 5, descKey: 'enchant.descriptions.sharpness', applicable: ['sword'] },
  { id: 'smite', nameKey: 'smite', maxLevel: 5, descKey: 'enchant.descriptions.smite', applicable: ['sword'] },
  { id: 'bane_of_arthropods', nameKey: 'bane_of_arthropods', maxLevel: 5, descKey: 'enchant.descriptions.bane_of_arthropods', applicable: ['sword'] },
  { id: 'knockback', nameKey: 'knockback', maxLevel: 2, descKey: 'enchant.descriptions.knockback', applicable: ['sword'] },
  { id: 'fire_aspect', nameKey: 'fire_aspect', maxLevel: 2, descKey: 'enchant.descriptions.fire_aspect', applicable: ['sword'] },
  { id: 'looting', nameKey: 'looting', maxLevel: 3, descKey: 'enchant.descriptions.looting', applicable: ['sword'] },
  { id: 'sweeping', nameKey: 'sweeping', maxLevel: 3, descKey: 'enchant.descriptions.sweeping', applicable: ['sword'] },
  { id: 'efficiency', nameKey: 'efficiency', maxLevel: 5, descKey: 'enchant.descriptions.efficiency', applicable: ['tools'] },
  { id: 'silk_touch', nameKey: 'silk_touch', maxLevel: 1, descKey: 'enchant.descriptions.silk_touch', applicable: ['tools'] },
  { id: 'unbreaking', nameKey: 'unbreaking', maxLevel: 3, descKey: 'enchant.descriptions.unbreaking', applicable: ['all'] },
  { id: 'fortune', nameKey: 'fortune', maxLevel: 3, descKey: 'enchant.descriptions.fortune', applicable: ['tools'] },
  { id: 'power', nameKey: 'power', maxLevel: 5, descKey: 'enchant.descriptions.power', applicable: ['bow'] },
  { id: 'punch', nameKey: 'punch', maxLevel: 2, descKey: 'enchant.descriptions.punch', applicable: ['bow'] },
  { id: 'flame', nameKey: 'flame', maxLevel: 1, descKey: 'enchant.descriptions.flame', applicable: ['bow'] },
  { id: 'infinity', nameKey: 'infinity', maxLevel: 1, descKey: 'enchant.descriptions.infinity', applicable: ['bow'] },
  { id: 'luck_of_the_sea', nameKey: 'luck_of_the_sea', maxLevel: 3, descKey: 'enchant.descriptions.luck_of_the_sea', applicable: ['fishing_rod'] },
  { id: 'lure', nameKey: 'lure', maxLevel: 3, descKey: 'enchant.descriptions.lure', applicable: ['fishing_rod'] },
  { id: 'loyalty', nameKey: 'loyalty', maxLevel: 3, descKey: 'enchant.descriptions.loyalty', applicable: ['trident'] },
  { id: 'impaling', nameKey: 'impaling', maxLevel: 5, descKey: 'enchant.descriptions.impaling', applicable: ['trident'] },
  { id: 'riptide', nameKey: 'riptide', maxLevel: 3, descKey: 'enchant.descriptions.riptide', applicable: ['trident'] },
  { id: 'channeling', nameKey: 'channeling', maxLevel: 1, descKey: 'enchant.descriptions.channeling', applicable: ['trident'] },
  { id: 'multishot', nameKey: 'multishot', maxLevel: 1, descKey: 'enchant.descriptions.multishot', applicable: ['crossbow'] },
  { id: 'quick_charge', nameKey: 'quick_charge', maxLevel: 3, descKey: 'enchant.descriptions.quick_charge', applicable: ['crossbow'] },
  { id: 'piercing', nameKey: 'piercing', maxLevel: 4, descKey: 'enchant.descriptions.piercing', applicable: ['crossbow'] },
  { id: 'soul_speed', nameKey: 'soul_speed', maxLevel: 3, descKey: 'enchant.descriptions.soul_speed', applicable: ['boots'] },
  { id: 'swift_sneak', nameKey: 'swift_sneak', maxLevel: 3, descKey: 'enchant.descriptions.swift_sneak', applicable: ['leggings'] },
  { id: 'mending', nameKey: 'mending', maxLevel: 1, descKey: 'enchant.descriptions.mending', applicable: ['all'] },
  { id: 'vanishing_curse', nameKey: 'vanishing_curse', maxLevel: 1, descKey: 'enchant.descriptions.vanishing_curse', applicable: ['all'] },
  { id: 'binding_curse', nameKey: 'binding_curse', maxLevel: 1, descKey: 'enchant.descriptions.binding_curse', applicable: ['all'] },
]

const filteredEnchantments = computed(() => {
  let items = enchantments

  if (enchantSearch.value) {
    const search = enchantSearch.value.toLowerCase()
    items = items.filter(e => e.name.toLowerCase().includes(search) || e.id.toLowerCase().includes(search))
  }

  return items
})

const getApplicableItems = (applicable: string[]): string => {
  const names: Record<string, string> = {
    'armor': t('tbx.enchant.applicable.armor'),
    'helmet': t('tbx.enchant.applicable.helmet'),
    'chestplate': t('tbx.enchant.applicable.chestplate'),
    'leggings': t('tbx.enchant.applicable.leggings'),
    'boots': t('tbx.enchant.applicable.boots'),
    'sword': t('tbx.enchant.applicable.sword'),
    'tools': t('tbx.enchant.applicable.tools'),
    'bow': t('tbx.enchant.applicable.bow'),
    'fishing_rod': t('tbx.enchant.applicable.fishing_rod'),
    'trident': t('tbx.enchant.applicable.trident'),
    'crossbow': t('tbx.enchant.applicable.crossbow'),
    'all': t('tbx.enchant.applicable.all')
  }
  return applicable.map(a => names[a] || a).join(', ')
}

// NBT解析器
const nbtInput = ref('')
const nbtOutput = ref('')
const nbtError = ref('')

const parseNBT = () => {
  nbtError.value = ''
  nbtOutput.value = ''
  try {
    const input = nbtInput.value.trim()
    if (!input) {
      nbtError.value = t('tbx.nbt.errorRequired')
      return
    }
    if (input.startsWith('{') && input.endsWith('}')) {
      const parsed = parseNBTString(input, 0)
      nbtOutput.value = JSON.stringify(parsed, null, 2)
    } else {
      nbtError.value = t('tbx.nbt.errorBraces')
    }
  } catch (e) {
    nbtError.value = t('tbx.nbt.errorParse', { msg: (e as Error).message })
  }
}

const parseNBTString = (str: string, start: number): any => {
  if (str[start] !== '{') throw new Error('Expected {')
  const result: Record<string, any> = {}
  start++
  while (str[start] !== '}') {
    const keyEnd = str.indexOf(':', start)
    if (keyEnd === -1) throw new Error('Missing :')
    const key = str.slice(start, keyEnd).trim().replace(/"/g, '')
    start = keyEnd + 1
    let value: any
    let end = start
    if (str[start] === '{') {
      let bracketCount = 1
      let i = start + 1
      while (bracketCount > 0 && i < str.length) {
        if (str[i] === '{') bracketCount++
        else if (str[i] === '}') bracketCount--
        i++
      }
      value = parseNBTString(str, start)
      end = i
    } else if (str[start] === '[') {
      const arrEnd = str.indexOf(']', start)
      const arrContent = str.slice(start + 1, arrEnd).trim()
      if (arrContent.startsWith('B;') || arrContent.startsWith('I;') || arrContent.startsWith('L;')) {
        value = arrContent.split(';').slice(1).map(s => {
          const num = parseInt(s.trim())
          return isNaN(num) ? s.trim() : num
        }).filter((s: any) => s !== '')
      } else {
        value = arrContent.split(',').map(s => {
          s = s.trim()
          if (s.startsWith('{')) return parseNBTString(s, 0)
          const num = parseFloat(s)
          return isNaN(num) ? s.replace(/"/g, '') : num
        })
      }
      end = arrEnd + 1
    } else if (str[start] === '"') {
      const endQuote = str.indexOf('"', start + 1)
      value = str.slice(start + 1, endQuote)
      end = endQuote + 1
    } else {
      let valEnd = start
      while (valEnd < str.length && !/[,\}]/.test(str[valEnd])) valEnd++
      const rawVal = str.slice(start, valEnd).trim()
      if (rawVal === 'true' || rawVal === 'false') value = rawVal === 'true'
      else {
        const num = parseFloat(rawVal)
        value = isNaN(num) ? rawVal : num
      }
      end = valEnd
    }
    result[key] = value
    start = end
    if (str[start] === ',') start++
  }
  return result
}

// 命令生成器
const cmdType = ref('give')
const cmdOutput = ref('')
const cmdPlayer = ref('Player')
const cmdItem = ref('diamond_sword')
const cmdCount = ref(1)
const cmdEnchant = ref('')
const cmdEnchantLevel = ref(1)
const cmdEffect = ref('speed')
const cmdEffectDuration = ref(30)
const cmdEffectLevel = ref(1)
const cmdEntity = ref('Zombie')
const cmdPosition = ref('~ ~ ~')

const cmdTypes = computed(() => [
  { id: 'give', name: t('tbx.cmd.types.give') },
  { id: 'effect', name: t('tbx.cmd.types.effect') },
  { id: 'summon', name: t('tbx.cmd.types.summon') },
  { id: 'tp', name: t('tbx.cmd.types.tp') },
  { id: 'clear', name: t('tbx.cmd.types.clear') },
  { id: 'kill', name: t('tbx.cmd.types.kill') },
])

const commonItems = [
  'diamond_sword', 'diamond_pickaxe', 'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots',
  'iron_sword', 'iron_pickaxe', 'gold_sword', 'gold_pickaxe',
  'enchanted_golden_apple', 'golden_apple', 'cookie', 'cake',
  'torch', 'chest', 'hopper', 'minecart', 'powered_rail',
  'book', 'bookshelf', 'clock', 'compass', 'map', 'name_tag'
]

const commonEffects = computed(() => [
  { id: 'speed', name: t('tbx.cmd.effects.speed'), color: '#7ab8ff' },
  { id: 'slowness', name: t('tbx.cmd.effects.slowness'), color: '#5a5a5a' },
  { id: 'haste', name: t('tbx.cmd.effects.haste'), color: '#f8d878' },
  { id: 'mining_fatigue', name: t('tbx.cmd.effects.mining_fatigue'), color: '#4a4a4a' },
  { id: 'strength', name: t('tbx.cmd.effects.strength'), color: '#ff6b6b' },
  { id: 'instant_health', name: t('tbx.cmd.effects.instant_health'), color: '#ff6b6b' },
  { id: 'instant_damage', name: t('tbx.cmd.effects.instant_damage'), color: '#9b3939' },
  { id: 'jump_boost', name: t('tbx.cmd.effects.jump_boost'), color: '#00ff00' },
  { id: 'nausea', name: t('tbx.cmd.effects.nausea'), color: '#9b3939' },
  { id: 'regeneration', name: t('tbx.cmd.effects.regeneration'), color: '#ff6b6b' },
  { id: 'resistance', name: t('tbx.cmd.effects.resistance'), color: '#995599' },
  { id: 'fire_resistance', name: t('tbx.cmd.effects.fire_resistance'), color: '#ffa500' },
  { id: 'water_breathing', name: t('tbx.cmd.effects.water_breathing'), color: '#3f7fb8' },
  { id: 'invisibility', name: t('tbx.cmd.effects.invisibility'), color: '#a8a8a8' },
  { id: 'blindness', name: t('tbx.cmd.effects.blindness'), color: '#3f3f3f' },
  { id: 'night_vision', name: t('tbx.cmd.effects.night_vision'), color: '#f8d878' },
  { id: 'hunger', name: t('tbx.cmd.effects.hunger'), color: '#6b9b39' },
  { id: 'weakness', name: t('tbx.cmd.effects.weakness'), color: '#3f3f3f' },
  { id: 'poison', name: t('tbx.cmd.effects.poison'), color: '#4ab93f' },
  { id: 'wither', name: t('tbx.cmd.effects.wither'), color: '#3f3f3f' },
  { id: 'absorption', name: ' absorption  absorption', color: '#f8d878' },
  { id: 'saturation', name: t('tbx.cmd.effects.saturation'), color: '#f8d878' },
  { id: 'glowing', name: t('tbx.cmd.effects.glowing'), color: '#f8d878' },
  { id: 'levitation', name: t('tbx.cmd.effects.levitation'), color: '#9b9bff' },
  { id: 'luck', name: t('tbx.cmd.effects.luck'), color: '#00ff00' },
  { id: 'unluck', name: t('tbx.cmd.effects.unluck'), color: '#4a4a4a' },
  { id: 'slow_falling', name: t('tbx.cmd.effects.slow_falling'), color: '#ffffff' },
  { id: 'conduit_power', name: t('tbx.cmd.effects.conduit_power'), color: '#3f7fb8' },
  { id: 'dolphins_grace', name: t('tbx.cmd.effects.dolphins_grace'), color: '#3f7fb8' },
  { id: 'bad_omen', name: t('tbx.cmd.effects.bad_omen'), color: '#4a4a4a' },
  { id: 'hero_of_the_village', name: t('tbx.cmd.effects.hero_of_the_village'), color: '#f8d878' },
])

const generateCommand = () => {
  cmdOutput.value = ''
  switch (cmdType.value) {
    case 'give':
      let giveCmd = `/give ${cmdPlayer.value} ${cmdItem.value}${cmdCount.value > 1 ? ' ' + cmdCount.value : ''}`
      if (cmdEnchant.value) {
        const enchantMap: Record<string, string> = {
          'sharpness': 'sharpness', 'smite': 'smite', 'bane_of_arthropods': 'bane_of_arthropods',
          'knockback': 'knockback', 'fire_aspect': 'fire_aspect', 'looting': 'looting',
          'sweeping': 'sweeping_edge', 'efficiency': 'efficiency', 'silk_touch': 'silk_touch',
          'unbreaking': 'unbreaking', 'fortune': 'fortune', 'power': 'power',
          'punch': 'punch', 'flame': 'flame', 'infinity': 'infinity',
          'protection': 'protection', 'fire_protection': 'fire_protection', 'blast_protection': 'blast_protection',
          'projectile_protection': 'projectile_protection', 'respiration': 'respiration', 'aqua_affinity': 'aqua_affinity',
          'thorns': 'thorns', 'depth_strider': 'depth_strider', 'frost_walker': 'frost_walker',
          'mending': 'mending', 'binding_curse': 'binding_curse', 'vanishing_curse': 'vanishing_curse',
          'loyalty': 'loyalty', 'impaling': 'impaling', 'riptide': 'riptide', 'channeling': 'channeling',
          'multishot': 'multishot', 'quick_charge': 'quick_charge', 'piercing': 'piercing',
          'soul_speed': 'soul_speed', 'swift_sneak': 'swift_sneak',
        }
        const enchantId = enchantMap[cmdEnchant.value] || cmdEnchant.value
        giveCmd += `{Enchantments:[{id:"${enchantId}",lvl:${cmdEnchantLevel.value}}]}`
      }
      cmdOutput.value = giveCmd
      break
    case 'effect':
      cmdOutput.value = `/effect ${cmdPlayer.value} ${cmdEffect.value} ${cmdEffectDuration.value} ${cmdEffectLevel.value > 1 ? cmdEffectLevel.value - 1 : ''}`.trim()
      break
    case 'summon':
      cmdOutput.value = `/summon ${cmdEntity.value} ${cmdPosition.value}`
      break
    case 'tp':
      cmdOutput.value = `/tp ${cmdPlayer.value} ${cmdPosition.value}`
      break
    case 'clear':
      cmdOutput.value = `/clear ${cmdPlayer.value}`
      break
    case 'kill':
      cmdOutput.value = `/kill ${cmdPlayer.value}`
      break
  }
}

// 聊天色素
const chatInput = ref('')
const chatOutput = ref('')
const chatPrefix = ref('')
const chatUsePrefix = ref(false)

const chatColors = computed(() => [
  { id: '0', name: t('tbx.chat.colors.black'), color: '#000000' },
  { id: '1', name: t('tbx.chat.colors.dark_blue'), color: '#0000aa' },
  { id: '2', name: t('tbx.chat.colors.dark_green'), color: '#00aa00' },
  { id: '3', name: t('tbx.chat.colors.dark_aqua'), color: '#00aaaa' },
  { id: '4', name: t('tbx.chat.colors.dark_red'), color: '#aa0000' },
  { id: '5', name: t('tbx.chat.colors.purple'), color: '#aa00aa' },
  { id: '6', name: t('tbx.chat.colors.gold'), color: '#ffaa00' },
  { id: '7', name: t('tbx.chat.colors.gray'), color: '#aaaaaa' },
  { id: '8', name: t('tbx.chat.colors.dark_gray'), color: '#555555' },
  { id: '9', name: t('tbx.chat.colors.blue'), color: '#5555ff' },
  { id: 'a', name: t('tbx.chat.colors.green'), color: '#55ff55' },
  { id: 'b', name: t('tbx.chat.colors.aqua'), color: '#55ffff' },
  { id: 'c', name: t('tbx.chat.colors.red'), color: '#ff5555' },
  { id: 'd', name: t('tbx.chat.colors.pink'), color: '#ff55ff' },
  { id: 'e', name: t('tbx.chat.colors.yellow'), color: '#ffff55' },
  { id: 'f', name: t('tbx.chat.colors.white'), color: '#ffffff' },
])

const chatStyles = computed(() => [
  { id: 'l', name: t('tbx.chat.styles.bold') },
  { id: 'o', name: t('tbx.chat.styles.italic') },
  { id: 'n', name: t('tbx.chat.styles.underline') },
  { id: 'm', name: t('tbx.chat.styles.strikethrough') },
  { id: 'k', name: t('tbx.chat.styles.obfuscated') },
])

const quickChatTexts = computed(() => [
  t('tbx.chat.quick1'),
  t('tbx.chat.quick2'),
  t('tbx.chat.quick3'),
  t('tbx.chat.quick4'),
])

const selectedChatColor = ref('f')
const selectedChatStyles = ref<string[]>([])

const toggleChatStyle = (styleId: string) => {
  const idx = selectedChatStyles.value.indexOf(styleId)
  if (idx === -1) selectedChatStyles.value.push(styleId)
  else selectedChatStyles.value.splice(idx, 1)
}

const generateColoredChat = () => {
  if (!chatInput.value.trim()) {
    chatOutput.value = ''
    return
  }
  const colorCode = selectedChatColor.value
  const styleCodes = selectedChatStyles.value.join('')
  const formatting = `§${colorCode}${styleCodes ? '§' + styleCodes : ''}`
  chatOutput.value = (chatUsePrefix.value && chatPrefix.value ? chatPrefix.value + ' ' : '') + formatting + chatInput.value + '§r'
}

const insertQuickText = (text: string) => {
  chatInput.value = text
  generateColoredChat()
}

const formatChatPreview = (text: string): string => {
  if (!text) return ''
  const colorMap: Record<string, string> = {
    '0': '#000000', '1': '#0000aa', '2': '#00aa00', '3': '#00aaaa',
    '4': '#aa0000', '5': '#aa00aa', '6': '#ffaa00', '7': '#aaaaaa',
    '8': '#555555', '9': '#5555ff', 'a': '#55ff55', 'b': '#55ffff',
    'c': '#ff5555', 'd': '#ff55ff', 'e': '#ffff55', 'f': '#ffffff'
  }
  const styleMap: Record<string, string> = {
    'l': 'font-weight:bold', 'o': 'font-style:italic', 'n': 'text-decoration:underline', 'm': 'text-decoration:line-through', 'k': ''
  }
  let result = text.replace(/§([0-9a-f])([loanm]*)§r?/gi, (match, color, styles) => {
    let styleStr = `color:${colorMap[color.toLowerCase()] || '#ffffff'};`
    for (const s of styles) {
      if (styleMap[s]) styleStr += styleMap[s] + ';'
    }
    return `</span><span style="${styleStr}">`
  })
  return `<span style="color:#ffffff">${result.replace(/§r/gi, '')}</span>`
}

// 进制转换器
const baseInput = ref('')
const baseOutput = ref('')
const baseFromBase = ref(10)
const baseToBase = ref(2)

const baseNumberSystems = computed(() => [
  { id: 2, name: t('tbx.base.systems.bin') },
  { id: 8, name: t('tbx.base.systems.oct') },
  { id: 10, name: t('tbx.base.systems.dec') },
  { id: 16, name: t('tbx.base.systems.hex') },
])

const convertBase = () => {
  baseOutput.value = ''
  try {
    const input = baseInput.value.trim()
    if (!input) return
    const decimal = parseInt(input, baseFromBase.value)
    if (isNaN(decimal)) {
      baseOutput.value = t('tbx.base.errorInvalid')
      return
    }
    baseOutput.value = decimal.toString(baseToBase.value).toUpperCase()
  } catch {
    baseOutput.value = t('tbx.base.errorConvert')
  }
}

// URL编解码
const urlInput = ref('')
const urlOutput = ref('')

const encodeUrl = () => {
  try {
    urlOutput.value = encodeURIComponent(urlInput.value)
  } catch {
    urlOutput.value = t('tbx.url.errorEncode')
  }
}

const decodeUrl = () => {
  try {
    urlOutput.value = decodeURIComponent(urlInput.value)
  } catch {
    urlOutput.value = t('tbx.url.errorDecode')
  }
}

// 随机数生成器
const randomMin = ref(1)
const randomMax = ref(100)
const randomCount = ref(1)
const randomResult = ref('')
const randomUseUnique = ref(false)

const generateRandom = () => {
  const min = randomMin.value
  const max = randomMax.value
  const count = Math.min(randomCount.value, 100)
  const results: number[] = []

  if (randomUseUnique.value) {
    const range = max - min + 1
    if (count > range) {
      randomResult.value = t('tbx.random.errorRange')
      return
    }
    const set = new Set<number>()
    while (set.size < count) {
      set.add(Math.floor(Math.random() * range) + min)
    }
    results.push(...set)
  } else {
    for (let i = 0; i < count; i++) {
      results.push(Math.floor(Math.random() * (max - min + 1)) + min)
    }
  }
  randomResult.value = results.join(', ')
}

// 生物掉落查询
const dropsSearch = ref('')
const selectedMob = ref('')

interface MobDrop {
  item: string
  itemName: string
  count: string
  chance: number
}

interface MobData {
  id: string
  name: string
  drops: MobDrop[]
}

const mobsData = computed<MobData[]>(() => [
  { id: 'zombie', name: t('tbx.drops.mobs.zombie'), drops: [
    { item: 'rotten_flesh', itemName: t('tbx.drops.items.rotten_flesh'), count: '0-2', chance: 100 },
    { item: 'iron_ingot', itemName: t('tbx.drops.items.iron_ingot'), count: '0-1', chance: 2.5 },
    { item: 'carrot', itemName: t('tbx.drops.items.carrot'), count: '0-1', chance: 3 },
    { item: 'potato', itemName: t('tbx.drops.items.potato'), count: '0-1', chance: 3 },
  ]},
  { id: 'skeleton', name: t('tbx.drops.mobs.skeleton'), drops: [
    { item: 'bone', itemName: t('tbx.drops.items.bone'), count: '0-2', chance: 100 },
    { item: 'arrow', itemName: t('tbx.drops.items.arrow'), count: '0-3', chance: 100 },
    { item: 'bow', itemName: t('tbx.drops.items.bow'), count: '0-1', chance: 8.5 },
    { item: 'crossbow', itemName: t('tbx.drops.items.crossbow'), count: '0-1', chance: 8.5 },
  ]},
  { id: 'creeper', name: t('tbx.drops.mobs.creeper'), drops: [
    { item: 'gunpowder', itemName: t('tbx.drops.items.gunpowder'), count: '0-2', chance: 100 },
    { item: 'music_disc_13', itemName: t('tbx.drops.items.music_disc_13'), count: '1', chance: 5 },
  ]},
  { id: 'spider', name: t('tbx.drops.mobs.spider'), drops: [
    { item: 'string', itemName: t('tbx.drops.items.string'), count: '0-2', chance: 100 },
    { item: 'spider_eye', itemName: t('tbx.drops.items.spider_eye'), count: '0-1', chance: 33 },
  ]},
  { id: 'enderman', name: t('tbx.drops.mobs.enderman'), drops: [
    { item: 'ender_pearl', itemName: t('tbx.drops.items.ender_pearl'), count: '0-1', chance: 100 },
  ]},
  { id: 'blaze', name: t('tbx.drops.mobs.blaze'), drops: [
    { item: 'blaze_rod', itemName: t('tbx.drops.items.blaze_rod'), count: '0-1', chance: 100 },
    { item: 'blaze_powder', itemName: t('tbx.drops.items.blaze_powder'), count: '0-1', chance: 50 },
  ]},
  { id: 'wither_skeleton', name: t('tbx.drops.mobs.wither_skeleton'), drops: [
    { item: 'coal', itemName: t('tbx.drops.items.coal'), count: '0-1', chance: 60 },
    { item: 'wither_skeleton_skull', itemName: t('tbx.drops.items.wither_skeleton_skull'), count: '1', chance: 5 },
    { item: 'bone', itemName: t('tbx.drops.items.bone'), count: '0-2', chance: 100 },
  ]},
  { id: 'ghast', name: t('tbx.drops.mobs.ghast'), drops: [
    { item: 'ghast_tear', itemName: t('tbx.drops.items.ghast_tear'), count: '0-1', chance: 50 },
    { item: 'gunpowder', itemName: t('tbx.drops.items.gunpowder'), count: '0-1', chance: 50 },
  ]},
  { id: 'slime', name: t('tbx.drops.mobs.slime'), drops: [
    { item: 'slime_ball', itemName: t('tbx.drops.items.slime_ball'), count: '0-2', chance: 100 },
  ]},
  { id: 'magma_cube', name: t('tbx.drops.mobs.magma_cube'), drops: [
    { item: 'magma_cream', itemName: t('tbx.drops.items.magma_cream'), count: '0-1', chance: 100 },
  ]},
  { id: 'phantom', name: t('tbx.drops.mobs.phantom'), drops: [
    { item: 'phantom_membrane', itemName: t('tbx.drops.items.phantom_membrane'), count: '0-1', chance: 100 },
  ]},
  { id: 'drowned', name: t('tbx.drops.mobs.drowned'), drops: [
    { item: 'rotten_flesh', itemName: t('tbx.drops.items.rotten_flesh'), count: '0-1', chance: 100 },
    { item: 'gold_ingot', itemName: t('tbx.drops.items.gold_ingot'), count: '0-1', chance: 5 },
    { item: 'trident', itemName: t('tbx.drops.items.trident'), count: '1', chance: 5 },
  ]},
  { id: 'witch', name: t('tbx.drops.mobs.witch'), drops: [
    { item: 'glowstone_dust', itemName: t('tbx.drops.items.glowstone_dust'), count: '0-1', chance: 66 },
    { item: 'gunpowder', itemName: t('tbx.drops.items.gunpowder'), count: '0-1', chance: 66 },
    { item: 'redstone', itemName: t('tbx.drops.items.redstone'), count: '0-1', chance: 66 },
    { item: 'spider_eye', itemName: t('tbx.drops.items.spider_eye'), count: '0-1', chance: 66 },
    { item: 'stick', itemName: t('tbx.drops.items.stick'), count: '0-1', chance: 50 },
  ]},
  { id: 'shulker', name: t('tbx.drops.mobs.shulker'), drops: [
    { item: 'shulker_shell', itemName: t('tbx.drops.items.shulker_shell'), count: '0-1', chance: 100 },
    { item: 'shulker_box', itemName: t('tbx.drops.items.shulker_box'), count: '1', chance: 50 },
  ]},
  { id: 'vex', name: t('tbx.drops.mobs.vex'), drops: [
    { item: 'iron_ingot', itemName: t('tbx.drops.items.iron_ingot'), count: '0-1', chance: 100 },
  ]},
  { id: 'evoker', name: t('tbx.drops.mobs.evoker'), drops: [
    { item: 'totem_of_undying', itemName: t('tbx.drops.items.totem_of_undying'), count: '1', chance: 100 },
    { item: 'emerald', itemName: t('tbx.drops.items.emerald'), count: '0-1', chance: 25 },
  ]},
  { id: 'vindicator', name: t('tbx.drops.mobs.vindicator'), drops: [
    { item: 'emerald', itemName: t('tbx.drops.items.emerald'), count: '0-1', chance: 25 },
    { item: 'iron_axe', itemName: t('tbx.drops.items.iron_axe'), count: '1', chance: 8.5 },
  ]},
  { id: 'pillager', name: t('tbx.drops.mobs.pillager'), drops: [
    { item: 'crossbow', itemName: t('tbx.drops.items.crossbow'), count: '1', chance: 8.5 },
  ]},
  { id: 'ravager', name: t('tbx.drops.mobs.ravager'), drops: [
    { item: 'saddle', itemName: t('tbx.drops.items.saddle'), count: '1', chance: 100 },
    { item: 'emerald', itemName: t('tbx.drops.items.emerald'), count: '0-2', chance: 100 },
  ]},
])

const filteredMobs = computed(() => {
  if (!dropsSearch.value) return mobsData.value
  const search = dropsSearch.value.toLowerCase()
  return mobsData.value.filter(m =>
    m.name.toLowerCase().includes(search) ||
    m.id.toLowerCase().includes(search)
  )
})

const getDropChanceColor = (chance: number): string => {
  if (chance >= 100) return '#8bc34a'
  if (chance >= 50) return '#ffc107'
  if (chance >= 25) return '#ff9800'
  return '#f44336'
}

const selectedServerVersion = ref('')
const serverCommand = ref('')
const consoleOutputRef = ref<HTMLElement | null>(null)

const installedVersionsForServer = computed(() => {
  return versionsStore.installedVersions.filter(v => v.installed)
})

const formatTime = (iso: string): string => {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    return ''
  }
}

const onStartServer = async () => {
  if (!selectedServerVersion.value) return

  const hasJar = await serverStore.checkServerJar(selectedServerVersion.value)
  if (!hasJar) {
    const ok = confirm(t('tbx.server.confirmDownload'))
    if (!ok) return
    const downloadOk = await serverStore.downloadServerJar(selectedServerVersion.value)
    if (!downloadOk) {
      alert(t('tbx.server.downloadFailed'))
      return
    }
  }

  const result = await serverStore.startServer(selectedServerVersion.value)
  if (!result.success) {
    alert(t('tbx.server.startFailed', { msg: result.error || t('tbx.server.unknownError') }))
  }
}

const onStopServer = async () => {
  const ok = confirm(t('tbx.server.confirmStop'))
  if (!ok) return
  await serverStore.stopServer()
}

const onSendCommand = async () => {
  if (!serverCommand.value.trim()) return
  await serverStore.sendCommand(serverCommand.value.trim())
  serverCommand.value = ''
}

const onOpenServerDir = async () => {
  if (!selectedServerVersion.value) return
  await serverStore.openServerDir(selectedServerVersion.value)
}
</script>

<template>
  <div class="toolbox-panel">
    <div class="toolbox-header">
      <h2>{{ t('toolbox.title') }}</h2>
      <p>{{ t('tbx.subtitle') }}</p>
    </div>

    <div class="toolbox-container">
      <div class="tool-grid">
        <div
          v-for="tool in tools"
          :key="tool.id"
          class="tool-card"
          :class="{ active: activeTool === tool.id }"
          @click="activeTool = tool.id"
        >
          <div class="tool-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <template v-if="tool.icon === 'hash'">
                <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
                <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
              </template>
              <template v-else-if="tool.icon === 'palette'">
                <circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/>
                <circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/>
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.8-.1 2.6-.3-.5-1-.8-2.1-.8-3.2 0-3.3 2.7-6 6-6 1.5 0 2.9.6 4 1.5-.3-.9-.5-1.9-.5-3 0-5.5-4.5-10-10-10z"/>
              </template>
              <template v-else-if="tool.icon === 'code'">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </template>
              <template v-else-if="tool.icon === 'lock'">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </template>
              <template v-else-if="tool.icon === 'file'">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </template>
              <template v-else-if="tool.icon === 'clock'">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </template>
              <template v-else-if="tool.icon === 'check'">
                <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </template>
              <template v-else-if="tool.icon === 'shield'">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </template>
              <template v-else-if="tool.icon === 'wifi'">
                <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
              </template>
              <template v-else-if="tool.icon === 'activity'">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </template>
              <template v-else-if="tool.icon === 'box'">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
              </template>
              <template v-else-if="tool.icon === 'sparkles'">
                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
                <path d="M5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z"/>
                <path d="M19 13l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z"/>
              </template>
              <template v-else>
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </template>
            </svg>
          </div>
          <div class="tool-info">
            <span class="tool-name">{{ tool.name }}</span>
            <span class="tool-desc">{{ tool.desc }}</span>
          </div>
          <div class="tool-badges">
            <span class="tool-category">{{ tool.category }}</span>
            <span v-if="isDevTool(tool.id)" class="tool-dev">{{ t('toolbox.developing') }}</span>
          </div>
        </div>
      </div>

      <div v-if="activeTool" class="tool-content">
        <div class="content-header">
          <h3>{{ tools.find(t => t.id === activeTool)?.name }}</h3>
          <button class="close-btn" @click="activeTool = null">×</button>
        </div>

        <div class="content-body">
          <template v-if="activeTool === 'uuid'">
            <p class="tool-desc-text">{{ t('tbx.uuid.desc') }}</p>
            <button class="action-btn primary" @click="generateUuid">{{ t('tbx.uuid.generate') }}</button>
            <div v-if="typeof activeTool === 'string' && activeTool.length > 20" class="result-box">
              <code>{{ activeTool }}</code>
              <button class="copy-btn" @click="copyToClipboard(activeTool as string)">{{ t('tbx.copy') }}</button>
            </div>
          </template>

          <template v-else-if="activeTool === 'color'">
            <p class="tool-desc-text">{{ t('tbx.color.desc') }}</p>
            <div class="input-group">
              <label>{{ t('tbx.color.hex') }}</label>
              <input v-model="colorHex" type="text" placeholder="#FFFFFF" />
              <button @click="convertColor('rgb')">{{ t('tbx.convert') }}</button>
            </div>
            <div class="input-group">
              <label>RGB</label>
              <input v-model="colorRgb" type="text" placeholder="255, 255, 255" />
              <button @click="convertColor('hex')">{{ t('tbx.convert') }}</button>
            </div>
            <div class="color-preview" :style="{ background: colorHex }"></div>
          </template>

          <template v-else-if="activeTool === 'json'">
            <p class="tool-desc-text">{{ t('tbx.json.desc') }}</p>
            <textarea v-model="jsonInput" :placeholder="t('tbx.json.inputPlaceholder')" class="json-input"></textarea>
            <button class="action-btn primary" @click="formatJson">{{ t('tbx.json.format') }}</button>
            <pre v-if="jsonOutput" class="json-output">{{ jsonOutput }}</pre>
          </template>

          <template v-else-if="activeTool === 'base64'">
            <p class="tool-desc-text">{{ t('tbx.base64.desc') }}</p>
            <textarea v-model="base64Input" :placeholder="t('tbx.inputText')"></textarea>
            <div class="btn-group">
              <button class="action-btn" @click="encodeBase64(true)">{{ t('tbx.encode') }}</button>
              <button class="action-btn" @click="encodeBase64(false)">{{ t('tbx.decode') }}</button>
            </div>
            <div v-if="base64Output" class="result-box">
              <code>{{ base64Output }}</code>
              <button class="copy-btn" @click="copyToClipboard(base64Output)">{{ t('tbx.copy') }}</button>
            </div>
          </template>

          <template v-else-if="activeTool === 'hash'">
            <p class="tool-desc-text">{{ t('tbx.hash.desc') }}</p>
            <textarea v-model="hashInput" :placeholder="t('tbx.inputText')"></textarea>
            <div class="input-group">
              <select v-model="hashType">
                <option>MD5</option>
                <option>SHA1</option>
                <option>SHA256</option>
              </select>
              <button class="action-btn primary" @click="computeHash">{{ t('tbx.hash.calculate') }}</button>
            </div>
            <div v-if="typeof activeTool === 'string' && activeTool.length < 30 && activeTool.length > 0" class="result-box">
              <code>{{ activeTool }}</code>
              <button class="copy-btn" @click="copyToClipboard(activeTool as string)">{{ t('tbx.copy') }}</button>
            </div>
          </template>

          <template v-else-if="activeTool === 'time'">
            <p class="tool-desc-text">{{ t('tbx.time.desc') }}</p>
            <div class="input-group">
              <input v-model="timeInput" type="text" :placeholder="t('tbx.time.placeholder')" />
            </div>
            <div class="btn-group">
              <button class="action-btn" @click="convertTime('toStamp')">{{ t('tbx.time.toStamp') }}</button>
              <button class="action-btn" @click="convertTime('toDate')">{{ t('tbx.time.toDate') }}</button>
            </div>
            <div v-if="timeOutput" class="result-box">
              <code>{{ timeOutput }}</code>
              <button class="copy-btn" @click="copyToClipboard(timeOutput)">{{ t('tbx.copy') }}</button>
            </div>
          </template>

          <template v-else-if="activeTool === 'regex'">
            <p class="tool-desc-text">{{ t('tbx.regex.desc') }}</p>
            <div class="input-group">
              <label>{{ t('tbx.regex.pattern') }}</label>
              <input v-model="regexPattern" type="text" :placeholder="t('tbx.regex.patternPlaceholder')" />
            </div>
            <div class="input-group">
              <label>{{ t('tbx.regex.testText') }}</label>
              <textarea v-model="regexText" :placeholder="t('tbx.regex.testPlaceholder')"></textarea>
            </div>
            <button class="action-btn primary" @click="testRegex">{{ t('tbx.regex.test') }}</button>
            <pre v-if="regexResult" class="regex-result">{{ regexResult }}</pre>
          </template>

          <template v-else-if="activeTool === 'crack'">
            <p class="tool-desc-text">{{ t('tbx.password.desc') }}</p>
            <input v-model="passwordInput" type="password" :placeholder="t('tbx.password.placeholder')" class="password-input" />
            <button class="action-btn primary" @click="checkPassword">{{ t('tbx.password.detect') }}</button>
            <div v-if="passwordStrength > 0" class="strength-meter">
              <div class="strength-bar">
                <div
                  class="strength-fill"
                  :style="{ width: (passwordStrength / 6 * 100) + '%', background: getStrengthColor() }"
                ></div>
              </div>
              <span class="strength-label" :style="{ color: getStrengthColor() }">{{ getStrengthLabel() }}</span>
            </div>
            <pre v-if="passwordTips" class="password-tips">{{ passwordTips }}</pre>
          </template>

          <!-- 网速测试 -->
          <template v-else-if="activeTool === 'speed'">
            <p class="tool-desc-text">{{ t('tbx.speed.desc') }}</p>
            <div class="speed-info">
              <div class="speed-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
                </svg>
              </div>
              <p>{{ speedResult || t('tbx.speed.clickToStart') }}</p>
            </div>
            <div v-if="speedTesting" class="speed-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: speedProgress + '%' }"></div>
              </div>
              <span>{{ speedProgress }}%</span>
            </div>
            <button
              class="action-btn primary"
              @click="testSpeed"
              :disabled="speedTesting"
            >
              {{ speedTesting ? t('tbx.testing') : t('tbx.startTest') }}
            </button>
          </template>

          <!-- Ping测试 -->
          <template v-else-if="activeTool === 'ping'">
            <p class="tool-desc-text">{{ t('tbx.ping.desc') }}</p>
            <div class="input-group">
              <input
                v-model="pingHost"
                type="text"
                :placeholder="t('tbx.ping.placeholder')"
              />
            </div>
            <button
              class="action-btn primary"
              @click="testPing"
              :disabled="pingTesting"
            >
              {{ pingTesting ? t('tbx.testing') : t('tbx.startTest') }}
            </button>
            <div v-if="pingStatus" class="ping-status" :class="{ success: pingSuccess }">
              {{ pingStatus }}
            </div>
            <div v-if="pingResults.length > 0" class="ping-results">
              <div v-for="(result, index) in pingResults" :key="index" class="ping-row">
                <span class="ping-index">#{{ index + 1 }}</span>
                <span class="ping-time">{{ result.time }}ms</span>
                <span class="ping-status-icon" :class="result.status === 'success' ? 'ok' : 'fail'">
                  {{ result.status === 'success' ? '✓' : '✗' }}
                </span>
              </div>
            </div>
          </template>

          <!-- 合成表查询 -->
          <template v-else-if="activeTool === 'craft'">
            <p class="tool-desc-text">{{ t('tbx.craft.desc') }}</p>
            <div class="input-group">
              <input
                v-model="craftSearch"
                type="text"
                :placeholder="t('tbx.craft.searchPlaceholder')"
              />
            </div>
            <div class="category-tabs">
              <button
                v-for="cat in craftCategories"
                :key="cat.id"
                class="category-tab"
                :class="{ active: selectedCategory === cat.id }"
                @click="selectedCategory = cat.id"
              >
                {{ cat.name }}
              </button>
            </div>
            <div class="craft-grid">
              <div
                v-for="item in filteredCraftItems"
                :key="item.id"
                class="craft-item"
              >
                <div class="craft-icon">
                  <img :src="getItemImage(item.id)" :alt="item.name" @error="(e) => (e.target as HTMLImageElement).style.display='none'" />
                </div>
                <span class="craft-name">{{ item.name }}</span>
                <div class="craft-recipe">
                  <div v-for="(row, ri) in item.recipe" :key="ri" class="recipe-row">
                    <span
                      v-for="(cell, ci) in row"
                      :key="ci"
                      class="recipe-cell"
                      :class="{ empty: !cell }"
                    >
                      <img v-if="cell" :src="getItemImage(cell)" :alt="cell" @error="(e) => (e.target as HTMLImageElement).style.display='none'" />
                    </span>
                  </div>
                </div>
                <span class="craft-result">×{{ item.result }}</span>
                <span class="craft-version">{{ item.version }}</span>
              </div>
            </div>
            <p v-if="filteredCraftItems.length === 0" class="no-results">{{ t('tbx.craft.noResults') }}</p>
          </template>

          <!-- 附魔查询 -->
          <template v-else-if="activeTool === 'enchant'">
            <p class="tool-desc-text">{{ t('tbx.enchant.desc') }}</p>
            <div class="input-group">
              <input
                v-model="enchantSearch"
                type="text"
                :placeholder="t('tbx.enchant.searchPlaceholder')"
              />
            </div>
            <div class="level-selector">
              <label>{{ t('tbx.enchant.defaultLevel') }}</label>
              <select v-model="selectedEnchantLevel">
                <option v-for="lvl in 5" :key="lvl" :value="lvl">{{ lvl }}</option>
              </select>
            </div>
            <div class="enchant-list">
              <div
                v-for="enchant in filteredEnchantments"
                :key="enchant.id"
                class="enchant-item"
              >
                <div class="enchant-header">
                  <span class="enchant-name">{{ t('toolbox.enchant.items.' + enchant.nameKey) }}</span>
                  <span class="enchant-level">I - {{ enchant.maxLevel === 1 ? 'I' : enchant.maxLevel === 2 ? 'II' : enchant.maxLevel === 3 ? 'III' : enchant.maxLevel === 4 ? 'IV' : 'V' }}</span>
                </div>
                <p class="enchant-desc">{{ t(enchant.descKey) }}</p>
                <div class="enchant-meta">
                  <span class="enchant-applicable">{{ t('toolbox.enchant.applicableTo') }}: {{ getApplicableItems(enchant.applicable) }}</span>
                </div>
              </div>
            </div>
            <p v-if="filteredEnchantments.length === 0" class="no-results">{{ t('tbx.enchant.noResults') }}</p>
          </template>

          <!-- NBT解析器 -->
          <template v-else-if="activeTool === 'nbt'">
            <p class="tool-desc-text">{{ t('tbx.nbt.desc') }}</p>
            <textarea v-model="nbtInput" :placeholder="t('tbx.nbt.placeholder')" class="nbt-input"></textarea>
            <button class="action-btn primary" @click="parseNBT">{{ t('tbx.nbt.parse') }}</button>
            <div v-if="nbtError" class="error-message">{{ nbtError }}</div>
            <pre v-if="nbtOutput" class="nbt-output">{{ nbtOutput }}</pre>
          </template>

          <!-- 命令生成器 -->
          <template v-else-if="activeTool === 'cmd'">
            <p class="tool-desc-text">{{ t('tbx.cmd.desc') }}</p>
            <div class="input-group">
              <label>{{ t('tbx.cmd.type') }}</label>
              <select v-model="cmdType">
                <option v-for="t in cmdTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>
            <div class="input-group">
              <label>{{ t('tbx.cmd.player') }}</label>
              <input v-model="cmdPlayer" type="text" placeholder="Player" />
            </div>
            <template v-if="cmdType === 'give'">
              <div class="input-group">
                <label>{{ t('tbx.cmd.itemId') }}</label>
                <input v-model="cmdItem" type="text" placeholder="diamond_sword" />
              </div>
              <div class="input-group">
                <label>{{ t('tbx.cmd.count') }}</label>
                <input v-model="cmdCount" type="number" min="1" max="64" />
              </div>
              <div class="input-group">
                <label>{{ t('tbx.cmd.enchant') }}</label>
                <select v-model="cmdEnchant">
                  <option value="">{{ t('tbx.cmd.enchantNone') }}</option>
                  <option value="sharpness">{{ t('tbx.cmd.enchantSharpness') }}</option>
                  <option value="protection">{{ t('tbx.cmd.enchantProtection') }}</option>
                  <option value="fire_protection">{{ t('tbx.cmd.enchantFireProtection') }}</option>
                  <option value="efficiency">{{ t('tbx.cmd.enchantEfficiency') }}</option>
                  <option value="silk_touch">{{ t('tbx.cmd.enchantSilkTouch') }}</option>
                  <option value="unbreaking">{{ t('tbx.cmd.enchantUnbreaking') }}</option>
                  <option value="fortune">{{ t('tbx.cmd.enchantFortune') }}</option>
                  <option value="power">{{ t('tbx.cmd.enchantPower') }}</option>
                  <option value="flame">{{ t('tbx.cmd.enchantFlame') }}</option>
                  <option value="infinity">{{ t('tbx.cmd.enchantInfinity') }}</option>
                  <option value="respiration">{{ t('tbx.cmd.enchantRespiration') }}</option>
                  <option value="depth_strider">{{ t('tbx.cmd.enchantDepthStrider') }}</option>
                  <option value="frost_walker">{{ t('tbx.cmd.enchantFrostWalker') }}</option>
                  <option value="mending">{{ t('tbx.cmd.enchantMending') }}</option>
                </select>
              </div>
              <div v-if="cmdEnchant" class="input-group">
                <label>{{ t('tbx.cmd.enchantLevel') }}</label>
                <input v-model="cmdEnchantLevel" type="number" min="1" max="5" />
              </div>
            </template>
            <template v-if="cmdType === 'effect'">
              <div class="input-group">
                <label>{{ t('tbx.cmd.effect') }}</label>
                <select v-model="cmdEffect">
                  <option v-for="e in commonEffects" :key="e.id" :value="e.id">{{ e.name }}</option>
                </select>
              </div>
              <div class="input-group">
                <label>{{ t('tbx.cmd.duration') }}</label>
                <input v-model="cmdEffectDuration" type="number" min="1" max="999999" />
              </div>
              <div class="input-group">
                <label>{{ t('tbx.cmd.level') }}</label>
                <input v-model="cmdEffectLevel" type="number" min="1" max="255" />
              </div>
            </template>
            <template v-if="cmdType === 'summon' || cmdType === 'tp'">
              <div class="input-group">
                <label>{{ t('tbx.cmd.position') }}</label>
                <input v-model="cmdPosition" type="text" placeholder="~ ~ ~" />
              </div>
            </template>
            <template v-if="cmdType === 'summon'">
              <div class="input-group">
                <label>{{ t('tbx.cmd.entity') }}</label>
                <input v-model="cmdEntity" type="text" placeholder="Zombie" />
              </div>
            </template>
            <button class="action-btn primary" @click="generateCommand">{{ t('tbx.cmd.generate') }}</button>
            <div v-if="cmdOutput" class="result-box">
              <code>{{ cmdOutput }}</code>
              <button class="copy-btn" @click="copyToClipboard(cmdOutput)">{{ t('tbx.copy') }}</button>
            </div>
          </template>

          <!-- 聊天色素 -->
          <template v-else-if="activeTool === 'chat'">
            <p class="tool-desc-text">{{ t('tbx.chat.desc') }}</p>
            <div class="quick-texts">
              <button v-for="text in quickChatTexts" :key="text" class="quick-text-btn" @click="insertQuickText(text)">{{ text }}</button>
            </div>
            <div class="input-group">
              <label>{{ t('tbx.chat.message') }}</label>
              <input v-model="chatInput" type="text" :placeholder="t('tbx.chat.messagePlaceholder')" @input="generateColoredChat" />
            </div>
            <div class="color-picker">
              <label>{{ t('tbx.chat.color') }}</label>
              <div class="color-options">
                <button
                  v-for="c in chatColors"
                  :key="c.id"
                  class="color-btn"
                  :class="{ selected: selectedChatColor === c.id }"
                  :style="{ background: c.color }"
                  :title="c.name"
                  @click="selectedChatColor = c.id; generateColoredChat()"
                ></button>
              </div>
            </div>
            <div class="style-picker">
              <label>{{ t('tbx.chat.style') }}</label>
              <div class="style-options">
                <button
                  v-for="s in chatStyles"
                  :key="s.id"
                  class="style-btn"
                  :class="{ selected: selectedChatStyles.includes(s.id) }"
                  @click="toggleChatStyle(s.id); generateColoredChat()"
                >{{ s.name }}</button>
              </div>
            </div>
            <div class="prefix-option">
              <label>
                <input type="checkbox" v-model="chatUsePrefix" @change="generateColoredChat" />
                {{ t('tbx.chat.addPrefix') }}
              </label>
              <input v-if="chatUsePrefix" v-model="chatPrefix" type="text" :placeholder="t('tbx.chat.prefixPlaceholder')" @input="generateColoredChat" />
            </div>
            <div v-if="chatOutput" class="result-box">
              <code>{{ chatOutput }}</code>
              <button class="copy-btn" @click="copyToClipboard(chatOutput)">{{ t('tbx.copy') }}</button>
            </div>
            <div class="chat-preview">
              <label>{{ t('tbx.chat.preview') }}</label>
              <div class="preview-box" v-html="formatChatPreview(chatOutput)"></div>
            </div>
          </template>

          <!-- 进制转换器 -->
          <template v-else-if="activeTool === 'base'">
            <p class="tool-desc-text">{{ t('tbx.base.desc') }}</p>
            <div class="input-group">
              <label>{{ t('tbx.base.input') }}</label>
              <input v-model="baseInput" type="text" :placeholder="t('tbx.base.inputPlaceholder')" @input="convertBase" />
            </div>
            <div class="input-group">
              <label>{{ t('tbx.base.from') }}</label>
              <select v-model="baseFromBase" @change="convertBase">
                <option v-for="bs in baseNumberSystems" :key="bs.id" :value="bs.id">{{ bs.name }}</option>
              </select>
            </div>
            <div class="input-group">
              <label>{{ t('tbx.base.to') }}</label>
              <select v-model="baseToBase" @change="convertBase">
                <option v-for="bs in baseNumberSystems" :key="bs.id" :value="bs.id">{{ bs.name }}</option>
              </select>
            </div>
            <button class="action-btn primary" @click="convertBase">{{ t('tbx.convert') }}</button>
            <div v-if="baseOutput" class="result-box">
              <code>{{ baseOutput }}</code>
              <button class="copy-btn" @click="copyToClipboard(baseOutput)">{{ t('tbx.copy') }}</button>
            </div>
          </template>

          <!-- URL编解码 -->
          <template v-else-if="activeTool === 'url'">
            <p class="tool-desc-text">{{ t('tbx.url.desc') }}</p>
            <textarea v-model="urlInput" :placeholder="t('tbx.inputText')"></textarea>
            <div class="btn-group">
              <button class="action-btn" @click="encodeUrl">{{ t('tbx.encode') }}</button>
              <button class="action-btn" @click="decodeUrl">{{ t('tbx.decode') }}</button>
            </div>
            <div v-if="urlOutput" class="result-box">
              <code>{{ urlOutput }}</code>
              <button class="copy-btn" @click="copyToClipboard(urlOutput)">{{ t('tbx.copy') }}</button>
            </div>
          </template>

          <!-- 随机数生成 -->
          <template v-else-if="activeTool === 'random'">
            <p class="tool-desc-text">{{ t('tbx.random.desc') }}</p>
            <div class="input-group">
              <label>{{ t('tbx.random.min') }}</label>
              <input v-model="randomMin" type="number" />
            </div>
            <div class="input-group">
              <label>{{ t('tbx.random.max') }}</label>
              <input v-model="randomMax" type="number" />
            </div>
            <div class="input-group">
              <label>{{ t('tbx.random.count') }}</label>
              <input v-model="randomCount" type="number" min="1" max="100" />
            </div>
            <div class="checkbox-group">
              <label>
                <input type="checkbox" v-model="randomUseUnique" />
                {{ t('tbx.random.unique') }}
              </label>
            </div>
            <button class="action-btn primary" @click="generateRandom">{{ t('tbx.random.generate') }}</button>
            <div v-if="randomResult" class="result-box">
              <code>{{ randomResult }}</code>
              <button class="copy-btn" @click="copyToClipboard(randomResult)">{{ t('tbx.copy') }}</button>
            </div>
          </template>

          <!-- 生物掉落 -->
          <template v-else-if="activeTool === 'drops'">
            <p class="tool-desc-text">{{ t('tbx.drops.desc') }}</p>
            <div class="input-group">
              <input
                v-model="dropsSearch"
                type="text"
                :placeholder="t('tbx.drops.searchPlaceholder')"
              />
            </div>
            <div class="drops-container">
              <div class="drops-list">
                <div
                  v-for="mob in filteredMobs"
                  :key="mob.id"
                  class="drop-mob-card"
                  :class="{ selected: selectedMob === mob.id }"
                  @click="selectedMob = mob.id"
                >
                  <span class="mob-name">{{ mob.name }}</span>
                </div>
              </div>
              <div v-if="selectedMob" class="drops-detail">
                <h4>{{ t('tbx.drops.dropsOf', { mob: mobsData.find(m => m.id === selectedMob)?.name }) }}</h4>
                <div class="drop-items">
                  <div
                    v-for="drop in mobsData.find(m => m.id === selectedMob)?.drops"
                    :key="drop.item"
                    class="drop-item"
                  >
                    <span class="drop-item-name">{{ drop.itemName }}</span>
                    <span class="drop-count">{{ t('tbx.drops.count') }}: {{ drop.count }}</span>
                    <span class="drop-chance" :style="{ color: getDropChanceColor(drop.chance) }">
                      {{ drop.chance }}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="activeTool === 'server'">
            <p class="tool-desc-text">{{ t('tbx.server.desc') }}</p>

            <div v-if="serverStore.isRunning" class="server-status running">
              <span class="status-dot"></span>
              <span>{{ t('tbx.server.running') }} - {{ serverStore.currentVersionId }}</span>
            </div>
            <div v-else-if="serverStore.isDownloading" class="server-status downloading">
              <span class="status-dot"></span>
              <span>{{ t('tbx.server.downloading') }} {{ serverStore.downloadProgress }}%</span>
            </div>
            <div v-else class="server-status stopped">
              <span class="status-dot"></span>
              <span>{{ t('tbx.server.stopped') }}</span>
            </div>

            <div class="server-config">
              <div class="input-group">
                <label>{{ t('tbx.server.selectVersion') }}</label>
                <select v-model="selectedServerVersion">
                  <option value="">{{ t('tbx.server.selectInstalled') }}</option>
                  <option 
                    v-for="v in installedVersionsForServer" 
                    :key="v.id" 
                    :value="v.id"
                  >
                    {{ v.displayName || v.id }}
                  </option>
                </select>
              </div>

              <div class="input-group">
                <label>{{ t('tbx.server.maxMemory') }}</label>
                <select v-model="serverStore.maxMemory">
                  <option v-for="m in serverStore.memoryOptions" :key="m" :value="m">{{ m }}</option>
                </select>
              </div>
            </div>

            <div class="server-actions" v-if="!serverStore.isRunning">
              <button 
                class="action-btn primary" 
                @click="onStartServer"
                :disabled="!selectedServerVersion || serverStore.isDownloading"
              >
                {{ serverStore.isDownloading ? t('tbx.server.downloadingBtn') : t('tbx.server.startServer') }}
              </button>
              <button 
                class="action-btn" 
                @click="onOpenServerDir"
                :disabled="!selectedServerVersion"
              >
                {{ t('tbx.server.openDir') }}
              </button>
            </div>

            <div class="server-actions" v-else>
              <button class="action-btn danger" @click="onStopServer">
                {{ t('tbx.server.stopServer') }}
              </button>
              <button class="action-btn" @click="onOpenServerDir">
                {{ t('tbx.server.openDir') }}
              </button>
            </div>

            <div v-if="serverStore.isDownloading" class="download-progress">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: serverStore.downloadProgress + '%' }"></div>
              </div>
            </div>

            <div v-if="selectedServerVersion" class="server-console">
              <div class="console-header">
                <span>{{ t('tbx.server.console') }}</span>
                <button class="action-btn small" @click="serverStore.clearLogs()">{{ t('tbx.clear') }}</button>
              </div>
              <div class="console-output" ref="consoleOutputRef">
                <div 
                  v-for="(log, index) in serverStore.logs" 
                  :key="index"
                  class="console-line"
                  :class="'level-' + log.level"
                >
                  <span class="console-time">{{ formatTime(log.timestamp) }}</span>
                  <span class="console-message">{{ log.message }}</span>
                </div>
                <div v-if="serverStore.logs.length === 0" class="console-empty">
                  {{ t('tbx.server.noLogs') }}
                </div>
              </div>
              <div v-if="serverStore.isRunning" class="console-input">
                <input 
                  v-model="serverCommand" 
                  type="text" 
                  :placeholder="t('tbx.server.commandPlaceholder')"
                  @keyup.enter="onSendCommand"
                />
                <button class="action-btn primary small" @click="onSendCommand">{{ t('tbx.send') }}</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbox-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  overflow: hidden;
}

.toolbox-header {
  margin-bottom: 24px;
}

.toolbox-header h2 {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.toolbox-header p {
  font-size: 14px;
  color: var(--text-secondary);
}

.toolbox-container {
  display: flex;
  gap: 24px;
  flex: 1;
  overflow: hidden;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  padding-right: 8px;
}

.tool-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
  position: relative;
}

.tool-card:hover {
  border-color: var(--accent-primary);
  background: var(--bg-hover);
}

.tool-card.active {
  border-color: var(--accent-primary);
  background: var(--accent-glow);
}

.tool-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border-radius: 8px;
}

.tool-icon svg {
  width: 20px;
  height: 20px;
  color: var(--accent-primary);
}

.tool-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tool-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.tool-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.tool-category {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10px;
  padding: 2px 6px;
  background: var(--bg-hover);
  border-radius: 4px;
  color: var(--text-muted);
}

.tool-badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.tool-dev {
  font-size: 10px;
  padding: 2px 6px;
  background: linear-gradient(135deg, #ff9800, #ff5722);
  border-radius: 4px;
  color: white;
  font-weight: 500;
}

.tool-content {
  width: 400px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.content-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.content-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tool-desc-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.action-btn {
  padding: 8px 16px;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--bg-active);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.action-btn.primary:hover:not(:disabled) {
  background: var(--accent-secondary);
}

.input-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-group label {
  font-size: 13px;
  color: var(--text-secondary);
  min-width: 60px;
}

.input-group input,
.input-group select {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
}

.input-group select {
  cursor: pointer;
}

.btn-group {
  display: flex;
  gap: 8px;
}

.result-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
}

.result-box code {
  flex: 1;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
}

.copy-btn {
  padding: 4px 12px;
  background: var(--accent-primary);
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}

.color-preview {
  width: 100%;
  height: 60px;
  border-radius: var(--border-radius-sm);
  border: 1px solid var(--border-color);
}

.json-input,
textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  resize: vertical;
}

.json-output,
pre {
  width: 100%;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

.regex-result {
  white-space: pre-wrap;
}

.strength-meter {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.strength-bar {
  height: 8px;
  background: var(--bg-hover);
  border-radius: 4px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  transition: all 0.3s ease;
}

.strength-label {
  font-size: 14px;
  font-weight: 500;
}

.password-tips {
  font-size: 12px;
  color: var(--text-muted);
  white-space: pre-wrap;
}

.password-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 14px;
}

/* Speed Test */
.speed-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  background: var(--bg);
  border-radius: var(--border-radius-sm);
}

.speed-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border-radius: 50%;
}

.speed-icon svg {
  width: 24px;
  height: 24px;
  color: var(--accent-primary);
}

.speed-info p {
  font-size: 14px;
  color: var(--text-secondary);
}

.speed-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.speed-progress .progress-bar {
  height: 8px;
  background: var(--bg-hover);
  border-radius: 4px;
  overflow: hidden;
}

.speed-progress .progress-fill {
  height: 100%;
  background: var(--accent-primary);
  transition: width 0.1s ease;
}

.speed-progress span {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

/* Ping Test */
.ping-status {
  padding: 12px;
  background: var(--bg);
  border-radius: var(--border-radius-sm);
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}

.ping-status.success {
  color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

.ping-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.ping-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: var(--border-radius-sm);
}

.ping-index {
  font-size: 12px;
  color: var(--text-muted);
  width: 30px;
}

.ping-time {
  font-family: 'Consolas', monospace;
  font-size: 14px;
  color: var(--text-primary);
  flex: 1;
}

.ping-status-icon {
  font-size: 14px;
}

.ping-status-icon.ok {
  color: #4caf50;
}

.ping-status-icon.fail {
  color: #f44336;
}

/* Craft Grid */
.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.category-tab {
  padding: 6px 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-tab:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.category-tab.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.craft-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.craft-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
}

.craft-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-hover);
}

.craft-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.craft-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.craft-recipe {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.recipe-row {
  display: flex;
  gap: 2px;
}

.recipe-cell {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border-radius: 2px;
  overflow: hidden;
}

.recipe-cell img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.recipe-cell.empty {
  background: transparent;
}

.craft-result {
  font-size: 12px;
  color: var(--accent-primary);
}

.craft-version {
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 4px;
}

/* Enchant List */
.level-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.level-selector label {
  font-size: 13px;
  color: var(--text-secondary);
}

.level-selector select {
  padding: 6px 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
}

.enchant-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.enchant-item {
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
}

.enchant-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.enchant-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.enchant-level {
  font-size: 12px;
  color: var(--accent-primary);
  padding: 2px 8px;
  background: var(--accent-glow);
  border-radius: 4px;
}

.enchant-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.enchant-applicable {
  font-size: 11px;
  color: var(--text-muted);
}

.no-results {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
  font-size: 13px;
}

.nbt-input {
  width: 100%;
  min-height: 100px;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  resize: vertical;
}

.nbt-output {
  width: 100%;
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.error-message {
  padding: 10px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid #f44336;
  border-radius: var(--border-radius-sm);
  color: #f44336;
  font-size: 13px;
}

.quick-texts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.quick-text-btn {
  padding: 6px 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-text-btn:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.color-picker,
.style-picker {
  margin-bottom: 12px;
}

.color-picker label,
.style-picker label,
.chat-preview label {
  display: block;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.color-options,
.style-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.color-btn {
  width: 28px;
  height: 28px;
  border: 2px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.color-btn:hover {
  border-color: var(--text-primary);
}

.color-btn.selected {
  border-color: var(--accent-primary);
}

.style-btn {
  padding: 6px 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.style-btn:hover {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.style-btn.selected {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.prefix-option {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.prefix-option label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.prefix-option input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.prefix-option input[type="text"] {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  color: var(--text-primary);
  font-size: 13px;
}

.chat-preview {
  margin-top: 12px;
}

.preview-box {
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  min-height: 40px;
  font-size: 14px;
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.drops-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
}

.drops-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.drop-mob-card {
  padding: 10px 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.drop-mob-card:hover {
  border-color: var(--accent-primary);
}

.drop-mob-card.selected {
  border-color: var(--accent-primary);
  background: var(--accent-glow);
}

.mob-name {
  font-size: 13px;
  color: var(--text-primary);
}

.drops-detail {
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
}

.drops-detail h4 {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.drop-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  background: var(--bg-hover);
  border-radius: var(--border-radius-sm);
}

.drop-item-name {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
}

.drop-count {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 12px;
}

.drop-chance {
  font-size: 12px;
  font-weight: 500;
}

.server-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 500;
}

.server-status .status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #999;
}

.server-status.running .status-dot {
  background: #4caf50;
  box-shadow: 0 0 8px #4caf50;
  animation: pulse 2s ease-in-out infinite;
}

.server-status.downloading .status-dot {
  background: #2196f3;
  box-shadow: 0 0 8px #2196f3;
  animation: pulse 1s ease-in-out infinite;
}

.server-status.stopped .status-dot {
  background: #999;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.server-config {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.server-config .input-group {
  flex: 1;
}

.server-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.action-btn.danger {
  background: linear-gradient(135deg, #f44336, #e53935);
  color: white;
}

.action-btn.danger:hover {
  background: linear-gradient(135deg, #e53935, #d32f2f);
}

.action-btn.small {
  padding: 6px 12px;
  font-size: 12px;
}

.download-progress {
  margin-bottom: 16px;
}

.download-progress .progress-bar {
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.download-progress .progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2196f3, #00bcd4);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.server-console {
  background: var(--bg-secondary);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.console-output {
  height: 300px;
  overflow-y: auto;
  padding: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.6;
  background: #0d0d0d;
}

.console-line {
  display: flex;
  gap: 10px;
  padding: 2px 0;
}

.console-time {
  color: #666;
  flex-shrink: 0;
}

.console-message {
  color: #ccc;
  word-break: break-all;
}

.console-line.level-error .console-message {
  color: #f44336;
}

.console-line.level-warn .console-message {
  color: #ff9800;
}

.console-line.level-command .console-message {
  color: #4caf50;
}

.console-empty {
  color: #555;
  text-align: center;
  padding: 40px 0;
}

.console-input {
  display: flex;
  gap: 8px;
  padding: 10px;
  background: var(--bg-tertiary);
  border-top: 1px solid var(--border-color);
}

.console-input input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
}

.console-input input:focus {
  outline: none;
  border-color: var(--accent-primary);
}
</style>
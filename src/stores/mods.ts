import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useVersionsStore } from './versions'
import { useDownloadsStore } from './downloads'
import { useSettingsStore } from './settings'
import { i18n } from '../locales'

// Modrinth API 基址：开启国内镜像时走 MCIM，失败自动回退官方
const MODRINTH_API_OFFICIAL = 'https://api.modrinth.com/v2'
const MODRINTH_API_MIRROR = 'https://mod.mcimirror.top/modrinth/v2'

/**
 * 请求 Modrinth API（path 以 / 开头）。
 * 开启镜像时先请求镜像、失败再请求官方；未开启则只请求官方。
 */
async function fetchModrinthApi(path: string, init?: RequestInit): Promise<Response> {
  let useMirror = false
  try { useMirror = !!useSettingsStore().settings.modrinthMirror } catch {}
  const bases = useMirror ? [MODRINTH_API_MIRROR, MODRINTH_API_OFFICIAL] : [MODRINTH_API_OFFICIAL]
  let lastError: unknown = null
  for (const base of bases) {
    try {
      const res = await fetch(base + path, init)
      if (!res.ok) {
        lastError = new Error(`API request failed: ${res.status}`)
        continue
      }
      return res
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('API request failed')
}

export interface ModVersion {
  id: string
  name: string
  version_number: string
  game_versions: string[]
  loaders: string[]
  files: { url: string; filename: string; size: number; sha1?: string }[]
  changelog: string
  dependencies: { version_id?: string; project_id?: string; file_id?: number; relation_type: string }[]
}

export interface Mod {
  id: string
  name: string
  author: string
  description: string
  icon: string
  tags: string[]
  category: string
  versions: string[]
  downloads: number
  installed: boolean
  enabled: boolean
  enabledVersions: string[]
  fileSize?: string
  loaders: string[]
  projectId?: string
  fileId?: number
  filePath?: string
  fileName?: string
  subDir?: string
  targetGameVersion?: string
  projectType?: string
  license?: string
  slug?: string
  latestVersion?: string
  installedVersion?: string
  screenshots?: string[]
  modVersions?: ModVersion[]
}

const STORAGE_KEY = 'zncl-mods'
const STORAGE_VERSION = 9

export const useModsStore = defineStore('mods', () => {
  const mods = ref<Mod[]>([])
  const modpacks = ref<Mod[]>([])
  const shaders = ref<Mod[]>([])
  const resourcePacks = ref<Mod[]>([])
  
  const selectedCategory = ref('all')
  const selectedGameVersion = ref('all')
  const selectedLoader = ref<'all' | 'fabric' | 'forge' | 'neoforge' | 'quilt'>('all')
  const isLoading = ref(false)
  const installProgress = ref<Record<string, number>>({})
  const loadedMods = ref<string[]>([])
  const lastSyncTime = ref<Date | null>(null)
  const totalModCount = ref(0)
  const totalModpackCount = ref(0)
  const totalShaderCount = ref(0)
  const totalResourcePackCount = ref(0)
  const currentGameVersion = ref<string>('1.21.4')
  
  const downloadQueue = ref<{ modId: string; modName: string; progress: number; status: 'downloading' | 'completed' | 'failed' | 'cancelled'; version?: string; projectType?: string; targetGameVersion?: string; error?: string }[]>([])
  const currentDownloads = ref(0)
  const maxConcurrentDownloads = ref(5)
  // 正在执行中的下载（去重，防止同一项目被并发重复启动）
  const activeProcessing = new Set<string>()

  const notifications = ref<{ id: string; modId: string; modName: string; type: 'downloading' | 'completed' | 'failed' | 'info'; progress: number; message?: string; timestamp: number }[]>([])

  // 用户手动关闭过的通知（按 modId 记录），关闭后该下载的进度更新不再重新弹出
  const dismissedNotifications = new Set<string>()

  const categories = computed(() => [
    { id: 'all', name: i18n.global.t('rt.stMods.all') },
    { id: 'optimization', name: i18n.global.t('rt.stMods.catOptimization') },
    { id: 'adventure', name: i18n.global.t('rt.stMods.catAdventure') },
    { id: 'magic', name: i18n.global.t('rt.stMods.catMagic') },
    { id: 'technology', name: i18n.global.t('rt.stMods.catTechnology') },
    { id: 'decoration', name: i18n.global.t('rt.stMods.catDecoration') },
    { id: 'utility', name: i18n.global.t('rt.stMods.catUtility') },
    { id: 'library', name: i18n.global.t('rt.stMods.catLibrary') },
    { id: 'worldgen', name: i18n.global.t('rt.stMods.catWorldgen') },
    { id: 'mobs', name: i18n.global.t('rt.stMods.catMobs') },
    { id: 'food', name: i18n.global.t('rt.stMods.catFood') },
    { id: 'combat', name: i18n.global.t('rt.stMods.catCombat') },
    { id: 'storage', name: i18n.global.t('rt.stMods.catStorage') },
    { id: 'redstone', name: i18n.global.t('rt.stMods.catRedstone') },
    { id: 'cosmetic', name: i18n.global.t('rt.stMods.catCosmetic') },
    { id: 'minimap', name: i18n.global.t('rt.stMods.catMinimap') },
    { id: 'inventory', name: i18n.global.t('rt.stMods.catInventory') },
    { id: 'performance', name: i18n.global.t('rt.stMods.catPerformance') },
    { id: 'shader', name: i18n.global.t('rt.stMods.catShader') }
  ])

  const gameVersions = [
    '1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.20',
    '1.19.4', '1.19.2', '1.19', '1.18.2', '1.18', '1.17.1', '1.17', '1.16.5',
    '1.16', '1.15.2', '1.15', '1.14.4', '1.14', '1.13.2', '1.13', '1.12.2',
    '1.12', '1.11.2', '1.11', '1.10.2', '1.10', '1.9.4', '1.9', '1.8.9', '1.8', '1.7.10'
  ]

  const loaders = computed(() => [
    { id: 'all', name: i18n.global.t('rt.stMods.all') },
    { id: 'fabric', name: 'Fabric' },
    { id: 'forge', name: 'Forge' },
    { id: 'neoforge', name: 'NeoForge' },
    { id: 'quilt', name: 'Quilt' }
  ])

  const getCategoryFromTags = (tags: string[]): string => {
    const tagMap: Record<string, string> = {
      'optimization': 'optimization',
      'performance': 'performance',
      'shaders': 'shader',
      'api': 'library',
      'core': 'library',
      'adventure': 'adventure',
      'magic': 'magic',
      'technology': 'technology',
      'tech': 'technology',
      'machines': 'technology',
      'storage': 'storage',
      'utility': 'utility',
      'worldgen': 'worldgen',
      'biomes': 'worldgen',
      'mobs': 'mobs',
      'food': 'food',
      'combat': 'combat',
      'redstone': 'redstone',
      'cosmetic': 'cosmetic',
      'decoration': 'decoration',
      'minimap': 'minimap',
      'inventory': 'inventory',
      'rendering': 'performance'
    }
    
    for (const tag of tags) {
      if (tagMap[tag.toLowerCase()]) {
        return tagMap[tag.toLowerCase()]
      }
    }
    return 'technology'
  }

  const categoryIcons: Record<string, string> = {
    optimization: '⚡',
    performance: '🚀',
    shader: '🌈',
    library: '📚',
    adventure: '🗺️',
    magic: '✨',
    technology: '⚙️',
    decoration: '🎨',
    utility: '🔧',
    worldgen: '🌍',
    mobs: '🐉',
    food: '🍎',
    combat: '⚔️',
    storage: '📦',
    redstone: '🔴',
    cosmetic: '👗',
    minimap: '🗺️',
    inventory: '🎒'
  }

  const categoryColors: Record<string, string> = {
    optimization: '4CAF50',
    performance: '00BCD4',
    shader: '9C27B0',
    library: '607D8B',
    adventure: 'FF9800',
    magic: 'E91E63',
    technology: '2196F3',
    decoration: 'FFC107',
    utility: '8BC34A',
    worldgen: '4CAF50',
    mobs: 'F44336',
    food: 'FF5722',
    combat: 'F44336',
    storage: 'FFC107',
    redstone: 'E53935',
    cosmetic: 'FF80AB',
    minimap: '00ACC1',
    inventory: 'FFB300'
  }

  const getGeneratedSvg = (modName: string, category?: string): string => {
    const catColor = category ? (categoryColors[category] || '2196F3') : '2196F3'
    const icon = category ? (categoryIcons[category] || '📦') : '📦'
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#' + catColor + ';stop-opacity:1"/><stop offset="100%" style="stop-color:#' + catColor + ';stop-opacity:0.7"/></linearGradient></defs><rect fill="url(#g)" width="60" height="60" rx="8"/><text x="30" y="40" font-family="Arial,sans-serif" font-size="28" text-anchor="middle">' + icon + '</text></svg>'
    return 'data:image/svg+xml,' + encodeURIComponent(svgContent)
  }

  const tryFetchModIconFromAlternativeSources = async (modName: string, category: string): Promise<string | null> => {
    const searchSources = [
      { name: 'mcbbs', url: `https://www.mcbbs.net/search.php?mod=forum&searchsubmit=yes&kw=${encodeURIComponent(modName)}` },
      { name: 'klpbbs', url: `https://www.klpbbs.com/search.php?keyword=${encodeURIComponent(modName)}` },
      { name: 'minebbs', url: `https://www.minebbs.com/search/?q=${encodeURIComponent(modName)}` },
      { name: i18n.global.t('rt.stMods.mcmodWiki'), url: `https://search.mcmod.cn/s?key=${encodeURIComponent(modName)}` },
      { name: 'minecraft_wiki', url: `https://minecraft.fandom.com/zh/wiki/Special:搜索?query=${encodeURIComponent(modName)}` }
    ]
    
    const fallbackIcons: Record<string, string[]> = {
      optimization: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/fastapi/fastapi-original.svg', '⚡'],
      technology: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/electron/electron-original.svg', '⚙️'],
      magic: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/crystal/crystal-original.svg', '✨'],
      adventure: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/googlemaps/googlemaps-original.svg', '🗺️'],
      shader: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/opengl/opengl-original.svg', '🌈'],
      library: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/npm/npm-original-wordmark.svg', '📚'],
      utility: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/windows8/windows8-original.svg', '🔧'],
      storage: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dropbox/dropbox-original.svg', '📦'],
      mobs: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dinosaur/dinosaur-original.svg', '🐉'],
      worldgen: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/earth/earth-original.svg', '🌍'],
      combat: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/redhat/redhat-original.svg', '⚔️'],
      food: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/apple/apple-original.svg', '🍎'],
      decoration: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/figma/figma-original.svg', '🎨'],
      minimap: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/googlemaps/googlemaps-original.svg', '🗺️'],
      inventory: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/backpack/backpack-original.svg', '🎒'],
      redstone: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/raspberrypi/raspberrypi-original.svg', '🔴'],
      cosmetic: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dribbble/dribbble-original.svg', '👗'],
      performance: ['https://cdn.jsdelivr.net/gh/devicons/devicon/icons/speedtest/speedtest-original.svg', '🚀']
    }
    
    try {
      const catFallbacks = fallbackIcons[category] || fallbackIcons.utility
      for (const fb of catFallbacks) {
        if (fb.startsWith('http')) {
          try {
            const resp = await fetch(fb, { method: 'HEAD' })
            if (resp.ok) {
              return fb
            }
          } catch {}
        }
      }
    } catch {}
    
    return null
  }

  const fetchFromModrinth = async (projectType: string, page = 0, pageSize = 50, loaderType?: string, searchQuery?: string, gameVersion?: string): Promise<{ mods: Mod[]; total: number; hasMore: boolean }> => {
    try {
      const offset = page * pageSize
      const facetsArray: string[][] = [["project_type:" + projectType]]
      if (loaderType) {
        facetsArray.push(["categories:" + loaderType])
      }
      if (gameVersion) {
        facetsArray.push(["versions:" + gameVersion])
      }
      const facets = encodeURIComponent(JSON.stringify(facetsArray))
      
      const response = await fetchModrinthApi(
        `/search?query=${encodeURIComponent(searchQuery || '')}&limit=${pageSize}&offset=${offset}&index=downloads&facets=${facets}`,
        { headers: { 'User-Agent': 'ZNCL-Launcher/1.0.0' } }
      )
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`)
      }
      
      const data = await response.json()
      const hits = data.hits || []
      const total = data.total_hits || 0
      
      const LOADER_NAMES = ['fabric', 'forge', 'neoforge', 'quilt']

      const newMods: Mod[] = hits.map((hit: any) => {
        const versions = hit.game_versions || ['1.20.1', '1.20.4', '1.21.1']
        const categories = hit.categories || []
        const displayCategories = hit.display_categories || []
        const allCategories = [...new Set([...categories, ...displayCategories])]
        const modLoaders = [...new Set(allCategories.map((c: string) => c.toLowerCase()).filter((c: string) => LOADER_NAMES.includes(c)))]

        const modCategory = getCategoryFromTags(categories)
        const iconUrl = hit.icon_url ? hit.icon_url : getGeneratedSvg(hit.title || 'Mod', modCategory)
        const gallery = hit.gallery || []
        const screenshots = Array.isArray(gallery) && gallery.length > 0 && typeof gallery[0] === 'string' 
          ? gallery 
          : (gallery.map((s: any) => s.url) || [])
        
        return {
          id: hit.project_id || `mod-${hit.slug || Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: hit.title || 'Unknown Mod',
          author: hit.author || 'Unknown',
          description: hit.description || '',
          icon: iconUrl,
          tags: categories,
          category: getCategoryFromTags(categories),
          versions: versions.slice(0, 20),
          downloads: hit.downloads || 0,
          installed: false,
          enabled: false,
          enabledVersions: [],
          fileSize: `${(Math.random() * 50 + 1).toFixed(1)} MB`,
          loaders: modLoaders.length > 0 ? modLoaders : (loaderType ? [loaderType] : ['forge']),
          projectId: hit.project_id,
          fileId: 0,
          projectType: hit.project_type || projectType,
          license: hit.license || 'mit',
          slug: hit.slug,
          latestVersion: hit.latest_version || '',
          screenshots: screenshots
        }
      })
      
      return { mods: newMods, total, hasMore: hits.length === pageSize }
    } catch (error) {
      console.error(`[Mods] Failed to fetch ${projectType}:`, error)
      return { mods: [], total: 0, hasMore: false }
    }
  }

  const modPageCache = ref<Record<number, Mod[]>>({})
  const modpackPageCache = ref<Record<number, Mod[]>>({})
  const shaderPageCache = ref<Record<number, Mod[]>>({})
  const resourcePackPageCache = ref<Record<number, Mod[]>>({})
  const MAX_CACHE_SIZE = 10

  const fetchMods = async (page = 0, pageSize = 100, loaderType?: string, gameVersion?: string): Promise<boolean> => {
    if (!loaderType && !gameVersion && modPageCache.value[page]) {
      mods.value = mergeModsByProjectId([...mods.value, ...modPageCache.value[page]])
      return true
    }
    
    const hasFilter = !!(loaderType || gameVersion)
    const result = await fetchFromModrinth('mod', page, pageSize, loaderType, undefined, gameVersion)
    
    if (hasFilter) {
      mods.value = result.mods
    } else {
      mods.value = mergeModsByProjectId([...mods.value, ...result.mods])
    }
    
    if (!hasFilter) {
      modPageCache.value[page] = result.mods
      
      const cachedPages = Object.keys(modPageCache.value).map(Number).sort((a, b) => b - a)
      if (cachedPages.length > MAX_CACHE_SIZE) {
        const pagesToRemove = cachedPages.slice(MAX_CACHE_SIZE)
        pagesToRemove.forEach(p => delete modPageCache.value[p])
      }
      
      const apiTotal = result.total || 0
      totalModCount.value = apiTotal > totalModCount.value ? apiTotal : totalModCount.value
      if (totalModCount.value === 0) {
        totalModCount.value = 67000
      }
    } else {
      totalModCount.value = result.total || 0
    }
    lastSyncTime.value = new Date()
    
    return result.hasMore
  }

  const fetchModpacks = async (page = 0, pageSize = 100, gameVersion?: string): Promise<boolean> => {
    const hasFilter = !!gameVersion
    if (!hasFilter && modpackPageCache.value[page]) {
      modpacks.value = mergeModsByProjectId([...modpacks.value, ...modpackPageCache.value[page]])
      return true
    }
    
    const result = await fetchFromModrinth('modpack', page, pageSize, undefined, undefined, gameVersion)
    
    if (hasFilter) {
      modpacks.value = result.mods
    } else {
      modpacks.value = mergeModsByProjectId([...modpacks.value, ...result.mods])
    }
    
    if (!hasFilter) {
      modpackPageCache.value[page] = result.mods
      
      const cachedPages = Object.keys(modpackPageCache.value).map(Number).sort((a, b) => b - a)
      if (cachedPages.length > MAX_CACHE_SIZE) {
        const pagesToRemove = cachedPages.slice(MAX_CACHE_SIZE)
        pagesToRemove.forEach(p => delete modpackPageCache.value[p])
      }
    }
    
    const apiTotal = result.total || 0
    if (hasFilter) {
      totalModpackCount.value = apiTotal
    } else {
      totalModpackCount.value = apiTotal > totalModpackCount.value ? apiTotal : totalModpackCount.value
      if (totalModpackCount.value === 0) {
        totalModpackCount.value = 8000
      }
    }
    
    return result.hasMore
  }

  const fetchShaders = async (page = 0, pageSize = 100, gameVersion?: string): Promise<boolean> => {
    const hasFilter = !!gameVersion
    if (!hasFilter && shaderPageCache.value[page]) {
      shaders.value = mergeModsByProjectId([...shaders.value, ...shaderPageCache.value[page]])
      return true
    }
    
    const result = await fetchFromModrinth('shader', page, pageSize, undefined, undefined, gameVersion)
    
    if (hasFilter) {
      shaders.value = result.mods
    } else {
      shaders.value = mergeModsByProjectId([...shaders.value, ...result.mods])
    }
    
    if (!hasFilter) {
      shaderPageCache.value[page] = result.mods
      
      const cachedPages = Object.keys(shaderPageCache.value).map(Number).sort((a, b) => b - a)
      if (cachedPages.length > MAX_CACHE_SIZE) {
        const pagesToRemove = cachedPages.slice(MAX_CACHE_SIZE)
        pagesToRemove.forEach(p => delete shaderPageCache.value[p])
      }
    }
    
    const apiTotal = result.total || 0
    if (hasFilter) {
      totalShaderCount.value = apiTotal
    } else {
      totalShaderCount.value = apiTotal > totalShaderCount.value ? apiTotal : totalShaderCount.value
      if (totalShaderCount.value === 0) {
        totalShaderCount.value = 2000
      }
    }
    
    return result.hasMore
  }

  const fetchResourcePacks = async (page = 0, pageSize = 100, gameVersion?: string): Promise<boolean> => {
    const hasFilter = !!gameVersion
    if (!hasFilter && resourcePackPageCache.value[page]) {
      resourcePacks.value = mergeModsByProjectId([...resourcePacks.value, ...resourcePackPageCache.value[page]])
      return true
    }
    
    const result = await fetchFromModrinth('resourcepack', page, pageSize, undefined, undefined, gameVersion)
    
    if (hasFilter) {
      resourcePacks.value = result.mods
    } else {
      resourcePacks.value = mergeModsByProjectId([...resourcePacks.value, ...result.mods])
    }
    
    if (!hasFilter) {
      resourcePackPageCache.value[page] = result.mods
      
      const cachedPages = Object.keys(resourcePackPageCache.value).map(Number).sort((a, b) => b - a)
      if (cachedPages.length > MAX_CACHE_SIZE) {
        const pagesToRemove = cachedPages.slice(MAX_CACHE_SIZE)
        pagesToRemove.forEach(p => delete resourcePackPageCache.value[p])
      }
    }
    
    const apiTotal = result.total || 0
    if (hasFilter) {
      totalResourcePackCount.value = apiTotal
    } else {
      totalResourcePackCount.value = apiTotal > totalResourcePackCount.value ? apiTotal : totalResourcePackCount.value
      if (totalResourcePackCount.value === 0) {
        totalResourcePackCount.value = 5000
      }
    }
    
    return result.hasMore
  }

  const fetchModDetails = async (projectId: string): Promise<Mod | null> => {
    try {
      const response = await fetchModrinthApi(`/project/${projectId}`, {
        headers: { 'User-Agent': 'ZNCL-Launcher/1.0.0' }
      })
      if (!response.ok) throw new Error('Failed to fetch mod details')
      
      const data = await response.json()
      
      let mod = mods.value.find(m => m.id === projectId)
      if (!mod) mod = modpacks.value.find(m => m.id === projectId)
      if (!mod) mod = shaders.value.find(m => m.id === projectId)
      if (!mod) mod = resourcePacks.value.find(m => m.id === projectId)
      
      if (mod) {
        mod.description = data.description || mod.description
        mod.license = data.license || mod.license
        mod.projectType = data.project_type || mod.projectType
        if (data.loaders && Array.isArray(data.loaders) && data.loaders.length > 0) {
          mod.loaders = data.loaders
        }
        const gallery = data.gallery || []
        mod.screenshots = Array.isArray(gallery) && gallery.length > 0 && typeof gallery[0] === 'string' 
          ? gallery 
          : (gallery.map((s: any) => s.url) || [])
      }
      
      return mod || null
    } catch (error) {
      console.error('[Mods] Failed to fetch mod details:', error)
      return null
    }
  }

  const fetchModVersions = async (projectId: string): Promise<ModVersion[] | null> => {
    try {
      const response = await fetchModrinthApi(`/project/${projectId}/version`, {
        headers: { 'User-Agent': 'ZNCL-Launcher/1.0.0' }
      })
      if (!response.ok) throw new Error('Failed to fetch mod versions')
      
      const data = await response.json()
      return data.map((v: any) => ({
        id: v.id,
        name: v.name,
        version_number: v.version_number,
        game_versions: v.game_versions || [],
        loaders: v.loaders || [],
        files: v.files?.map((f: any) => ({
          url: f.url,
          filename: f.filename,
          size: f.size,
          sha1: f.hashes?.sha1
        })) || [],
        changelog: v.changelog || '',
        dependencies: v.dependencies || []
      }))
    } catch (error) {
      console.error('[Mods] Failed to fetch mod versions:', error)
      return null
    }
  }

  const generateBackupMods = (count: number, projectType: string): Mod[] => {
    const modList: Mod[] = []
    
    const templates: { name: string; author: string; category: string; tags: string[]; desc: string; loader?: string }[] = 
      projectType === 'mod' ? [
        { name: 'OptiFine', author: 'sp614x', category: 'optimization', tags: ['optimization', 'shaders', 'performance'], desc: 'HD optimization and shader support', loader: 'forge' },
        { name: 'Sodium', author: 'jellysquid3', category: 'optimization', tags: ['optimization', 'rendering', 'performance'], desc: 'Modern rendering engine for Fabric', loader: 'fabric' },
        { name: 'Iris', author: 'coderbot', category: 'shader', tags: ['shaders', 'rendering', 'graphics'], desc: 'Fabric shader loader with OptiFine compatibility', loader: 'fabric' },
        { name: 'Fabric API', author: 'modmuss50', category: 'library', tags: ['api', 'core', 'fabric'], desc: 'Core API for Fabric mods', loader: 'fabric' },
        { name: 'Forge', author: 'LexManos', category: 'library', tags: ['api', 'core', 'modloader'], desc: 'Forge mod loader and framework', loader: 'forge' },
        { name: 'NeoForge', author: 'NeoForged', category: 'library', tags: ['api', 'core', 'modloader'], desc: 'NeoForge mod loader', loader: 'neoforge' },
        { name: 'JourneyMap', author: 'techbrew', category: 'minimap', tags: ['minimap', 'navigation', 'map'], desc: 'Realtime minimap and fullscreen map', loader: 'forge' },
        { name: 'JEI', author: 'mezz', category: 'utility', tags: ['items', 'recipes', 'utility'], desc: 'Just Enough Items - Item and recipe viewing', loader: 'forge' },
        { name: 'AppleSkin', author: 'squeek502', category: 'food', tags: ['food', 'hunger', 'utility'], desc: 'Food saturation and exhaustion display', loader: 'fabric' },
        { name: 'Iron Chests', author: 'progwml6', category: 'storage', tags: ['storage', 'chests', 'utility'], desc: 'More chest variants with better storage', loader: 'forge' },
        { name: 'Mekanism', author: 'aidancbrady', category: 'technology', tags: ['tech', 'machines', 'ores'], desc: 'High tech mod with advanced machinery', loader: 'forge' },
        { name: 'Create', author: 'simibubi', category: 'technology', tags: ['tech', 'mechanical', 'decoration'], desc: 'Mechanical power and contraptions', loader: 'forge' },
        { name: 'Botania', author: 'Vazkii', category: 'magic', tags: ['magic', 'plants', 'nature'], desc: 'Botanical magic with flowers and mana', loader: 'forge' },
        { name: 'Twilight Forest', author: 'Benimatic', category: 'adventure', tags: ['adventure', 'dimension', 'boss'], desc: 'Twilight dimension with new biomes and bosses', loader: 'forge' },
        { name: 'Ice and Fire', author: 'alex1the1666', category: 'mobs', tags: ['mobs', 'dragons', 'mythical'], desc: 'Dragons and mythical creatures', loader: 'forge' },
        { name: 'Biomes O Plenty', author: 'Forstride', category: 'worldgen', tags: ['worldgen', 'biomes', 'nature'], desc: 'More biomes for Minecraft', loader: 'forge' },
        { name: 'Tinkers Construct', author: 'mDiyo', category: 'technology', tags: ['tools', 'crafting', 'custom'], desc: 'Custom tool and weapon system', loader: 'forge' },
        { name: 'Lithium', author: 'jellysquid3', category: 'performance', tags: ['optimization', 'performance', 'logic'], desc: 'Game logic optimization', loader: 'fabric' },
        { name: 'Starlight', author: 'Spottedleaf', category: 'performance', tags: ['optimization', 'lighting', 'rewrite'], desc: 'Lighting engine rewrite', loader: 'fabric' },
        { name: 'Complementary Shaders', author: 'EminGT', category: 'shader', tags: ['shaders', 'graphics', 'visual'], desc: 'High quality shader pack', loader: 'fabric' },
        { name: 'Inventory Profiles', author: 'blackd', category: 'inventory', tags: ['inventory', 'sorting', 'utility'], desc: 'Inventory sorting and management', loader: 'fabric' },
        { name: 'Waystones', author: 'BlayTheNinth', category: 'utility', tags: ['teleport', 'navigation', 'utility'], desc: 'Teleport waystones', loader: 'forge' },
        { name: 'Jade', author: 'Snownee', category: 'utility', tags: ['info', 'tooltip', 'utility'], desc: 'Block and entity info display', loader: 'fabric' },
        { name: 'Mouse Tweaks', author: 'YaLTeR', category: 'inventory', tags: ['inventory', 'mouse', 'utility'], desc: 'Mouse improvements for inventory', loader: 'fabric' },
        { name: 'BetterF3', author: 'cominixo', category: 'utility', tags: ['display', 'F3', 'debug'], desc: 'F3 screen improvements', loader: 'fabric' },
        { name: 'Quark', author: 'Vazkii', category: 'utility', tags: ['improvements', 'content', 'utility'], desc: 'Game content expansion', loader: 'forge' },
        { name: 'Applied Energistics 2', author: 'AlgorithmX2', category: 'technology', tags: ['storage', 'tech', 'network'], desc: 'Digital storage system', loader: 'forge' },
        { name: 'Draconic Evolution', author: 'brandon3055', category: 'technology', tags: ['tech', 'evolution', 'ultimate'], desc: 'Ultimate tech gear', loader: 'forge' },
        { name: 'ProjectE', author: 'sinkillerj', category: 'magic', tags: ['magic', 'equivalent', 'exchange'], desc: 'Equivalent exchange remake', loader: 'forge' },
        { name: 'Pixelmon', author: 'PixelmonTeam', category: 'mobs', tags: ['pokemon', 'creatures', 'theme'], desc: 'Pokemon mod for Minecraft', loader: 'forge' },
        { name: 'Curios API', author: 'TheIllusiveC4', category: 'library', tags: ['api', 'slots', 'equipment'], desc: 'Additional equipment slots API', loader: 'forge' },
        { name: 'Ender IO', author: 'CrazyPants', category: 'technology', tags: ['tech', 'machines', 'power'], desc: 'Industrial technology mod', loader: 'forge' },
        { name: 'Immersive Engineering', author: 'BluSunrize', category: 'technology', tags: ['tech', 'engineering', 'industrial'], desc: 'Immersive industrial technology', loader: 'forge' },
        { name: 'Thaumcraft', author: 'Azanor', category: 'magic', tags: ['magic', 'thaumaturgy', 'research'], desc: 'Thaumaturgical magic mod', loader: 'forge' },
        { name: 'Blood Magic', author: 'WayofTime', category: 'magic', tags: ['magic', 'blood', 'rituals'], desc: 'Blood magic and rituals', loader: 'forge' },
        { name: 'OpenBlocks', author: 'OpenMods', category: 'utility', tags: ['utility', 'blocks', 'items'], desc: 'Useful blocks and items', loader: 'forge' },
        { name: 'OpenComputers', author: 'Sangar', category: 'technology', tags: ['tech', 'computers', 'programming'], desc: 'In-game computers and robots', loader: 'forge' },
        { name: 'Extra Utilities', author: 'RWTema', category: 'utility', tags: ['utility', 'items', 'blocks'], desc: 'Extra utilities and gadgets', loader: 'forge' },
        { name: 'Refined Storage', author: 'raoulvdberge', category: 'technology', tags: ['storage', 'tech', 'network'], desc: 'Simple storage network', loader: 'forge' },
        { name: 'PneumaticCraft', author: 'desht', category: 'technology', tags: ['tech', 'pneumatic', 'machines'], desc: 'Pneumatic technology mod', loader: 'forge' },
        { name: 'Forestry', author: 'SirSengir', category: 'technology', tags: ['tech', 'farming', 'bees'], desc: 'Forestry and agriculture mod', loader: 'forge' },
        { name: 'IndustrialCraft 2', author: 'Player', category: 'technology', tags: ['tech', 'industry', 'power'], desc: 'Industrial technology classic', loader: 'forge' },
        { name: 'Thermal Expansion', author: 'KingLemming', category: 'technology', tags: ['tech', 'machines', 'power'], desc: 'Thermal technology expansion', loader: 'forge' },
        { name: 'Thermal Foundation', author: 'KingLemming', category: 'library', tags: ['api', 'core', 'thermal'], desc: 'Thermal foundation library', loader: 'forge' },
        { name: 'CoFH Core', author: 'TeamCoFH', category: 'library', tags: ['api', 'core', 'cofh'], desc: 'CoFH core library', loader: 'forge' },
        { name: 'Mystical Agriculture', author: 'BlakeBr0', category: 'technology', tags: ['farming', 'tech', 'ores'], desc: 'Grow ores and resources', loader: 'forge' },
        { name: 'Silent Gear', author: 'SilentChaos512', category: 'technology', tags: ['tools', 'crafting', 'gear'], desc: 'Custom tool and gear system', loader: 'forge' },
        { name: 'Silent Lib', author: 'SilentChaos512', category: 'library', tags: ['api', 'library', 'silent'], desc: 'Silent Chaos library', loader: 'forge' },
        { name: 'Patchouli', author: 'Vazkii', category: 'library', tags: ['api', 'documentation', 'guide'], desc: 'In-game documentation book', loader: 'forge' },
        { name: 'Just Enough Items', author: 'mezz', category: 'utility', tags: ['items', 'recipes', 'jei'], desc: 'Just Enough Items', loader: 'forge' },
        { name: 'Roughly Enough Items', author: 'shedaniel', category: 'utility', tags: ['items', 'recipes', 'rei'], desc: 'Roughly Enough Items for Fabric', loader: 'fabric' },
        { name: 'Emotecraft', author: 'KosmX', category: 'cosmetic', tags: ['emotes', 'animation', 'cosmetic'], desc: 'Emotes and animations', loader: 'fabric' },
        { name: 'Simple Voice Chat', author: 'henkelmax', category: 'utility', tags: ['voice', 'chat', 'audio'], desc: 'Proximity voice chat', loader: 'fabric' },
        { name: 'Xaero\'s Minimap', author: 'xaero96', category: 'minimap', tags: ['minimap', 'navigation', 'map'], desc: 'Xaero\'s minimap mod', loader: 'forge' },
        { name: 'Xaero\'s World Map', author: 'xaero96', category: 'minimap', tags: ['map', 'worldmap', 'navigation'], desc: 'Xaero\'s world map mod', loader: 'forge' },
        { name: 'VoxelMap', author: 'MamiyaOtaru', category: 'minimap', tags: ['minimap', 'navigation', 'map'], desc: 'Voxel minimap mod', loader: 'fabric' },
        { name: 'Better PvP', author: 'Zyin', category: 'combat', tags: ['pvp', 'combat', 'hud'], desc: 'PvP improvements and HUD', loader: 'forge' },
        { name: 'Giselbaer\'s Durability Viewer', author: 'giselbaer', category: 'utility', tags: ['durability', 'hud', 'display'], desc: 'Item durability display', loader: 'fabric' },
        { name: 'Light Overlay', author: 'shedaniel', category: 'utility', tags: ['lighting', 'display', 'utility'], desc: 'Chunk border and light overlay', loader: 'fabric' },
        { name: 'Architectury', author: 'shedaniel', category: 'library', tags: ['api', 'core', 'architectury'], desc: 'Cross-platform modding API', loader: 'fabric' },
        { name: 'Cloth Config', author: 'shedaniel', category: 'library', tags: ['api', 'config', 'library'], desc: 'Configuration library', loader: 'fabric' },
        { name: 'AutoConfig', author: 'sargunv', category: 'library', tags: ['api', 'config', 'library'], desc: 'Automatic config library', loader: 'fabric' },
        { name: 'Fabric Language Kotlin', author: 'modmuss50', category: 'library', tags: ['api', 'kotlin', 'language'], desc: 'Kotlin language support', loader: 'fabric' },
        { name: 'TerraBlender', author: 'Adubbz', category: 'library', tags: ['api', 'worldgen', 'library'], desc: 'World generation library', loader: 'fabric' },
        { name: 'Balm', author: 'BlayTheNinth', category: 'library', tags: ['api', 'core', 'balm'], desc: 'Abstraction layer mod', loader: 'forge' },
        { name: 'Bookshelf', author: 'Darkhax', category: 'library', tags: ['api', 'core', 'bookshelf'], desc: 'Core library mod', loader: 'forge' },
        { name: 'Game Stages', author: 'Darkhax', category: 'utility', tags: ['stages', 'progression', 'utility'], desc: 'Game progression staging', loader: 'forge' },
        { name: 'Item Stages', author: 'Darkhax', category: 'utility', tags: ['stages', 'items', 'progression'], desc: 'Item progression staging', loader: 'forge' },
        { name: 'Dimension Stages', author: 'Darkhax', category: 'utility', tags: ['stages', 'dimension', 'progression'], desc: 'Dimension progression staging', loader: 'forge' },
        { name: 'Minecraft Transit Railway', author: 'jonafanho', category: 'technology', tags: ['transport', 'trains', 'tech'], desc: 'Trains and transit system', loader: 'fabric' },
        { name: 'Create: Steam \'n Rails', author: 'mattidragon', category: 'technology', tags: ['create', 'trains', 'addon'], desc: 'Create addon trains', loader: 'forge' },
        { name: 'Railcraft', author: 'CovertJaguar', category: 'technology', tags: ['rails', 'trains', 'tech'], desc: 'Railway technology mod', loader: 'forge' },
        { name: 'Sophisticated Backpacks', author: 'P3pp3rF1y', category: 'storage', tags: ['backpack', 'storage', 'inventory'], desc: 'Advanced backpack mod', loader: 'forge' },
        { name: 'Sophisticated Core', author: 'P3pp3rF1y', category: 'library', tags: ['api', 'core', 'sophisticated'], desc: 'Sophisticated core library', loader: 'forge' },
        { name: 'Iron Backpacks', author: 'gr8pefish', category: 'storage', tags: ['backpack', 'storage', 'inventory'], desc: 'Iron tiered backpacks', loader: 'forge' },
        { name: 'Traveler\'s Backpack', author: 'Tiviacz1337', category: 'storage', tags: ['backpack', 'adventure', 'storage'], desc: 'Adventure backpack', loader: 'forge' },
        { name: 'Alex\'s Mobs', author: 'sbom_xela', category: 'mobs', tags: ['mobs', 'animals', 'creatures'], desc: 'Realistic animal mobs', loader: 'forge' },
        { name: 'Mowzie\'s Mobs', author: 'BobMowzie', category: 'mobs', tags: ['mobs', 'bosses', 'creatures'], desc: 'Fantasy creatures and bosses', loader: 'forge' },
        { name: 'Mutant Beasts', author: 'TheIllusiveC4', category: 'mobs', tags: ['mobs', 'mutant', 'creatures'], desc: 'Mutant creature mobs', loader: 'forge' },
        { name: 'Chocolate Quest', author: 'Chocolate_Frog', category: 'adventure', tags: ['dungeons', 'adventure', 'loot'], desc: 'Dungeons and adventure mod', loader: 'forge' },
        { name: 'Dungeons Plus', author: 'jaredlll08', category: 'adventure', tags: ['dungeons', 'structures', 'adventure'], desc: 'More dungeons and structures', loader: 'forge' },
        { name: 'YUNG\'s Better Caves', author: 'YUNGNICKYOUNG', category: 'worldgen', tags: ['caves', 'worldgen', 'terrain'], desc: 'Better cave generation', loader: 'forge' },
        { name: 'YUNG\'s Better Mineshafts', author: 'YUNGNICKYOUNG', category: 'worldgen', tags: ['mineshafts', 'structures', 'worldgen'], desc: 'Better mineshaft generation', loader: 'forge' },
        { name: 'YUNG\'s Better Strongholds', author: 'YUNGNICKYOUNG', category: 'worldgen', tags: ['strongholds', 'structures', 'worldgen'], desc: 'Better stronghold generation', loader: 'forge' },
        { name: 'YUNG\'s API', author: 'YUNGNICKYOUNG', category: 'library', tags: ['api', 'core', 'yung'], desc: 'YUNG\'s core API', loader: 'forge' },
        { name: 'Repurposed Structures', author: 'telepathicgrunt', category: 'worldgen', tags: ['structures', 'worldgen', 'terrain'], desc: 'Repurposed vanilla structures', loader: 'forge' },
        { name: 'River Redux', author: 'telepathicgrunt', category: 'worldgen', tags: ['rivers', 'worldgen', 'terrain'], desc: 'Better river generation', loader: 'forge' },
        { name: 'Caves and Cliffs Backport', author: 'telepathicgrunt', category: 'worldgen', tags: ['caves', 'cliffs', 'backport'], desc: 'Caves and cliffs backport', loader: 'forge' },
        { name: 'Farmer\'s Delight', author: 'vectorwing', category: 'food', tags: ['farming', 'food', 'cooking'], desc: 'Farming and cooking expansion', loader: 'forge' },
        { name: 'Pam\'s HarvestCraft', author: 'MatrexsVigil', category: 'food', tags: ['farming', 'food', 'crops'], desc: 'More crops and food', loader: 'forge' },
        { name: 'Croptopia', author: 'thyraxe', category: 'food', tags: ['farming', 'food', 'crops'], desc: 'Crop and food expansion', loader: 'fabric' },
        { name: 'Origins', author: 'VriskaSerket51', category: 'adventure', tags: ['origins', 'abilities', 'rp'], desc: 'Origin abilities and classes', loader: 'fabric' },
        { name: 'Origins: Classes', author: 'GuardianOfAurora', category: 'adventure', tags: ['origins', 'classes', 'abilities'], desc: 'Classes for Origins', loader: 'fabric' },
        { name: 'Pehkui', author: 'Virtuoel', category: 'utility', tags: ['resize', 'scaling', 'utility'], desc: 'Entity resizing mod', loader: 'fabric' },
        { name: 'Bobby', author: 'johni0702', category: 'performance', tags: ['rendering', 'caching', 'performance'], desc: 'Render distance caching', loader: 'fabric' },
        { name: 'FerriteCore', author: 'malte0811', category: 'performance', tags: ['memory', 'optimization', 'performance'], desc: 'Memory usage optimization', loader: 'fabric' },
        { name: 'LazyDFU', author: 'tuxed', category: 'performance', tags: ['datafixer', 'optimization', 'performance'], desc: 'Lazy DFU initialization', loader: 'fabric' },
        { name: 'DashLoader', author: 'alphaqu', category: 'performance', tags: ['loading', 'caching', 'performance'], desc: 'Resource loading cache', loader: 'fabric' },
        { name: 'C2ME', author: 'ishland', category: 'performance', tags: ['chunk', 'optimization', 'performance'], desc: 'Chunk generation optimization', loader: 'fabric' },
        { name: 'VMP', author: 'ishland', category: 'performance', tags: ['rendering', 'optimization', 'performance'], desc: 'Very many players optimization', loader: 'fabric' },
        { name: 'Concurrent Chunk Management Engine', author: 'ishland', category: 'performance', tags: ['chunk', 'concurrent', 'performance'], desc: 'Concurrent chunk engine', loader: 'fabric' },
        { name: 'Spark', author: 'Iucko', category: 'utility', tags: ['profiler', 'performance', 'debug'], desc: 'Performance profiler', loader: 'forge' },
        { name: 'Bluemap', author: 'BlueColored', category: 'utility', tags: ['map', 'web', '3d'], desc: '3D web-based world map', loader: 'forge' },
        { name: 'Dynmap', author: 'mikeprimm', category: 'utility', tags: ['map', 'web', 'realtime'], desc: 'Real-time web-based map', loader: 'forge' },
        { name: 'Squaremap', author: 'jpenilla', category: 'utility', tags: ['map', 'web', 'topdown'], desc: 'Top-down web-based map', loader: 'fabric' },
        { name: 'AntiXray', author: 'Dogboy21', category: 'utility', tags: ['anti-cheat', 'xray', 'server'], desc: 'Anti-Xray protection', loader: 'forge' },
        { name: 'GriefPrevention', author: 'RoboTricker', category: 'utility', tags: ['protection', 'claims', 'server'], desc: 'Land claim protection', loader: 'forge' },
        { name: 'LuckPerms', author: 'Luck', category: 'utility', tags: ['permissions', 'server', 'management'], desc: 'Permission management', loader: 'forge' },
        { name: 'EssentialsX', author: 'drtshock', category: 'utility', tags: ['commands', 'server', 'essentials'], desc: 'Essential commands', loader: 'forge' },
        { name: 'WorldEdit', author: 'sk89q', category: 'utility', tags: ['editing', 'world', 'tools'], desc: 'In-game world editing', loader: 'forge' },
        { name: 'FAWE', author: 'Empire92', category: 'utility', tags: ['editing', 'world', 'fast'], desc: 'Fast Async WorldEdit', loader: 'forge' },
        { name: 'CoreProtect', author: 'Intelli', category: 'utility', tags: ['logging', 'protection', 'server'], desc: 'Block logging and rollback', loader: 'forge' },
        { name: 'Vault', author: 'cereal', category: 'library', tags: ['api', 'economy', 'permissions'], desc: 'Economy and permission API', loader: 'forge' },
        { name: 'PlaceholderAPI', author: 'clip', category: 'library', tags: ['api', 'placeholder', 'text'], desc: 'Text placeholder API', loader: 'forge' },
        { name: 'ProtocolLib', author: 'dmulloy2', category: 'library', tags: ['api', 'protocol', 'networking'], desc: 'Packet manipulation API', loader: 'forge' },
      ] : projectType === 'modpack' ? [
        { name: 'All the Mods 9', author: 'ATM Team', category: 'technology', tags: ['tech', 'modpack', 'large'], desc: 'Massive tech modpack' },
        { name: 'Enigmatica 6', author: 'NillerMedDild', category: 'technology', tags: ['tech', 'magic', 'exploration'], desc: 'Tech and magic modpack' },
        { name: 'FTB Infinity Evolved', author: 'FTB Team', category: 'technology', tags: ['tech', 'classic', 'ftb'], desc: 'Classic FTB modpack' },
        { name: 'Sky Factory 4', author: 'FTB Team', category: 'technology', tags: ['skyblock', 'tech', 'ftb'], desc: 'Skyblock tech modpack' },
        { name: 'RLCraft', author: 'Shivaxi', category: 'adventure', tags: ['hardcore', 'survival', 'adventure'], desc: 'Hardcore survival modpack' },
        { name: 'Vault Hunters', author: 'Iskall85', category: 'adventure', tags: ['vault', 'rpg', 'loot'], desc: 'RPG vault crawling modpack' },
        { name: 'OceanBlock', author: 'FTB Team', category: 'worldgen', tags: ['ocean', 'skyblock', 'ftb'], desc: 'Ocean themed skyblock' },
        { name: 'Regrowth', author: 'FTB Team', category: 'adventure', tags: ['regrowth', 'challenge', 'ftb'], desc: 'Regrowth challenge modpack' },
        { name: 'SevTech Ages', author: 'Sevadus', category: 'adventure', tags: ['tech', 'progression', 'ages'], desc: 'Progression based tech modpack' },
        { name: 'GT New Horizons', author: 'GTNH Team', category: 'technology', tags: ['tech', 'gregtech', 'hardcore'], desc: 'GregTech focused modpack' },
        { name: 'All the Mods 8', author: 'ATM Team', category: 'technology', tags: ['tech', 'modpack', 'large'], desc: 'All the Mods 8 modpack' },
        { name: 'All the Mods 7', author: 'ATM Team', category: 'technology', tags: ['tech', 'modpack', 'large'], desc: 'All the Mods 7 modpack' },
        { name: 'FTB Stoneblock 3', author: 'FTB Team', category: 'technology', tags: ['stoneblock', 'tech', 'ftb'], desc: 'Stoneblock 3 modpack' },
        { name: 'FTB Revelation', author: 'FTB Team', category: 'technology', tags: ['tech', 'revelation', 'ftb'], desc: 'FTB Revelation modpack' },
        { name: 'FTB University', author: 'FTB Team', category: 'technology', tags: ['tech', 'learning', 'ftb'], desc: 'FTB University modpack' },
        { name: 'Direwolf20 1.20', author: 'Direwolf20', category: 'technology', tags: ['tech', 'dw20', 'classic'], desc: 'Direwolf20 modpack' },
        { name: 'Better MC', author: 'BMC Team', category: 'adventure', tags: ['better', 'improvement', 'survival'], desc: 'Better Minecraft modpack' },
        { name: 'Better MC [FABRIC]', author: 'BMC Team', category: 'adventure', tags: ['better', 'improvement', 'fabric'], desc: 'Better Minecraft Fabric' },
        { name: 'DawnCraft', author: 'DawnCraft Team', category: 'adventure', tags: ['rpg', 'adventure', 'quests'], desc: 'RPG adventure modpack' },
        { name: 'Medieval MC [FABRIC]', author: 'MMC Team', category: 'adventure', tags: ['medieval', 'fantasy', 'rpg'], desc: 'Medieval Minecraft modpack' },
        { name: 'Fabulously Optimized', author: 'robotkoer', category: 'optimization', tags: ['optimization', 'fabric', 'performance'], desc: 'Optimized Fabric modpack' },
        { name: 'Simply Optimized', author: 'hyperdefined', category: 'optimization', tags: ['optimization', 'fabric', 'simple'], desc: 'Simply optimized modpack' },
        { name: 'Vanilla+', author: 'Various', category: 'utility', tags: ['vanilla', 'improvement', 'simple'], desc: 'Vanilla Plus modpack' },
        { name: 'Create: Above and Beyond', author: 'simibubi', category: 'technology', tags: ['create', 'tech', 'quests'], desc: 'Create focused modpack' },
        { name: 'ATM6', author: 'ATM Team', category: 'technology', tags: ['tech', 'modpack', 'atm6'], desc: 'All the Mods 6 modpack' },
        { name: 'Sky Odyssey', author: 'Sky Team', category: 'adventure', tags: ['skyblock', 'adventure', 'quests'], desc: 'Sky adventure modpack' },
        { name: 'Age of Engineering', author: 'Age Team', category: 'technology', tags: ['tech', 'progression', 'ages'], desc: 'Engineering age modpack' },
        { name: 'Invasion', author: 'Invasion Team', category: 'adventure', tags: ['hardcore', 'survival', 'mobs'], desc: 'Mob invasion modpack' },
        { name: 'Scape and Run: Parasites', author: 'SRP Team', category: 'adventure', tags: ['horror', 'parasites', 'hardcore'], desc: 'Parasite horror modpack' }
      ] : projectType === 'shader' ? [
        { name: 'Complementary Reimagined', author: 'EminGT', category: 'shader', tags: ['shaders', 'realistic', 'graphics'], desc: 'High quality realistic shader' },
        { name: 'Sildur\'s Vibrant', author: 'Sildur', category: 'shader', tags: ['shaders', 'colorful', 'effects'], desc: 'Vibrant shader pack' },
        { name: 'BSL Shaders', author: 'BSL', category: 'shader', tags: ['shaders', 'balanced', 'effects'], desc: 'Balanced shader pack' },
        { name: 'SEUS PTGI', author: 'Sonic Ether', category: 'shader', tags: ['shaders', 'raytracing', 'realistic'], desc: 'Ray tracing shader' },
        { name: 'Chocapic13 Shaders', author: 'Chocapic13', category: 'shader', tags: ['shaders', 'realistic', 'cinematic'], desc: 'Cinematic shader pack' },
        { name: 'Continuum', author: 'Continuum Team', category: 'shader', tags: ['shaders', 'realistic', 'ultra'], desc: 'Ultra realistic shader' },
        { name: 'Kuda Shaders', author: 'Kuda', category: 'shader', tags: ['shaders', 'performance', 'effects'], desc: 'Performance shader pack' },
        { name: 'ProjectLUMA', author: 'ProjectLUMA Team', category: 'shader', tags: ['shaders', 'raytracing', 'modern'], desc: 'Modern ray tracing shader' },
        { name: 'Minecraft RTX', author: 'NVIDIA', category: 'shader', tags: ['shaders', 'raytracing', 'official'], desc: 'Official ray tracing shader' },
        { name: 'UMA Shaders', author: 'UMARock', category: 'shader', tags: ['shaders', 'ultra', 'realistic'], desc: 'Ultra realistic shader' },
        { name: 'SEUS Renewed', author: 'Sonic Ether', category: 'shader', tags: ['shaders', 'renewed', 'effects'], desc: 'SEUS Renewed shader' },
        { name: 'SEUS HRR', author: 'Sonic Ether', category: 'shader', tags: ['shaders', 'hrr', 'realistic'], desc: 'High Reflection Refraction' },
        { name: 'Sildur\'s Extreme', author: 'Sildur', category: 'shader', tags: ['shaders', 'extreme', 'effects'], desc: 'Extreme shader pack' },
        { name: 'Sildur\'s Basic', author: 'Sildur', category: 'shader', tags: ['shaders', 'basic', 'performance'], desc: 'Basic shader pack' },
        { name: 'Super Duper Vanilla', author: 'Eldeston', category: 'shader', tags: ['shaders', 'vanilla', 'style'], desc: 'Super Duper Vanilla style' },
        { name: 'Voyager Shader', author: 'Voyager', category: 'shader', tags: ['shaders', 'exploration', 'visual'], desc: 'Voyager shader pack' },
        { name: 'Rethinking Voxels', author: 'Rethinking', category: 'shader', tags: ['shaders', 'voxels', 'raytracing'], desc: 'Voxel ray tracing shader' },
        { name: 'Studio Plus', author: 'Studio', category: 'shader', tags: ['shaders', 'cinematic', 'studio'], desc: 'Studio cinematic shader' },
        { name: 'Insanity Shader', author: 'Insanity', category: 'shader', tags: ['shaders', 'effects', 'extreme'], desc: 'Insane effects shader' },
        { name: 'Nostalgia Shader', author: 'Nostalgia', category: 'shader', tags: ['shaders', 'retro', 'style'], desc: 'Retro nostalgia shader' }
      ] : [
        { name: 'Faithful', author: 'Faithful Team', category: 'cosmetic', tags: ['texture', 'faithful', 'hd'], desc: 'HD texture pack' },
        { name: 'Sphax PureBDCraft', author: 'Sphax', category: 'cosmetic', tags: ['texture', 'cartoon', 'hd'], desc: 'Cartoon texture pack' },
        { name: 'Soartex Fanver', author: 'Soartex', category: 'cosmetic', tags: ['texture', 'smooth', 'realistic'], desc: 'Smooth texture pack' },
        { name: 'R3D.craft', author: 'R3D', category: 'cosmetic', tags: ['texture', 'realistic', '3d'], desc: 'Realistic 3D texture pack' },
        { name: 'Dokucraft', author: 'Doku', category: 'cosmetic', tags: ['texture', 'medieval', 'fantasy'], desc: 'Medieval fantasy texture pack' },
        { name: 'John Smith Legacy', author: 'John Smith', category: 'cosmetic', tags: ['texture', 'medieval', 'detailed'], desc: 'Detailed medieval texture pack' },
        { name: 'Oceano', author: 'Oceano Team', category: 'worldgen', tags: ['texture', 'ocean', 'realistic'], desc: 'Ocean themed texture pack' },
        { name: 'Vanilla BDcraft', author: 'Sphax', category: 'cosmetic', tags: ['texture', 'cartoon', 'vanilla'], desc: 'Cartoon vanilla texture pack' },
        { name: 'Jicklus', author: 'Jicklus', category: 'cosmetic', tags: ['texture', 'cute', 'pixel'], desc: 'Cute pixel art texture pack' },
        { name: 'Conquest Reforged', author: 'Conquest Team', category: 'cosmetic', tags: ['texture', 'medieval', 'conquest'], desc: 'Conquest reforged texture pack' },
        { name: 'BetterVanillaBuilding', author: 'BVB Team', category: 'cosmetic', tags: ['texture', 'building', 'better'], desc: 'Better building textures' },
        { name: 'Pixel Perfection', author: 'Pixel Team', category: 'cosmetic', tags: ['texture', 'pixel', 'detailed'], desc: 'Pixel perfect textures' },
        { name: 'Epic Adventures', author: 'Epic Team', category: 'adventure', tags: ['texture', 'adventure', 'fantasy'], desc: 'Epic adventure textures' },
        { name: 'Mizuno\'s 16 Craft', author: 'Mizuno', category: 'cosmetic', tags: ['texture', 'japanese', 'cute'], desc: 'Mizuno cute texture pack' },
        { name: 'Flows HD', author: 'Flows', category: 'cosmetic', tags: ['texture', 'hd', 'modern'], desc: 'Modern HD texture pack' },
        { name: 'Persistence', author: 'Persistence Team', category: 'cosmetic', tags: ['texture', 'realistic', 'detailed'], desc: 'Realistic persistence textures' },
        { name: 'Paper Cut-Out', author: 'Paper Team', category: 'cosmetic', tags: ['texture', 'paper', 'style'], desc: 'Paper cut-out style texture' },
        { name: 'Starminer', author: 'Starminer Team', category: 'cosmetic', tags: ['texture', 'space', 'stars'], desc: 'Space themed texture pack' },
        { name: 'Tyrighen\'s 3D', author: 'Tyrighen', category: 'cosmetic', tags: ['texture', '3d', 'detailed'], desc: '3D detailed texture pack' },
        { name: 'Chroma Hills', author: 'Chroma Team', category: 'cosmetic', tags: ['texture', 'rpg', 'fantasy'], desc: 'RPG fantasy texture pack' }
      ]
    
    for (let i = 0; i < count; i++) {
      const templateIndex = i % templates.length
      const template = templates[templateIndex]
      const uniqueId = i
      
      modList.push({
        id: `${projectType}-${uniqueId}-${Date.now()}`,
        name: i < templates.length ? template.name : `${template.name} ${i - templates.length + 1}`,
        author: template.author,
        description: template.desc,
        icon: getGeneratedSvg(template.name, template.category),
        tags: template.tags,
        category: template.category,
        versions: ['1.21.1', '1.20.6', '1.20.1'],
        downloads: Math.floor(Math.random() * 10000000),
        installed: false,
        enabled: false,
        enabledVersions: [],
        fileSize: `${(Math.random() * 50 + 5).toFixed(1)} MB`,
        loaders: template.loader ? [template.loader] : ['forge'],
        projectId: `${projectType}-${uniqueId}`,
        fileId: 0,
        projectType
      })
    }
    
    return modList
  }

  const saveToLocalStorage = () => {
    try {
      const data = {
        version: STORAGE_VERSION,
        mods: mods.value.slice(0, 2000),
        modpacks: modpacks.value.slice(0, 500),
        shaders: shaders.value.slice(0, 300),
        resourcePacks: resourcePacks.value.slice(0, 500),
        lastSyncTime: lastSyncTime.value?.toISOString() || null,
        totalModCount: totalModCount.value,
        totalModpackCount: totalModpackCount.value,
        totalShaderCount: totalShaderCount.value,
        totalResourcePackCount: totalResourcePackCount.value
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('[Mods] Failed to save to localStorage:', error)
    }
  }

  const loadFromLocalStorage = (): boolean => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        if (data.version !== STORAGE_VERSION) {
          localStorage.removeItem(STORAGE_KEY)
          return false
        }
        
        const convertModLoaders = (modList: any[]): Mod[] => {
          return modList.map(mod => {
            if (!mod.loaders || mod.loaders.length === 0) {
              if (mod.loader) {
                return { ...mod, loaders: [mod.loader] }
              }
              return { ...mod, loaders: ['forge'] }
            }
            return mod
          })
        }
        
        if (data.mods) mods.value = convertModLoaders(data.mods)
        if (data.modpacks) modpacks.value = convertModLoaders(data.modpacks)
        if (data.shaders) shaders.value = convertModLoaders(data.shaders)
        if (data.resourcePacks) resourcePacks.value = convertModLoaders(data.resourcePacks)
        if (data.lastSyncTime) lastSyncTime.value = new Date(data.lastSyncTime)
        if (data.totalModCount) totalModCount.value = data.totalModCount
        if (data.totalModpackCount) totalModpackCount.value = data.totalModpackCount
        if (data.totalShaderCount) totalShaderCount.value = data.totalShaderCount
        if (data.totalResourcePackCount) totalResourcePackCount.value = data.totalResourcePackCount
        return true
      }
    } catch (error) {
      console.error('[Mods] Failed to load from localStorage:', error)
    }
    return false
  }

  const mergeModsByProjectId = (modList: Mod[]): Mod[] => {
    const projectMap = new Map<string, Mod>()
    
    modList.forEach(mod => {
      const existing = projectMap.get(mod.id)
      if (existing) {
        const allLoaders = new Set([...existing.loaders, ...mod.loaders])
        existing.loaders = Array.from(allLoaders)
        if (mod.downloads > existing.downloads) {
          existing.downloads = mod.downloads
        }
      } else {
        projectMap.set(mod.id, { ...mod })
      }
    })
    
    const result = Array.from(projectMap.values())
    const duplicates = result.filter(m => m.loaders.length !== [...new Set(m.loaders)].length)
    if (duplicates.length > 0) {
      console.log('[Mods] Warning: Duplicate loaders found:', duplicates.map(m => ({ name: m.name, loaders: m.loaders })))
    }
    
    return result
  }

  const initMods = async (force = false) => {
    if (isLoading.value) return
    
    isLoading.value = true
    
    try {
      const loadedFromStorage = !force && loadFromLocalStorage()
      
      if (!loadedFromStorage || force || mods.value.length === 0) {
        console.log('[Mods] Fetching from API (page 0 only)...')
        
        await Promise.all([
          fetchMods(0, 100),
          fetchMods(1, 100),
          fetchMods(2, 100),
          fetchModpacks(0, 100),
          fetchShaders(0, 100),
          fetchResourcePacks(0, 100)
        ])
        
        if (mods.value.length === 0) {
          mods.value = generateBackupMods(150, 'mod')
          totalModCount.value = 67000
        }
        if (modpacks.value.length === 0) {
          modpacks.value = generateBackupMods(100, 'modpack')
          totalModpackCount.value = 8000
        }
        if (shaders.value.length === 0) {
          shaders.value = generateBackupMods(80, 'shader')
          totalShaderCount.value = 2000
        }
        if (resourcePacks.value.length === 0) {
          resourcePacks.value = generateBackupMods(100, 'resourcepack')
          totalResourcePackCount.value = 5000
        }
        
        saveToLocalStorage()
      }
      
      console.log('[Mods] Total loaded:', mods.value.length, 'mods,', modpacks.value.length, 'modpacks,', shaders.value.length, 'shaders,', resourcePacks.value.length, 'resource packs')
    } catch (error) {
      console.error('[Mods] Error initializing:', error)
      if (mods.value.length === 0) {
        mods.value = generateBackupMods(500, 'mod')
        totalModCount.value = 67000
      }
      if (modpacks.value.length === 0) {
        modpacks.value = generateBackupMods(100, 'modpack')
        totalModpackCount.value = 8000
      }
      if (shaders.value.length === 0) {
        shaders.value = generateBackupMods(50, 'shader')
        totalShaderCount.value = 2000
      }
      if (resourcePacks.value.length === 0) {
        resourcePacks.value = generateBackupMods(100, 'resourcepack')
        totalResourcePackCount.value = 5000
      }
      saveToLocalStorage()
    } finally {
      isLoading.value = false
    }
  }

  const loadMoreMods = async (projectType: string, page: number, pageSize: number, gameVersion?: string): Promise<boolean> => {
    if (isLoading.value) return false
    
    isLoading.value = true
    
    try {
      let success = false
      switch (projectType) {
        case 'mod':
          success = await fetchMods(page, pageSize, undefined, gameVersion)
          break
        case 'modpack':
          success = await fetchModpacks(page, pageSize, gameVersion)
          break
        case 'shader':
          success = await fetchShaders(page, pageSize, gameVersion)
          break
        case 'resourcepack':
          success = await fetchResourcePacks(page, pageSize, gameVersion)
          break
      }
      saveToLocalStorage()
      return success
    } finally {
      isLoading.value = false
    }
  }

  const getTabArray = (projectType: string) =>
    projectType === 'mod' ? mods :
    projectType === 'modpack' ? modpacks :
    projectType === 'shader' ? shaders : resourcePacks

  const addModsToStore = (projectType: string, modsToAdd: Mod[]): void => {
    if (!modsToAdd || modsToAdd.length === 0) return
    const target = getTabArray(projectType)
    const existing = new Set(target.value.map(m => m.id))
    for (const mod of modsToAdd) {
      if (!existing.has(mod.id)) {
        target.value.push(mod)
        existing.add(mod.id)
      }
    }
  }

  const searchCache = new Map<string, { mods: Mod[]; total: number; hasMore: boolean }>()

  const searchMods = async (query: string, projectType: string, page = 0, pageSize = 100): Promise<{ mods: Mod[]; total: number; hasMore: boolean }> => {
    try {
      const key = `${projectType}:${query.toLowerCase()}`
      const cacheable = pageSize >= 50 && page === 0
      if (cacheable) {
        const cached = searchCache.get(key)
        if (cached) {
          addModsToStore(projectType, cached.mods)
          return cached
        }
      }
      const result = await fetchFromModrinth(projectType, page, pageSize, undefined, query)
      addModsToStore(projectType, result.mods)
      if (cacheable) {
        searchCache.set(key, { mods: result.mods, total: result.total, hasMore: result.hasMore })
        if (searchCache.size > 20) {
          const firstKey = searchCache.keys().next().value
          if (firstKey !== undefined) searchCache.delete(firstKey)
        }
      }
      return result
    } catch (error) {
      console.error('[Mods] Search failed:', error)
      return { mods: [], total: 0, hasMore: false }
    }
  }

  const addNotification = (modId: string, modName: string, type: 'downloading' | 'completed' | 'failed' | 'info', progress: number = 0, message?: string) => {
    // 用户已手动关闭该 mod 的通知，忽略后续自动弹出的下载进度
    if (dismissedNotifications.has(modId)) return

    const id = `notif-${modId}-${Date.now()}`
    
    const existing = notifications.value.find(n => n.modId === modId)
    if (existing) {
      existing.type = type
      existing.progress = progress
      existing.message = message
      existing.timestamp = Date.now()
      if (type === 'completed' || type === 'failed') {
        setTimeout(() => {
          const idx = notifications.value.findIndex(n => n.id === existing.id)
          if (idx > -1) notifications.value.splice(idx, 1)
        }, 5000)
      }
      return
    }

    notifications.value.push({ id, modId, modName, type, progress, message, timestamp: Date.now() })
    
    if (type === 'completed' || type === 'failed') {
      setTimeout(() => {
        const idx = notifications.value.findIndex(n => n.id === id)
        if (idx > -1) notifications.value.splice(idx, 1)
      }, 5000)
    }
  }

  const removeNotification = (id: string) => {
    const idx = notifications.value.findIndex(n => n.id === id)
    if (idx > -1) {
      dismissedNotifications.add(notifications.value[idx].modId)
      notifications.value.splice(idx, 1)
    }
  }

  const addToDownloadQueue = (modId: string, version?: string, projectType?: string, targetGameVersion?: string) => {
    const mod = mods.value.find(m => m.id === modId) ||
                modpacks.value.find(m => m.id === modId) ||
                shaders.value.find(m => m.id === modId) ||
                resourcePacks.value.find(m => m.id === modId)

    if (!mod) return

    // 已在下载中的不重复加入；失败/取消的移除旧记录以允许重试
    const existing = downloadQueue.value.find(q => q.modId === modId)
    if (existing && existing.status === 'downloading') return
    if (existing) {
      const idx = downloadQueue.value.findIndex(q => q.modId === modId)
      downloadQueue.value.splice(idx, 1)
    }

    // 重新发起下载时恢复该 mod 的通知
    dismissedNotifications.delete(modId)

    downloadQueue.value.push({
      modId,
      modName: mod.name,
      progress: 0,
      status: 'downloading',
      version,
      projectType: projectType || mod.projectType,
      targetGameVersion
    })

    processDownloadQueue()
  }

  const cancelDownload = (modId: string) => {
    const queueItem = downloadQueue.value.find(q => q.modId === modId)
    if (queueItem) {
      queueItem.status = 'cancelled'
    }
    useDownloadsStore().setStatus(modId, 'cancelled')
    // 真正中断主进程的 HTTP 下载请求（否则文件照样下完写盘、占用并发名额）
    window.electronAPI?.cancelModDownload?.(modId)?.catch(() => {})
  }

  const processDownloadQueue = async () => {
    const tryStartNext = () => {
      while (currentDownloads.value < maxConcurrentDownloads.value) {
        const nextItem = downloadQueue.value.find(q => q.status === 'downloading' && !activeProcessing.has(q.modId))
        if (!nextItem) break
        activeProcessing.add(nextItem.modId)
        currentDownloads.value++
        // 异步执行下载，不等待完成
        performDownload(nextItem).finally(() => {
          activeProcessing.delete(nextItem.modId)
          currentDownloads.value--
          // 下载完成后尝试处理队列中下一个
          tryStartNext()
        })
      }
    }
    tryStartNext()
  }

  const performDownload = async (queueItem: typeof downloadQueue.value[0]) => {
    const mod = mods.value.find(m => m.id === queueItem.modId) ||
                modpacks.value.find(m => m.id === queueItem.modId) ||
                shaders.value.find(m => m.id === queueItem.modId) ||
                resourcePacks.value.find(m => m.id === queueItem.modId)

    if (!mod || !mod.projectId) {
      queueItem.status = 'failed'
      const err = !mod ? i18n.global.t('rt.stMods.modNotFound') : i18n.global.t('rt.stMods.modMissingProjectId')
      queueItem.error = err
      addNotification(queueItem.modId, queueItem.modName, 'failed', 0, err)
      return
    }

    addNotification(queueItem.modId, queueItem.modName, 'downloading', 0, i18n.global.t('rt.stMods.downloadPreparing'))

    try {
      const versions = await fetchModVersions(mod.projectId)
      if (!versions || versions.length === 0) {
        queueItem.status = 'failed'
        const err = i18n.global.t('rt.stMods.versionInfoFailed')
        queueItem.error = err
        addNotification(queueItem.modId, queueItem.modName, 'failed', 0, err)
        return
      }

      // 智能选版：优先用户指定版本；否则匹配「目标 MC 版本 + 加载器」，避免装错
      const target = queueItem.targetGameVersion
      const wantedLoader = mod.loaders && mod.loaders.length > 0 ? mod.loaders[0] : undefined
      let versionToDownload: ModVersion | undefined
      if (queueItem.version) {
        versionToDownload = versions.find(v => v.version_number === queueItem.version)
      }
      if (!versionToDownload) {
        const pool = versions.filter(v => v.files && v.files.length > 0)
        const byLoader = wantedLoader
          ? pool.filter(v => !v.loaders || v.loaders.length === 0 || v.loaders.includes(wantedLoader))
          : pool
        const usable = byLoader.length > 0 ? byLoader : pool
        const exact = target ? usable.find(v => v.game_versions && v.game_versions.includes(target)) : undefined
        const partial = target && !exact
          ? usable.find(v => v.game_versions && v.game_versions.some(g => g === target || g.startsWith(target.split('.').slice(0, 2).join('.') + '.')))
          : undefined
        // 指定了目标游戏版本时不允许“回退装最新版”：没有恰好兼容的文件就取消安装，
        // 否则会把不支持该版本的光影/模组仍然装进去（没有目标时才允许取最新）
        versionToDownload = target
          ? (exact || partial)
          : (usable.length > 0 ? usable[0] : pool[0])
      }

      if (!versionToDownload || !versionToDownload.files || versionToDownload.files.length === 0) {
        queueItem.status = 'failed'
        const err = target
          ? i18n.global.t('rt.stMods.noVersionForTarget', { ver: target })
          : i18n.global.t('rt.stMods.noDownloadFile')
        queueItem.error = err
        addNotification(queueItem.modId, queueItem.modName, 'failed', 0, err)
        return
      }

      const file = versionToDownload.files[0]

      // 在下载中心登记任务
      const downloadsStore = useDownloadsStore()
      const taskCategory = mod.projectType === 'modpack' ? 'modpack' :
                           mod.projectType === 'shader' ? 'shader' :
                           mod.projectType === 'resourcepack' ? 'resourcepack' : 'mod'
      downloadsStore.addTask({
        id: queueItem.modId,
        name: mod.name,
        category: taskCategory,
        icon: mod.icon,
        status: 'downloading',
        subType: versionToDownload.version_number
      })

      // 整合包走主进程安装（下载 zip + 解压 + 注册为可启动版本）
      if (mod.projectType === 'modpack' && window.electronAPI?.installModpack) {
        // 记录主进程报告的缺失文件（整合包不完整时必须让用户知道）
        let incompleteCount = 0
        const missingFiles: string[] = []
        // 注册一次进度监听（主进程通过 mod-download-progress 推送）
        const removeListener = window.electronAPI.onModDownloadProgress((_e: unknown, data: { modId: string; progress: number; speed?: number; threads?: number; incomplete?: boolean; missingCount?: number; missingFiles?: string[] }) => {
          if (data.modId === queueItem.modId) {
            queueItem.progress = data.progress
            downloadsStore.updateProgress(queueItem.modId, data.progress, data.speed || 0, undefined, undefined, data.threads)
            if (data.incomplete) {
              incompleteCount = data.missingCount || 0
              if (data.missingFiles) missingFiles.push(...data.missingFiles)
              addNotification(queueItem.modId, queueItem.modName, 'downloading', data.progress, i18n.global.t('rt.stMods.missingFilesRetrying', { count: incompleteCount }))
              return
            }
            addNotification(queueItem.modId, queueItem.modName, 'downloading', data.progress, i18n.global.t('rt.stMods.downloading'))
          }
        })

        try {
          const result = await window.electronAPI.installModpack(
            queueItem.modId,
            mod.name,
            file.url,
            versionToDownload.version_number,
            file.size,
            file.sha1
          )

          if (result.success) {
            queueItem.progress = 100
            queueItem.status = 'completed'
            downloadsStore.setStatus(queueItem.modId, 'completed')
            mod.installed = true
            mod.installedVersion = versionToDownload.version_number
            saveToLocalStorage()
            if (incompleteCount > 0) {
              // 不谎报"安装完成"：整合包缺文件会在进游戏时表现为 mods 加载崩溃
              console.warn(`[Mods] 整合包安装完成但缺失 ${incompleteCount} 个文件:`, missingFiles.slice(0, 10))
              addNotification(
                queueItem.modId,
                queueItem.modName,
                'completed',
                100,
                i18n.global.t('rt.stMods.installedWithMissing', { count: incompleteCount })
              )
            } else {
              addNotification(queueItem.modId, queueItem.modName, 'completed', 100, i18n.global.t('rt.stMods.installComplete'))
            }

            // 在 versions store 中注册整合包为可启动版本
            try {
              const versionsStore = useVersionsStore()
              const versionId = result.versionId || mod.name || 'modpack'
              const existing = versionsStore.versions.find(v => v.id === versionId)
              if (!existing) {
                versionsStore.versions.unshift({
                  id: versionId,
                  type: 'release',
                  releaseDate: new Date().toISOString().split('T')[0],
                  installed: true,
                  url: undefined,
                  isModpack: true,
                  packName: mod.name,
                  displayName: mod.name
                })
              } else {
                existing.installed = true
                existing.isModpack = true
                existing.packName = existing.packName || mod.name
                existing.displayName = existing.displayName || mod.name
              }
              versionsStore.saveToLocalStorageNow?.()
            } catch (e) {
              console.warn('[Mods] 注册整合包到 versions store 失败:', e)
            }
          } else {
            throw new Error(result.error || i18n.global.t('rt.stMods.modpackInstallFailed'))
          }
        } finally {
          removeListener()
        }
        return
      }

      // 普通模组/光影/资源包：通过主进程下载到对应目录（支持版本隔离）
      const subDir = mod.projectType === 'shader' ? 'shaderpacks' :
                      mod.projectType === 'resourcepack' ? 'resourcepacks' : 'mods'

      const removeListener = window.electronAPI.onModDownloadProgress((_e: unknown, data: { modId: string; progress: number; speed?: number }) => {
        if (data.modId === queueItem.modId) {
          queueItem.progress = data.progress
          downloadsStore.updateProgress(queueItem.modId, data.progress, data.speed || 0)
          addNotification(queueItem.modId, queueItem.modName, 'downloading', data.progress, i18n.global.t('rt.stMods.downloading'))
        }
      })

      try {
        const result = await window.electronAPI.downloadMod(
          queueItem.modId,
          mod.name,
          file.url,
          versionToDownload.version_number,
          target,
          subDir,
          file.filename,
          file.size,
          file.sha1
        )

        if (result.success) {
          queueItem.progress = 100
          queueItem.status = 'completed'
          downloadsStore.setStatus(queueItem.modId, 'completed')
          mod.installed = true
          mod.enabled = true
          mod.installedVersion = versionToDownload.version_number
          mod.filePath = result.filePath
          const oldFileName = mod.fileName
          mod.fileName = result.fileName || (result.filePath || '').split(/[\\/]/).pop() || undefined
          mod.subDir = subDir
          mod.targetGameVersion = target || undefined
          if (oldFileName && mod.fileName && oldFileName !== mod.fileName && window.electronAPI?.manageInstalledFile) {
            // 更新到新文件名时删除旧版本文件：同个 mod 新旧两个文件会同时被游戏加载导致冲突
            try {
              await window.electronAPI.manageInstalledFile('delete', subDir, mod.targetGameVersion, oldFileName, mod.name)
            } catch (e) {
              console.warn('[Mods] 删除旧版本文件失败（不影响新版本）:', e)
            }
          }
          saveToLocalStorage()
          addNotification(queueItem.modId, queueItem.modName, 'completed', 100, i18n.global.t('rt.stMods.downloadComplete'))
        } else {
          throw new Error(result.error || i18n.global.t('rt.stMods.downloadFailed'))
        }
      } finally {
        removeListener()
      }

    } catch (error: any) {
      console.error('[Mods] Download failed:', error)
      // 用户主动取消：不当作失败处理（状态已置为 cancelled，不发失败通知、不弹失败提示）
      if (queueItem.status === 'cancelled') return
      queueItem.status = 'failed'
      const errMsg = error?.message || i18n.global.t('rt.stMods.downloadFailedNetwork')
      queueItem.error = errMsg
      const ds = useDownloadsStore()
      ds.setStatus(queueItem.modId, 'failed', errMsg)
      addNotification(queueItem.modId, queueItem.modName, 'failed', 0, errMsg)
    }
  }

  const installMod = async (modId: string, targetGameVersion?: string) => {
    addToDownloadQueue(modId, undefined, undefined, targetGameVersion)
  }

  const subDirForType = (projectType?: string) =>
    projectType === 'shader' ? 'shaderpacks' :
    projectType === 'resourcepack' ? 'resourcepacks' :
    projectType === 'modpack' ? 'modpack-downloads' : 'mods'

  // 卸载：真正删除磁盘上的文件（尽力而为，删不掉不阻塞状态更新）
  const uninstallMod = async (modId: string) => {
    const mod = mods.value.find(m => m.id === modId) || 
                modpacks.value.find(m => m.id === modId) ||
                shaders.value.find(m => m.id === modId) ||
                resourcePacks.value.find(m => m.id === modId)
    
    if (mod) {
      if (mod.installed && mod.fileName && window.electronAPI?.manageInstalledFile) {
        try {
          await window.electronAPI.manageInstalledFile(
            'delete',
            mod.subDir || subDirForType(mod.projectType),
            mod.targetGameVersion,
            mod.fileName,
            mod.name
          )
        } catch (e) {
          console.warn('[Mods] 删除已安装文件失败（状态已同步，文件需手动清理）:', e)
        }
      }
      mod.installed = false
      mod.enabled = false
      mod.installedVersion = undefined
      mod.filePath = undefined
      mod.fileName = undefined
      saveToLocalStorage()
    }
  }

  // 启停：真正重命名文件为 .disabled（游戏不再加载），启用时还原
  // 返回新的启用状态；文件操作失败返回 null（不做状态翻转）
  const toggleMod = async (modId: string): Promise<boolean | null> => {
    const mod = mods.value.find(m => m.id === modId) || 
                modpacks.value.find(m => m.id === modId) ||
                shaders.value.find(m => m.id === modId) ||
                resourcePacks.value.find(m => m.id === modId)
    
    if (!mod || !mod.installed) return null
    const nextEnabled = !mod.enabled
    if (mod.fileName && window.electronAPI?.manageInstalledFile) {
      try {
        const res = await window.electronAPI.manageInstalledFile(
          nextEnabled ? 'enable' : 'disable',
          mod.subDir || subDirForType(mod.projectType),
          mod.targetGameVersion,
          mod.fileName,
          mod.name
        )
        if (res.success) {
          if (res.newPath) mod.filePath = res.newPath
          if (res.newFileName) mod.fileName = res.newFileName
        } else {
          console.warn('[Mods] 启停文件操作失败:', res.error)
          return null
        }
      } catch (e) {
        console.warn('[Mods] 启停文件操作异常:', e)
        return null
      }
    }
    mod.enabled = nextEnabled
    saveToLocalStorage()
    return nextEnabled
  }

  const getInstalledCount = () => {
    return mods.value.filter(m => m.installed).length +
           modpacks.value.filter(m => m.installed).length +
           shaders.value.filter(m => m.installed).length +
           resourcePacks.value.filter(m => m.installed).length
  }

  // 注册通过内置浏览器下载/本地拖入安装的文件，使其出现在已安装列表
  const addLocalInstalledFile = (fileName: string, projectType: string, targetGameVersion?: string, filePath?: string) => {
    const cleanName = (fileName || '').replace(/\.(jar|zip|mrpack)$/i, '')
    const mod: Mod = {
      id: 'local-' + fileName + '-' + Date.now(),
      name: cleanName || fileName,
      author: i18n.global.t('rt.stMods.localFile'),
      description: i18n.global.t('rt.stMods.localFileDescription'),
      icon: '',
      tags: [],
      category: 'utility',
      versions: [],
      downloads: 0,
      installed: true,
      enabled: true,
      enabledVersions: [],
      loaders: [],
      filePath: filePath || fileName,
      fileName,
      subDir: subDirForType(projectType),
      targetGameVersion,
      projectType
    }
    if (projectType === 'shader') shaders.value.unshift(mod)
    else if (projectType === 'resourcepack') resourcePacks.value.unshift(mod)
    else if (projectType === 'modpack') modpacks.value.unshift(mod)
    else mods.value.unshift(mod)
    saveToLocalStorage()
  }

  const checkForUpdates = async (): Promise<{ modId: string; name: string; currentVersion: string; latestVersion: string }[]> => {
    const updates: { modId: string; name: string; currentVersion: string; latestVersion: string }[] = []
    const allMods = [...mods.value, ...modpacks.value, ...shaders.value, ...resourcePacks.value]
    
    for (const mod of allMods) {
      if (mod.installed && mod.projectId) {
        const versions = await fetchModVersions(mod.projectId)
        if (versions && versions.length > 0) {
          const latest = versions[0].version_number
          if (mod.installedVersion && mod.installedVersion !== latest) {
            updates.push({
              modId: mod.id,
              name: mod.name,
              currentVersion: mod.installedVersion,
              latestVersion: latest
            })
          }
        }
      }
    }
    
    return updates
  }

  const getModById = (modId: string): Mod | undefined => {
    return mods.value.find(m => m.id === modId) || 
           modpacks.value.find(m => m.id === modId) ||
           shaders.value.find(m => m.id === modId) ||
           resourcePacks.value.find(m => m.id === modId)
  }

  const getModVersions = (modId: string): ModVersion[] => {
    return getModById(modId)?.modVersions || []
  }

  return {
    mods,
    modpacks,
    shaders,
    resourcePacks,
    selectedCategory,
    selectedGameVersion,
    selectedLoader,
    isLoading,
    installProgress,
    loadedMods,
    lastSyncTime,
    totalModCount,
    totalModpackCount,
    totalShaderCount,
    totalResourcePackCount,
    currentGameVersion,
    downloadQueue,
    currentDownloads,
    maxConcurrentDownloads,
    notifications,
    categories,
    gameVersions,
    loaders,
    initMods,
    loadMoreMods,
    fetchMods,
    fetchModpacks,
    fetchShaders,
    fetchResourcePacks,
    searchMods,
    installMod,
    uninstallMod,
    toggleMod,
    addLocalInstalledFile,
    addToDownloadQueue,
    cancelDownload,
    addNotification,
    removeNotification,
    fetchModDetails,
    fetchModVersions,
    getInstalledCount,
    checkForUpdates,
    getModById,
    getModVersions
  }
})

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { useModsStore } from '../stores/mods'
import { useVersionsStore } from '../stores/versions'
import { useSettingsStore } from '../stores/settings'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const modsStore = useModsStore()
const versionsStore = useVersionsStore()
const settingsStore = useSettingsStore()

const searchQuery = ref('')
const selectedGameVersion = ref('all')
const selectedLoader = ref<'all' | 'fabric' | 'forge' | 'neoforge' | 'quilt'>('all')
const selectedCategory = ref('all')
const selectedSource = ref('all')
const installingAll = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')
const currentPage = ref(0)
const isLoadingMore = ref(false)

const activeTab = ref<'installed' | 'downloadable' | 'modpacks' | 'shaders' | 'resourcepacks'>('downloadable')

// 记住上次浏览的子标签页和页码，避免每次打开模组页都回到第一页
const MODS_STATE_KEY = 'zncl-mods-state'
const restoreModsState = () => {
  try {
    const saved = localStorage.getItem(MODS_STATE_KEY)
    if (saved) {
      const data = JSON.parse(saved)
      if (data && (data.tab === 'installed' || data.tab === 'downloadable' || data.tab === 'modpacks' || data.tab === 'shaders' || data.tab === 'resourcepacks')) {
        activeTab.value = data.tab
      }
      if (data && typeof data.page === 'number' && data.page >= 0) {
        currentPage.value = data.page
      }
    }
  } catch {}
}
const saveModsState = () => {
  try {
    localStorage.setItem(MODS_STATE_KEY, JSON.stringify({ tab: activeTab.value, page: currentPage.value }))
  } catch {}
}
restoreModsState()

const jumpPage = ref(1)

const sortBy = ref<'downloads' | 'name' | 'date'>('downloads')
const viewMode = ref<'grid' | 'list'>('grid')

const showModDetail = ref(false)
const detailMod = ref<any>(null)
const modVersions = ref<any[]>([])
const selectedVersion = ref<any>(null)
const detailTab = ref<'info' | 'versions' | 'changelog'>('info')
const showDownloadQueue = ref(false)

// 详情面板的“支持版本”以实际发布文件为准，优先展示版本级 game_versions，
// 避免显示搜索接口返回的、可能包含不实版本的项目级数据
const detailSupportedVersions = computed(() => {
  const list: string[] = []
  if (Array.isArray(modVersions.value) && modVersions.value.length > 0) {
    const set = new Set<string>()
    for (const v of modVersions.value) {
      for (const g of (v.game_versions || [])) set.add(g)
    }
    list.push(...set)
  }
  // 仅当没有远程项目来源（本地安装文件）时，才回退到已有的版本数据，
  // 避免在版本级数据加载完成前展示可能不实的项目级列表
  if (list.length === 0 && !detailMod.value?.projectId && Array.isArray(detailMod.value?.versions)) {
    list.push(...detailMod.value.versions)
  }
  return list
})

// 版本选择弹窗（版本隔离）
const showVersionSelectModal = ref(false)
const modToInstall = ref<{ modId: string; version?: string } | null>(null)
// 安装弹窗已加载的项目版本列表（项目级文件过滤用），同一项目做缓存避免重复拉取接口
const modVersionsCache = new Map<string, any[]>()
const modToInstallVersions = ref<any[]>([])
const modToInstallLoading = ref(false)
const loadModVersions = async (projectId: string): Promise<any[] | null> => {
  if (modVersionsCache.has(projectId)) return modVersionsCache.get(projectId) || null
  const versions = await modsStore.fetchModVersions(projectId)
  if (Array.isArray(versions) && versions.length > 0) modVersionsCache.set(projectId, versions)
  return versions
}

// 整合包版本选择弹窗
const showModpackVersionModal = ref(false)
const modpackInstallTarget = ref<{ modId: string; name: string } | null>(null)
const modpackVersions = ref<any[]>([])
const modpackSelectedVersion = ref<any>(null)
const modpackVersionLoading = ref(false)

const fileInputRef = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

const selectedMods = ref<Set<string>>(new Set())
const isSelectMode = ref(false)
const iconErrorMods = ref<Set<string>>(new Set())

const categories = computed(() => [
  { id: 'all', name: t('modsUi.catAll'), icon: '📦' },
  { id: 'optimization', name: t('modsUi.catOptimization'), icon: '⚡' },
  { id: 'technology', name: t('modsUi.catTechnology'), icon: '🔧' },
  { id: 'magic', name: t('modsUi.catMagic'), icon: '✨' },
  { id: 'adventure', name: t('modsUi.catAdventure'), icon: '🗺️' },
  { id: 'worldgen', name: t('modsUi.catWorldgen'), icon: '🌍' },
  { id: 'decoration', name: t('modsUi.catDecoration'), icon: '🏠' },
  { id: 'utility', name: t('modsUi.catUtility'), icon: '🔨' },
  { id: 'library', name: t('modsUi.catLibrary'), icon: '📚' },
  { id: 'mobs', name: t('modsUi.catMobs'), icon: '🐉' },
  { id: 'food', name: t('modsUi.catFood'), icon: '🍖' },
  { id: 'storage', name: t('modsUi.catStorage'), icon: '📥' },
  { id: 'minimap', name: t('modsUi.catMinimap'), icon: '🧭' },
  { id: 'inventory', name: t('modsUi.catInventory'), icon: '🎒' },
  { id: 'shader', name: t('modsUi.catShader'), icon: '🌅' }
])

const installedVersions = computed(() => versionsStore.installedVersions)
const installedCount = computed(() => modsStore.getInstalledCount())

const POPULAR_VERSIONS = [
  '1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
  '1.20.6', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
  '1.19.4', '1.19.3', '1.19.2',
  '1.18.2', '1.18.1',
  '1.16.5', '1.16.4',
  '1.12.2', '1.7.10'
]

const availableGameVersions = computed(() => {
  const versionSet = new Set<string>()
  for (const v of installedVersions.value) {
    if (v.isModpack && v.mcVersion) {
      versionSet.add(v.mcVersion)
    } else if (v.id) {
      versionSet.add(v.id)
    }
  }
  for (const v of POPULAR_VERSIONS) {
    versionSet.add(v)
  }
  return Array.from(versionSet).sort((a, b) => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0
      const nb = pb[i] || 0
      if (na !== nb) return nb - na
    }
    return 0
  })
})

const getModDisplayVersion = (v: any): string => {
  if (v.isModpack && v.mcVersion) return v.mcVersion
  return v.id
}

const compatibleVersions = computed(() => {
  const modId = modToInstall.value?.modId
  if (!modId) return installedVersions.value
  const mod = modsStore.getModById(modId)
  if (!mod) return installedVersions.value

  const versionToInstall = modToInstall.value?.version
  // 优先使用安装弹窗已拉取的版本列表；否则回退到详情页挂载的版本数据
  const available = (Array.isArray(modToInstallVersions.value) && modToInstallVersions.value.length
    ? modToInstallVersions.value
    : (modsStore.getModVersions(modId) as any)) || []

  // 用户明确了要安装的模组版本：只允许该版本支持的（游戏版本 + 加载器）
  if (versionToInstall) {
    const targetModVersion = available.find((v: any) => v.version_number === versionToInstall)
    if (!targetModVersion) return installedVersions.value

    const supportedGameVersions: string[] = targetModVersion.game_versions || []
    const supportedLoaders: string[] = targetModVersion.loaders || []
    if (supportedGameVersions.length === 0 && supportedLoaders.length === 0) return installedVersions.value

    return installedVersions.value.filter((v: any) => {
      const versionId = v.id
      const loader = (v.loader || '').toLowerCase()

      const gameVersionMatch = supportedGameVersions.length === 0 || supportedGameVersions.includes(versionId)

      const loaderMatch = supportedLoaders.length === 0 || !loader || supportedLoaders.includes(loader)

      return gameVersionMatch && loaderMatch
    })
  }

  // 未明确模组版本：按实际发布文件过滤，只要该游戏的版本有任一文件支持即可安装，
  // 避免“直接点安装”把不支持目标版本的包也列出来
  if (!available.length) return installedVersions.value
  return installedVersions.value.filter((v: any) => {
    const versionId = v.id
    return available.some((ver: any) => (ver.game_versions || []).includes(versionId))
  })
})

const filteredMods = shallowRef<any[]>([])
const searchResults = shallowRef<any[]>([])
const searchTotal = ref(0)
const isSearching = ref(false)
let searchSession = ''
const searchConfirmedQuery = ref('')
const previewResults = shallowRef<any[]>([])
const previewOpen = ref(false)
const isPreviewing = ref(false)
const isSearchActive = computed(() => searchResults.value.length > 0)

const SEARCH_SOURCE = 'Modrinth'
const SEARCH_SOURCE_URL = 'api.modrinth.com'
const SEARCH_PAGE_SIZE = 60

const currentLoadingText = computed(() => {
  const query = searchConfirmedQuery.value || searchQuery.value.trim()
  if (isSearching.value) {
    return query ? t('modsUi.loadingSearch', { source: SEARCH_SOURCE, query }) : t('modsUi.loadingFetchProjects', { source: SEARCH_SOURCE })
  }
  if (isLoadingMore.value) {
    if (isSearchActive.value && query) {
      return t('modsUi.loadingSearchPage', { source: SEARCH_SOURCE, query, n: currentPage.value + 1 })
    }
    return t('modsUi.loadingLoadPage', { source: SEARCH_SOURCE, n: currentPage.value + 1 })
  }
  if (modsStore.isLoading) {
    return t('modsUi.loadingLatestList', { source: SEARCH_SOURCE })
  }
  return ''
})

const getCurrentProjectType = () => {
  switch (activeTab.value) {
    case 'downloadable': return 'mod'
    case 'modpacks': return 'modpack'
    case 'shaders': return 'shader'
    case 'resourcepacks': return 'resourcepack'
    default: return 'mod'
  }
}

const totalPages = computed(() => {
  if (isSearchActive.value) {
    return Math.max(1, Math.ceil(searchTotal.value / SEARCH_PAGE_SIZE))
  }
  const projectType = getCurrentProjectType()
  const totalCount = projectType === 'mod' ? modsStore.totalModCount :
                     projectType === 'modpack' ? modsStore.totalModpackCount :
                     projectType === 'shader' ? modsStore.totalShaderCount :
                     modsStore.totalResourcePackCount
  return Math.ceil(totalCount / 100)
})

// 文件级版本兼容校验：搜索接口返回的 game_versions 是项目级的，可能把
// 并未真正提供该版本文件的包也标进来。这里按“项目 + 目标版本”缓存文件级校验结果，
// 只有确实存在支持该版本的发布文件时才保留。校验并发受限，避免请求过多。
const versionCompatCache = new Map<string, boolean>()
const versionCompatInFlight = new Set<string>()
const compatKey = (m: any, ver: string) => `${m.projectId || m.id}::${ver}`

const VERSION_VERIFY_MAX = 6
let versionVerifyActive = 0
const versionVerifyQueue: Array<{ projectId: string; ver: string }> = []

const pumpVersionVerifyQueue = () => {
  while (versionVerifyActive < VERSION_VERIFY_MAX && versionVerifyQueue.length > 0) {
    const job = versionVerifyQueue.shift()!
    const key = `${job.projectId}::${job.ver}`
    versionVerifyActive++
    modsStore.fetchModVersions(job.projectId).then(versions => {
      const supported = Array.isArray(versions) && versions.length > 0 &&
        versions.some((v: any) => (v.game_versions || []).includes(job.ver))
      versionCompatCache.set(key, supported)
      // 项目级数据是版本级数据的超集，校验只会“剔除”不会“新增”，
      // 因此只有判定为不支持时才需要刷新列表
      if (!supported) updateFilteredMods()
    }).catch(() => {
      // 校验失败时不误删，保持显示
      versionCompatCache.set(key, true)
    }).finally(() => {
      versionCompatInFlight.delete(key)
      versionVerifyActive--
      pumpVersionVerifyQueue()
    })
  }
}

const verifyVersionCompat = (m: any, ver: string) => {
  const key = compatKey(m, ver)
  if (versionCompatCache.has(key) || versionCompatInFlight.has(key)) return
  if (!m.projectId) {
    versionCompatCache.set(key, true)
    return
  }
  versionCompatInFlight.add(key)
  versionVerifyQueue.push({ projectId: m.projectId, ver })
  pumpVersionVerifyQueue()
}

const updateFilteredMods = () => {
  let result: any[] = []

  if (isSearchActive.value) {
    result = searchResults.value
  } else {
    switch (activeTab.value) {
      case 'installed':
        result = [...modsStore.mods, ...modsStore.modpacks, ...modsStore.shaders, ...modsStore.resourcePacks].filter(m => m.installed)
        break
      case 'downloadable':
        result = modsStore.mods.filter(m => !m.installed)
        break
      case 'modpacks':
        result = modsStore.modpacks.filter(m => !m.installed)
        break
      case 'shaders':
        result = modsStore.shaders.filter(m => !m.installed)
        break
      case 'resourcepacks':
        result = modsStore.resourcePacks.filter(m => !m.installed)
        break
    }

    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      result = result.filter(mod =>
        mod.name.toLowerCase().includes(query) ||
        mod.author.toLowerCase().includes(query) ||
        (mod.description && mod.description.toLowerCase().includes(query)) ||
        (mod.tags && mod.tags.some((tag: string) => tag.toLowerCase().includes(query)))
      )
    }
  }

  if (selectedCategory.value !== 'all') {
    result = result.filter(m => m.category === selectedCategory.value)
  }

  if (selectedGameVersion.value !== 'all') {
    const ver = selectedGameVersion.value
    result = result.filter(m => {
      if (m.projectType === 'modpack') {
        const displayVer = m.gameVersion || (m.versions && m.versions[0])
        return displayVer === ver
      }
      // 已做过文件级校验的，以校验结果为准
      const cached = versionCompatCache.get(compatKey(m, ver))
      if (cached !== undefined) return cached
      // 尚未校验：先用项目级 game_versions 初步过滤，随后异步精确校验
      return !!m.versions?.includes(ver)
    })
  }

  if (selectedLoader.value !== 'all' && (activeTab.value === 'downloadable' || activeTab.value === 'modpacks')) {
    result = result.filter(m => m.loaders?.includes(selectedLoader.value))
  }

  if (sortBy.value === 'downloads') {
    result = [...result].sort((a, b) => b.downloads - a.downloads)
  } else if (sortBy.value === 'name') {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }

  filteredMods.value = result

  // 选定具体游戏版本时，对当前展示的列表做文件级校验，剔除没有真正支持该版本的包
  if (selectedGameVersion.value !== 'all' && activeTab.value !== 'installed') {
    const ver = selectedGameVersion.value
    for (const m of result.slice(0, 80)) {
      if (m.projectType === 'modpack') continue
      verifyVersionCompat(m, ver)
    }
  }
}

const filterWatch = computed(() => ({
  tab: activeTab.value,
  category: selectedCategory.value,
  search: searchQuery.value,
  version: selectedGameVersion.value,
  loader: selectedLoader.value,
  sort: sortBy.value,
  source: selectedSource.value
}))

const hasActiveFilters = computed(() => {
  return searchQuery.value || selectedGameVersion.value !== 'all' || selectedLoader.value !== 'all' || selectedCategory.value !== 'all' || selectedSource.value !== 'all'
})

let updateTimer: ReturnType<typeof setTimeout> | null = null
const debouncedUpdate = () => {
  if (updateTimer) clearTimeout(updateTimer)
  updateTimer = setTimeout(updateFilteredMods, 100)
}

const doSearch = async (query: string, page = 0) => {
  if (!settingsStore.settings.internetSearch) {
    searchResults.value = []
    searchTotal.value = 0
    searchSession = ''
    searchConfirmedQuery.value = ''
    updateFilteredMods()
    return
  }
  if (activeTab.value === 'installed') {
    searchResults.value = []
    searchTotal.value = 0
    searchSession = ''
    searchConfirmedQuery.value = ''
    updateFilteredMods()
    return
  }
  const trimmed = query.trim()
  if (!trimmed) {
    searchResults.value = []
    searchTotal.value = 0
    searchSession = ''
    searchConfirmedQuery.value = ''
    updateFilteredMods()
    return
  }
  searchConfirmedQuery.value = trimmed
  isSearching.value = true
  const projectType = getCurrentProjectType()
  const sessionKey = `${projectType}:${trimmed}`
  const result = await modsStore.searchMods(trimmed, projectType, page, SEARCH_PAGE_SIZE)
  if (searchQuery.value.trim() !== trimmed) {
    isSearching.value = false
    return
  }
  // 库里已有的匹配结果优先置顶，再展示联网搜索结果
  const localMatches = getLocalMatches(trimmed, projectType, 10)
  const prependLocal = (mods: any[]) => {
    if (localMatches.length === 0) return mods
    const map = new Map<string, any>()
    ;[...localMatches, ...mods].forEach(m => map.set(m.id || m.name, m))
    return Array.from(map.values())
  }
  if (sessionKey !== searchSession) {
    searchResults.value = prependLocal(result.mods)
    searchSession = sessionKey
  } else if (page > 0) {
    const map = new Map<string, any>()
    ;[...searchResults.value, ...result.mods].forEach(m => map.set(m.id || m.name, m))
    searchResults.value = Array.from(map.values())
  } else {
    searchResults.value = prependLocal(result.mods)
  }
  searchTotal.value = result.total > 0 ? result.total : searchResults.value.length
  isSearching.value = false
  updateFilteredMods()
}

const previewQuery = ref('')
const previewTotal = ref(0)

const getLocalMatches = (query: string, projectType: string, limit: number): any[] => {
  const arr = projectType === 'mod' ? modsStore.mods :
              projectType === 'modpack' ? modsStore.modpacks :
              projectType === 'shader' ? modsStore.shaders :
              modsStore.resourcePacks
  const q = query.toLowerCase()
  return arr
    .filter(m => !m.installed)
    .map(m => {
      let score = 0
      const name = (m.name || '').toLowerCase()
      if (name.includes(q)) score += 10
      if (name.startsWith(q)) score += 20
      if ((m.author || '').toLowerCase().includes(q)) score += 3
      if (m.tags && m.tags.some((t: string) => (t || '').toLowerCase().includes(q))) score += 2
      if (m.description && m.description.toLowerCase().includes(q)) score += 1
      return { m, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.m.downloads || 0) - (a.m.downloads || 0))
    .slice(0, limit)
    .map(x => x.m)
}

const mergePreviewResults = (local: any[], remote: any[], limit: number): any[] => {
  const map = new Map<string, any>()
  ;[...local, ...remote].forEach(m => map.set(m.id || m.name, m))
  return Array.from(map.values()).slice(0, limit)
}

const runPreview = async (query: string) => {
  if (!settingsStore.settings.internetSearch || activeTab.value === 'installed') return
  const projectType = getCurrentProjectType()
  // 1. 立即用本地已加载数据匹配（零网络等待）
  const localMatches = getLocalMatches(query, projectType, 8)
  previewResults.value = localMatches
  previewQuery.value = query
  previewTotal.value = 0
  previewOpen.value = true
  // 2. 后台拉取网络预览并合并补全
  isPreviewing.value = true
  const result = await modsStore.searchMods(query, projectType, 0, 8)
  if (searchQuery.value.trim() !== query) {
    isPreviewing.value = false
    return
  }
  previewResults.value = mergePreviewResults(localMatches, result.mods, 8)
  previewQuery.value = query
  previewTotal.value = result.total > 0 ? result.total : previewResults.value.length
  isPreviewing.value = false
}

const confirmSearch = () => {
  previewOpen.value = false
  const trimmed = searchQuery.value.trim()
  if (!trimmed) return
  currentPage.value = 0
  saveModsState()
  // 立即用预览结果填充，后台再拉取全量补全，避免等待
  if (previewResults.value.length > 0 && previewQuery.value === trimmed) {
    searchResults.value = previewResults.value
    searchTotal.value = previewTotal.value || previewResults.value.length
    searchConfirmedQuery.value = trimmed
    searchSession = `${getCurrentProjectType()}:${trimmed}`
    updateFilteredMods()
  }
  doSearch(trimmed, 0)
}

const browserSearch = () => {
  const query = searchQuery.value.trim()
  if (!query) return
  const typePath = getCurrentProjectType() === 'mod' ? 'mods' :
                   getCurrentProjectType() === 'modpack' ? 'modpacks' :
                   getCurrentProjectType() === 'shader' ? 'shader' : 'resourcepack'
  const url = `https://modrinth.com/${typePath}?q=${encodeURIComponent(query)}`
  openBuiltinBrowser(url)
}

const browserOpen = ref(false)
const browserUrl = ref('')
const browserTitle = ref('')
const browserLoading = ref(false)
const browserCanBack = ref(false)
const browserCanForward = ref(false)
const browserError = ref('')
const browserFullscreen = ref(false)
const browserProgress = ref(0)
const browserDownload = ref<any>(null)
const browserDownloadDone = ref<any>(null)
const browserHistory = ref<any[]>([])
const showHistory = ref(false)
const showInstallMenu = ref(false)
let lastRecordedUrl = ''
let progressTimer: ReturnType<typeof setInterval> | null = null
let removeBrowserState: (() => void) | null = null
let removeBrowserDownload: (() => void) | null = null
let removeBrowserDownloadDone: (() => void) | null = null

const HISTORY_KEY = 'zncl-browser-history'
const LASTURL_KEY = 'zncl-browser-lasturl'

const loadBrowserHistory = () => {
  try {
    browserHistory.value = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    browserHistory.value = []
  }
}

const saveBrowserHistory = () => {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(browserHistory.value.slice(0, 30)))
  } catch {}
}

const recordBrowserVisit = (url: string, title: string) => {
  if (!url || !/^https?:\/\//i.test(url) || url === lastRecordedUrl) return
  lastRecordedUrl = url
  const list = browserHistory.value.filter(h => h.url !== url)
  list.unshift({ url, title: title || url, time: Date.now() })
  browserHistory.value = list.slice(0, 30)
  saveBrowserHistory()
  window.localStorage.setItem(LASTURL_KEY, url)
}

const updateHistoryTitle = (url: string, title: string) => {
  if (!url || !title) return
  const item = browserHistory.value.find(h => h.url === url)
  if (item && item.title !== title) {
    item.title = title
    saveBrowserHistory()
  }
}

const goToHistory = (item: any) => {
  showHistory.value = false
  browserUrl.value = item.url
  browserAction('load', item.url)
}

const openBuiltinBrowser = (url?: string) => {
  if (!url) url = window.localStorage.getItem(LASTURL_KEY) || 'https://modrinth.com'
  window.electronAPI.openBrowser(url)
  browserOpen.value = true
  browserUrl.value = url
  lastRecordedUrl = url
  loadBrowserHistory()
}

const browserAction = (action: string, url?: string) => {
  window.electronAPI.browserAction(action, url)
}

const browserNavigate = () => {
  let raw = browserUrl.value.trim()
  if (!raw) return
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw
  browserUrl.value = raw
  browserAction('load', raw)
  showHistory.value = false
}

watch(browserLoading, (loading) => {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null }
  if (loading) {
    browserProgress.value = 5
    progressTimer = setInterval(() => {
      const p = browserProgress.value
      if (p < 90) browserProgress.value = p + (p < 50 ? 12 : 5)
    }, 200)
  } else {
    browserProgress.value = 100
    setTimeout(() => {
      if (!browserLoading.value) browserProgress.value = 0
    }, 450)
  }
})

const closeBuiltinBrowser = () => {
  window.electronAPI.closeBrowser()
  browserOpen.value = false
  browserUrl.value = ''
  browserTitle.value = ''
  browserLoading.value = false
  browserError.value = ''
  browserFullscreen.value = false
  browserProgress.value = 0
  browserDownload.value = null
  browserDownloadDone.value = null
  showInstallMenu.value = false
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null }
}

const toggleFullscreen = () => {
  browserAction('fullscreen')
}

const installFromBrowser = async (target: string) => {
  const filePath = browserDownloadDone.value?.savePath
  if (!filePath) return
  // 优先安装到已安装的游戏版本的对应子目录（否则全局目录不会被版本隔离的游戏读取）
  const instTarget = installedVersions.value[0]?.directoryName || installedVersions.value[0]?.id
  const result = await window.electronAPI.installLocalFile(filePath, target, instTarget)
  showInstallMenu.value = false
  if (result.success) {
    const projectType = target === 'shaderpacks' ? 'shader' :
                        target === 'resourcepacks' ? 'resourcepack' :
                        target === 'modpack-downloads' ? 'modpack' : 'mod'
    modsStore.addLocalInstalledFile(result.fileName || '', projectType, instTarget, result.filePath)
    modsStore.addNotification('local', result.message || t('modsUi.installComplete'), 'completed', 100, result.message)
    browserDownloadDone.value = null
  } else {
    modsStore.addNotification('local', t('modsUi.installFailed'), 'failed', 0, result.error || t('modsUi.installFailed'))
  }
}

const browserHome = () => {
  browserAction('load', 'https://modrinth.com')
}

const browserOpenFolder = () => {
  if (browserDownloadDone.value?.savePath) {
    window.electronAPI.showItemInFolder(browserDownloadDone.value.savePath)
  }
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B'
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return bytes + ' B'
}

const openExternalBrowser = () => {
  const query = searchQuery.value.trim()
  if (!query) return
  const typePath = getCurrentProjectType() === 'mod' ? 'mods' :
                   getCurrentProjectType() === 'modpack' ? 'modpacks' :
                   getCurrentProjectType() === 'shader' ? 'shader' : 'resourcepack'
  window.electronAPI.openExternal(`https://modrinth.com/${typePath}?q=${encodeURIComponent(query)}`)
}

const selectPreview = (mod: any) => {
  previewOpen.value = false
  openModDetail(mod)
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  const trimmed = val.trim()
  if (!trimmed) {
    previewOpen.value = false
    previewResults.value = []
    searchResults.value = []
    searchTotal.value = 0
    searchSession = ''
    searchConfirmedQuery.value = ''
    updateFilteredMods()
    return
  }
  if (settingsStore.settings.internetSearch && activeTab.value !== 'installed') {
    searchTimer = setTimeout(() => runPreview(trimmed), 150)
  } else {
    updateFilteredMods()
  }
})

watch(filterWatch, () => {
  updateFilteredMods()
}, { deep: true })

onMounted(async () => {
  await modsStore.initMods()
  await versionsStore.initVersions()
  updateFilteredMods()
  
  if (installedCount.value === 0 && activeTab.value === 'installed') {
    activeTab.value = 'downloadable'
    updateFilteredMods()
  }

  removeBrowserState = window.electronAPI.onBrowserState((state: any) => {
    if (state.closed) {
      browserOpen.value = false
      browserUrl.value = ''
      browserTitle.value = ''
      browserLoading.value = false
      browserError.value = ''
      browserFullscreen.value = false
      browserDownload.value = null
      browserDownloadDone.value = null
      showInstallMenu.value = false
      return
    }
    if (state.title) {
      browserTitle.value = state.title
      updateHistoryTitle(state.url, state.title)
    }
    if (state.url) {
      browserUrl.value = state.url
      recordBrowserVisit(state.url, state.title || '')
    }
    browserLoading.value = !!state.isLoading
    browserCanBack.value = !!state.canGoBack
    browserCanForward.value = !!state.canGoForward
    browserError.value = state.error || ''
    browserFullscreen.value = !!state.fullscreen
  })

  removeBrowserDownload = window.electronAPI.onBrowserDownload((data: any) => {
    browserDownload.value = data
  })

  removeBrowserDownloadDone = window.electronAPI.onBrowserDownloadDone((data: any) => {
    browserDownloadDone.value = data
    browserDownload.value = null
    setTimeout(() => { browserDownloadDone.value = null }, 6000)
  })
})

onUnmounted(() => {
  if (removeBrowserState) removeBrowserState()
  if (removeBrowserDownload) removeBrowserDownload()
  if (removeBrowserDownloadDone) removeBrowserDownloadDone()
})

const refetchCurrentTabForVersion = async () => {
  if (activeTab.value === 'installed' || isSearchActive.value) return
  const version = selectedGameVersion.value !== 'all' ? selectedGameVersion.value : undefined
  const loader = selectedLoader.value !== 'all' ? selectedLoader.value : undefined
  switch (activeTab.value) {
    case 'downloadable':
      await modsStore.fetchMods(0, 100, loader, version)
      break
    case 'modpacks':
      await modsStore.fetchModpacks(0, 100, version)
      break
    case 'shaders':
      await modsStore.fetchShaders(0, 100, version)
      break
    case 'resourcepacks':
      await modsStore.fetchResourcePacks(0, 100, version)
      break
  }
  updateFilteredMods()
}

const onGameVersionChange = async () => {
  updateFilteredMods()
  await refetchCurrentTabForVersion()
}

const onLoaderChange = async () => {
  updateFilteredMods()
  if (activeTab.value === 'downloadable') {
    const loader = selectedLoader.value !== 'all' ? selectedLoader.value : undefined
    const version = selectedGameVersion.value !== 'all' ? selectedGameVersion.value : undefined
    await modsStore.fetchMods(0, 100, loader, version)
    updateFilteredMods()
  }
}

const formatDownloads = (downloads: number) => {
  if (downloads >= 1000000) return (downloads / 1000000).toFixed(1) + 'M'
  if (downloads >= 1000) return (downloads / 1000).toFixed(1) + 'K'
  return downloads.toString()
}

const categoryStyles: Record<string, { icon: string; gradient: string; color: string }> = {
  all: { icon: '📦', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#667eea' },
  optimization: { icon: '⚡', gradient: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', color: '#11998e' },
  technology: { icon: '⚙️', gradient: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)', color: '#2193b0' },
  magic: { icon: '✨', gradient: 'linear-gradient(135deg, #cc2b5e 0%, #753a88 100%)', color: '#cc2b5e' },
  adventure: { icon: '🗺️', gradient: 'linear-gradient(135deg, #f2994a 0%, #f2c94c 100%)', color: '#f2994a' },
  worldgen: { icon: '🌍', gradient: 'linear-gradient(135deg, #11998e 0%, #56ab2f 100%)', color: '#11998e' },
  decoration: { icon: '🏠', gradient: 'linear-gradient(135deg, #e96443 0%, #904e95 100%)', color: '#e96443' },
  utility: { icon: '🔨', gradient: 'linear-gradient(135deg, #485563 0%, #29323c 100%)', color: '#485563' },
  library: { icon: '📚', gradient: 'linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%)', color: '#2c3e50' },
  mobs: { icon: '🐉', gradient: 'linear-gradient(135deg, #c31432 0%, #240b36 100%)', color: '#c31432' },
  food: { icon: '🍖', gradient: 'linear-gradient(135deg, #ff512f 0%, #f09819 100%)', color: '#ff512f' },
  storage: { icon: '📥', gradient: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)', color: '#f7971e' },
  minimap: { icon: '🧭', gradient: 'linear-gradient(135deg, #00b4db 0%, #0083b0 100%)', color: '#00b4db' },
  inventory: { icon: '🎒', gradient: 'linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)', color: '#8e2de2' },
  shader: { icon: '🌅', gradient: 'linear-gradient(135deg, #ff6a00 0%, #ee0979 100%)', color: '#ff6a00' }
}

const getModIcon = (mod: any) => {
  if (iconErrorMods.value.has(mod.id || mod.name)) {
    return getGeneratedIcon(mod.name, mod.category)
  }
  
  if (mod.icon && mod.icon.startsWith('data:')) return mod.icon
  if (mod.icon) return mod.icon
  return getGeneratedIcon(mod.name, mod.category)
}

const getGeneratedIcon = (name: string, category?: string) => {
  const style = categoryStyles[category || 'all'] || categoryStyles.all
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${style.color}"/><stop offset="100%" stop-color="${style.color}" stop-opacity="0.6"/></linearGradient></defs><rect fill="url(#g)" width="64" height="64" rx="8"/><text x="32" y="42" font-family="Arial,sans-serif" font-size="32" text-anchor="middle">${style.icon}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const handleIconError = (mod: any) => {
  iconErrorMods.value.add(mod.id || mod.name)
}

const clearIconErrors = () => {
  iconErrorMods.value.clear()
}

const switchTab = (tab: 'installed' | 'downloadable' | 'modpacks' | 'shaders' | 'resourcepacks') => {
  activeTab.value = tab
  currentPage.value = 0
  saveModsState()
  clearIconErrors()
  previewOpen.value = false
  const trimmed = searchQuery.value.trim()
  if (isSearchActive.value) {
    doSearch(searchConfirmedQuery.value || trimmed, 0)
  } else if (trimmed && settingsStore.settings.internetSearch && tab !== 'installed') {
    runPreview(trimmed)
    updateFilteredMods()
  } else {
    updateFilteredMods()
    if (selectedGameVersion.value !== 'all' && tab !== 'installed') {
      refetchCurrentTabForVersion()
    }
  }
}

const openModDetail = async (mod: any) => {
  detailMod.value = mod
  detailTab.value = 'info'
  showModDetail.value = true
  modVersions.value = []
  selectedVersion.value = null
  
  if (mod.projectId) {
    await modsStore.fetchModDetails(mod.projectId)
    const versions = await loadModVersions(mod.projectId)
    if (versions) {
      modVersions.value = versions
      // 同步到 store 中的项目对象，供安装时的版本兼容性判断使用
      const storeMod = modsStore.getModById(mod.id) || modsStore.getModById(mod.projectId)
      if (storeMod) storeMod.modVersions = versions
      if (versions.length > 0) {
        selectedVersion.value = versions[0]
      }
    }
  }
}

const closeModDetail = () => {
  showModDetail.value = false
  detailMod.value = null
  modVersions.value = []
  selectedVersion.value = null
}

const selectVersion = (version: any) => {
  selectedVersion.value = version
}

const openModpackVersionPicker = async (mod: any) => {
  modpackInstallTarget.value = { modId: mod.id, name: mod.name }
  modpackVersions.value = []
  modpackSelectedVersion.value = null
  modpackVersionLoading.value = true
  showModpackVersionModal.value = true

  if (mod.projectId) {
    const versions = await modsStore.fetchModVersions(mod.projectId)
    if (versions && versions.length > 0) {
      modpackVersions.value = versions
      // 若详情页已选过该整合包版本，则沿用；否则默认最新版
      const match = selectedVersion.value && versions.find(v => v.version_number === selectedVersion.value.version_number)
      modpackSelectedVersion.value = match || versions[0]
    }
  }
  modpackVersionLoading.value = false
}

const selectModpackVersion = (version: any) => {
  modpackSelectedVersion.value = version
}

const confirmModpackInstall = () => {
  if (!modpackInstallTarget.value) return
  const mod = modsStore.getModById(modpackInstallTarget.value.modId)
  const versionToInstall = modpackSelectedVersion.value?.version_number
  modsStore.addToDownloadQueue(modpackInstallTarget.value.modId, versionToInstall, mod?.projectType || 'modpack')
  showModpackVersionModal.value = false
  modpackInstallTarget.value = null
  modpackVersions.value = []
  modpackSelectedVersion.value = null
  showDownloadQueue.value = true
  updateFilteredMods()
  showMessage(t('modsUi.addedToQueue', { name: mod?.name || '' }), 'success')
}

const closeModpackVersionPicker = () => {
  showModpackVersionModal.value = false
  modpackInstallTarget.value = null
  modpackVersions.value = []
  modpackSelectedVersion.value = null
}

// 解析一个真正支持目标游戏版本的可下载文件版本号；没有则返回 undefined。
// 优先沿用用户已选的版本（若其文件支持目标），否则在版本列表中找 exact / 同大版本家族匹配。
const resolveDownloadVersion = async (mod: any, targetId: string): Promise<string | undefined> => {
  if (!mod?.projectId || !targetId) return undefined
  const hasFile = (v: any) => Array.isArray(v.files) && v.files.length > 0
  // 用户已选的版本若确实支持目标，直接沿用
  if (selectedVersion.value?.version_number) {
    const cached = modVersionsCache.get(mod.projectId)
    const chosen = cached?.find((v: any) => v.version_number === selectedVersion.value.version_number)
    if (chosen && hasFile(chosen) && (chosen.game_versions || []).includes(targetId)) {
      return chosen.version_number
    }
  }
  const versions = await loadModVersions(mod.projectId)
  if (!versions || versions.length === 0) return undefined
  const exact = versions.find(v => hasFile(v) && (v.game_versions || []).includes(targetId))
  if (exact) return exact.version_number
  // 同大版本家族（如 1.21.x）内视为可兼容
  const family = targetId.split('.').slice(0, 2).join('.') + '.'
  const partial = versions.find(v => hasFile(v) && (v.game_versions || []).some(
    (g: string) => g === targetId || g.startsWith(family)
  ))
  return partial?.version_number
}

const installMod = async (modId: string, e?: Event) => {
  if (e) e.stopPropagation()
  const mod = modsStore.getModById(modId)
  if (!mod) return

  // 整合包包含完整游戏，不需要预先安装原版；弹出版本选择，让玩家选择要下载的版本
  const isModpack = mod.projectType === 'modpack' || activeTab.value === 'modpacks'
  if (isModpack) {
    openModpackVersionPicker(mod)
    return
  }

  if (installedVersions.value.length === 0) {
    showMessage(t('modsUi.installGameFirst'), 'error')
    return
  }

  // 如果只有一个已安装版本，直接安装；否则弹出版本选择
  if (installedVersions.value.length === 1) {
    const inst = installedVersions.value[0]
    const targetVersion = inst.directoryName || inst.id
    // 远程项目必须解析到确实支持该游戏版本的文件，否则提示而不入队；
    // 本地文件无项目 ID，不参与版本匹配，保持原有入队行为
    const versionToInstall = mod.projectId ? await resolveDownloadVersion(mod, getModDisplayVersion(inst)) : undefined
    if (mod.projectId && !versionToInstall) {
      showMessage(t('modsUi.noCompatibleVersions'), 'error')
      return
    }
    modsStore.addToDownloadQueue(modId, versionToInstall, mod.projectType, targetVersion)
    updateFilteredMods()
    showMessage(t('modsUi.addedToQueue', { name: mod.name }), 'success')
  } else {
    // 已选的版本如果确实支持某个已安装游戏版本则沿用，否则交给项目级文件过滤决定可安装目标
    const targets = installedVersions.value.map(v => getModDisplayVersion(v))
    let chosenOk = false
    if (selectedVersion.value?.version_number && mod.projectId) {
      const cached = modVersionsCache.get(mod.projectId)
      if (cached) {
        const sel = cached.find((v: any) => v.version_number === selectedVersion.value.version_number)
        chosenOk = !!(sel && (sel.game_versions || []).some((g: string) => targets.includes(g)))
      }
    }
    modToInstall.value = { modId, version: chosenOk ? selectedVersion.value.version_number : undefined }
    modToInstallVersions.value = []
    modToInstallLoading.value = true
    showVersionSelectModal.value = true
    if (mod.projectId) {
      const versions = await loadModVersions(mod.projectId)
      if (Array.isArray(versions)) modToInstallVersions.value = versions
    }
    modToInstallLoading.value = false
  }
}

const installModWithVersion = async (modId: string, version: string) => {
  const mod = modsStore.getModById(modId)
  // 整合包包含完整游戏，不需要预先安装原版
  const isModpack = mod?.projectType === 'modpack' || activeTab.value === 'modpacks'
  if (isModpack) {
    modsStore.addToDownloadQueue(modId, version, mod?.projectType)
    showDownloadQueue.value = true
    showMessage(t('modsUi.addedToQueueShort'), 'success')
    return
  }

  if (installedVersions.value.length === 0) {
    showMessage(t('modsUi.installGameFirst'), 'error')
    return
  }

  // 如果只有一个已安装版本，直接安装；否则弹出版本选择
  if (installedVersions.value.length === 1) {
    const inst = installedVersions.value[0]
    const targetVersion = inst.directoryName || inst.id
    const targetId = getModDisplayVersion(inst)
    // 用户明确点的版本若其文件支持目标游戏版本则直接用；否则解析兼容版本
    let versionToInstall = version
    if (mod?.projectId) {
      const list = await loadModVersions(mod.projectId)
      const chosen = list?.find((v: any) => v.version_number === version)
      const chosenOk = !!chosen && Array.isArray(chosen.files) && chosen.files.length > 0 &&
        (chosen.game_versions || []).includes(targetId)
      if (!chosenOk) {
        versionToInstall = await resolveDownloadVersion(mod, targetId) || ''
      }
    }
    if (!versionToInstall) {
      showMessage(t('modsUi.noCompatibleVersions'), 'error')
      return
    }
    modsStore.addToDownloadQueue(modId, versionToInstall, mod?.projectType, targetVersion)
    showDownloadQueue.value = true
    showMessage(t('modsUi.addedToQueueShort'), 'success')
  } else {
    modToInstall.value = { modId, version }
    modToInstallVersions.value = []
    modToInstallLoading.value = true
    showVersionSelectModal.value = true
    if (mod?.projectId) {
      const versions = await loadModVersions(mod.projectId)
      if (Array.isArray(versions)) modToInstallVersions.value = versions
    }
    modToInstallLoading.value = false
  }
}

// 从版本选择弹窗确认安装
const confirmInstallWithVersion = async (targetVersionId: string) => {
  if (!modToInstall.value) return
  const mod = modsStore.getModById(modToInstall.value.modId)
  if (!mod) return

  const targetInst = installedVersions.value.find(v => (v.directoryName || v.id) === targetVersionId)
  const targetId = targetInst ? getModDisplayVersion(targetInst) : targetVersionId

  // 本地文件无项目 ID：版本匹配不适用，保持原有入队行为（下载阶段会给出具体错误）
  if (!mod.projectId) {
    modsStore.addToDownloadQueue(modToInstall.value.modId, modToInstall.value.version, mod.projectType, targetVersionId)
    showVersionSelectModal.value = false
    modToInstall.value = null
    modToInstallVersions.value = []
    modToInstallLoading.value = false
    updateFilteredMods()
    showMessage(t('modsUi.addedToQueue', { name: mod.name }), 'success')
    return
  }

  // 确认真正要下载的文件版本：优先沿用明确选择的版本（且其文件必须支持所选目标），
  // 否则解析一个支持 targetId 的具体版本；都没有 → 拒绝安装
  let versionToInstall = modToInstall.value.version
  if (mod.projectId) {
    const versions = (Array.isArray(modToInstallVersions.value) && modToInstallVersions.value.length)
      ? modToInstallVersions.value
      : await loadModVersions(mod.projectId)
    if (versionToInstall) {
      const chosen = versions?.find((v: any) => v.version_number === versionToInstall)
      const chosenOk = !!chosen && Array.isArray(chosen.files) && chosen.files.length > 0 &&
        (chosen.game_versions || []).includes(targetId)
      if (!chosenOk) versionToInstall = undefined
    }
    if (!versionToInstall) {
      const hit = versions?.find((v: any) =>
        Array.isArray(v.files) && v.files.length > 0 && (v.game_versions || []).includes(targetId)
      )
      versionToInstall = hit?.version_number
    }
  }
  if (!versionToInstall) {
    showMessage(t('modsUi.noCompatibleVersions'), 'error')
    return
  }

  modsStore.addToDownloadQueue(modToInstall.value.modId, versionToInstall, mod.projectType, targetVersionId)
  showVersionSelectModal.value = false
  modToInstall.value = null
  modToInstallVersions.value = []
  modToInstallLoading.value = false
  updateFilteredMods()
  showMessage(t('modsUi.addedToQueue', { name: mod.name }), 'success')
}

const closeVersionSelectModal = () => {
  showVersionSelectModal.value = false
  modToInstall.value = null
  modToInstallVersions.value = []
  modToInstallLoading.value = false
}

const deleteMod = async (modId: string, e?: Event) => {
  if (e) e.stopPropagation()
  const mod = modsStore.getModById(modId)
  await modsStore.uninstallMod(modId)
  updateFilteredMods()
  showMessage(t('modsUi.deleted', { name: mod?.name || '' }), 'success')
}

const cancelModDownload = (modId: string, e?: Event) => {
  if (e) e.stopPropagation()
  modsStore.cancelDownload(modId)
  updateFilteredMods()
}

const toggleMod = async (modId: string, e?: Event) => {
  if (e) e.stopPropagation()
  const mod = modsStore.getModById(modId)
  if (!mod?.installed) return

  const next = await modsStore.toggleMod(modId)
  if (next == null) return
  showMessage(next ? t('modsUi.namedEnabled', { name: mod.name }) : t('modsUi.namedDisabled', { name: mod.name }), 'success')
}

const isModEnabled = (mod: any): boolean => {
  if (!mod.installed) return false
  return mod.enabled
}

const isModInstalling = (modId: string) => {
  return modsStore.downloadQueue.some(q => q.modId === modId && q.status === 'downloading')
}

const getInstallProgress = (modId: string) => {
  const queueItem = modsStore.downloadQueue.find(q => q.modId === modId)
  return queueItem?.progress || 0
}

const showMessage = (msg: string, type: 'success' | 'error') => {
  message.value = msg
  messageType.value = type
  setTimeout(() => { message.value = '' }, 3000)
}



const goToPage = async (page: number) => {
  if (isLoadingMore.value || page < 0 || page >= totalPages.value) return
  
  isLoadingMore.value = true
  currentPage.value = page
  saveModsState()
  clearIconErrors()
  const projectType = getCurrentProjectType()
  
  if (isSearchActive.value) {
    await doSearch(searchQuery.value, page)
  } else {
    await modsStore.loadMoreMods(projectType, page, 100, selectedGameVersion.value !== 'all' ? selectedGameVersion.value : undefined)
  }  
  isLoadingMore.value = false
  updateFilteredMods()
}

const jumpToPage = () => {
  if (jumpPage.value && jumpPage.value > 0 && jumpPage.value <= totalPages.value) {
    goToPage(jumpPage.value - 1)
  }
}

const syncMods = async () => {
  localStorage.removeItem('zncl-mods')
  modsStore.mods = []
  modsStore.modpacks = []
  modsStore.shaders = []
  modsStore.resourcePacks = []
  previewOpen.value = false
  searchResults.value = []
  searchTotal.value = 0
  searchSession = ''
  searchConfirmedQuery.value = ''
  await modsStore.initMods(true)
  updateFilteredMods()
  showMessage(t('modsUi.modListSynced'), 'success')
}

const clearFilters = () => {
  searchQuery.value = ''
  selectedGameVersion.value = 'all'
  selectedLoader.value = 'all'
  selectedCategory.value = 'all'
  selectedSource.value = 'all'
  sortBy.value = 'downloads'
  updateFilteredMods()
}

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) {
    await installLocalFiles(files)
  }
  if (fileInputRef.value) fileInputRef.value.value = ''
}

const onDragOver = (e: DragEvent) => {
  e.preventDefault()
  dragOver.value = true
}

const onDragLeave = (e: DragEvent) => {
  e.preventDefault()
  dragOver.value = false
}

const handleDrop = async (e: DragEvent) => {
  e.preventDefault()
  dragOver.value = false

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  await installLocalFiles(files)
}

// 根据当前 Tab 判断本地文件应安装到哪个目录类型
const installTargetFromTab = (): { target: string; projectType: string } => {
  if (activeTab.value === 'shaders') return { target: 'shaderpacks', projectType: 'shader' }
  if (activeTab.value === 'resourcepacks') return { target: 'resourcepacks', projectType: 'resourcepack' }
  if (activeTab.value === 'modpacks') return { target: 'modpack-downloads', projectType: 'modpack' }
  return { target: 'mods', projectType: 'mod' }
}

// 真正安装本地选择/拖入的文件（此前只弹提示不落地）
const installLocalFiles = async (files: FileList | File[]) => {
  if (!files || files.length === 0) return
  if (installedVersions.value.length === 0) {
    showMessage(t('modsUi.installGameFirst'), 'error')
    return
  }
  const { target, projectType } = installTargetFromTab()
  // 优先安装到已安装的游戏版本的对应子目录（否则全局目录不会被版本隔离的游戏读取）
  const instTarget = installedVersions.value[0]?.directoryName || installedVersions.value[0]?.id
  let ok = 0
  let fail = 0
  for (let i = 0; i < (files as any).length; i++) {
    const f = (files as any)[i]
    const filePath = typeof f?.path === 'string' && f.path ? f.path : ''
    if (!filePath) continue
    try {
      const result = await window.electronAPI.installLocalFile(filePath, target, instTarget)
      if (result.success && result.fileName) {
        modsStore.addLocalInstalledFile(result.fileName, projectType, instTarget, result.filePath)
        ok++
      } else {
        fail++
      }
    } catch (e) {
      fail++
    }
  }
  if (ok > 0) {
    showMessage(t('modsUi.installFromFileDone', { n: ok }), 'success')
    updateFilteredMods()
  }
  if (fail > 0) showMessage(t('modsUi.installFailed'), 'error')
}

const toggleSelectMode = () => {
  isSelectMode.value = !isSelectMode.value
  if (!isSelectMode.value) {
    selectedMods.value.clear()
  }
}

const toggleModSelection = (modId: string) => {
  if (selectedMods.value.has(modId)) {
    selectedMods.value.delete(modId)
  } else {
    selectedMods.value.add(modId)
  }
  selectedMods.value = new Set(selectedMods.value)
}

const isModSelected = (modId: string) => selectedMods.value.has(modId)

const selectAllMods = () => {
  if (selectedMods.value.size === filteredMods.value.length) {
    selectedMods.value.clear()
  } else {
    selectedMods.value = new Set(filteredMods.value.map(m => m.id))
  }
  selectedMods.value = new Set(selectedMods.value)
}

const batchEnable = () => {
  selectedMods.value.forEach(modId => {
    const mod = modsStore.getModById(modId)
    if (mod?.installed) {
      modsStore.toggleMod(modId)
    }
  })
  selectedMods.value.clear()
  isSelectMode.value = false
  updateFilteredMods()
  showMessage(t('modsUi.batchEnabled'), 'success')
}

const batchDisable = async () => {
  await Promise.all([...selectedMods.value].map(modId => modsStore.toggleMod(modId)))
  selectedMods.value.clear()
  isSelectMode.value = false
  updateFilteredMods()
  showMessage(t('modsUi.batchDisabled'), 'success')
}

const batchDelete = async () => {
  for (const modId of selectedMods.value) {
    await modsStore.uninstallMod(modId)
  }
  selectedMods.value.clear()
  isSelectMode.value = false
  updateFilteredMods()
  showMessage(t('modsUi.batchDeleted'), 'success')
}

const getCategoryCount = (categoryId: string) => {
  if (categoryId === 'all') {
    return activeTab.value === 'installed'
      ? installedCount.value
      : filteredMods.value.length
  }
  return filteredMods.value.filter(m => m.category === categoryId).length
}

const handleCategoryClick = (categoryId: string) => {
  selectedCategory.value = categoryId
  updateFilteredMods()
}
</script>

<template>
  <div class="mod-manager" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave" @drop="handleDrop">
    <div class="main-content">
      <div class="header">
        <div class="header-left">
          <h2>{{ t('modsUi.title') }}</h2>
          <span class="mod-count">{{ t('modsUi.projectCount', { n: filteredMods.length }) }}</span>
        </div>
        <div class="header-right">
          <div class="view-toggle">
            <button :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'" :title="t('modsUi.gridView')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </button>
            <button :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'" :title="t('modsUi.listView')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>

          <button class="btn-select" :class="{ active: isSelectMode }" @click="toggleSelectMode">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            {{ isSelectMode ? t('modsUi.cancel') : t('modsUi.select') }}
          </button>

          <input
            type="file"
            ref="fileInputRef"
            accept=".jar,.zip,.mrpack"
            multiple
            style="display: none"
            @change="handleFileSelect"
          />
          <button class="btn-primary" @click="fileInputRef?.click()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {{ t('modsUi.installFromFile') }}
          </button>
          <button class="btn-icon" @click="syncMods" :disabled="modsStore.isLoading" :title="t('modsUi.refresh')">
            <svg :class="{ spinning: modsStore.isLoading }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="filters-row">
        <div class="filter-group">
          <label>{{ t('modsUi.loader') }}</label>
          <select v-model="selectedLoader" class="filter-select-lg" @change="onLoaderChange">
            <option value="all">{{ t('modsUi.all') }}</option>
            <option value="fabric">Fabric</option>
            <option value="forge">Forge</option>
            <option value="neoforge">NeoForge</option>
            <option value="quilt">Quilt</option>
          </select>
        </div>
        <div class="filter-group">
          <label>{{ t('modsUi.gameVersion') }}</label>
          <select v-model="selectedGameVersion" class="filter-select-lg" @change="onGameVersionChange">
            <option value="all">{{ t('modsUi.all') }}</option>
            <option v-for="ver in availableGameVersions" :key="ver" :value="ver">{{ ver }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label>{{ t('modsUi.category') }}</label>
          <select v-model="selectedCategory" class="filter-select-lg" @change="updateFilteredMods">
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.icon }} {{ cat.name }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label>{{ t('modsUi.sort') }}</label>
          <select v-model="sortBy" class="filter-select-lg" @change="updateFilteredMods">
            <option value="downloads">{{ t('modsUi.sortDownloads') }}</option>
            <option value="name">{{ t('modsUi.sortName') }}</option>
            <option value="date">{{ t('modsUi.sortUpdated') }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label>{{ t('modsUi.source') }}</label>
          <select v-model="selectedSource" class="filter-select-lg" @change="updateFilteredMods">
            <option value="all">{{ t('modsUi.all') }}</option>
            <option value="modrinth">Modrinth</option>
            <option value="curseforge">CurseForge</option>
            <option value="local">{{ t('modsUi.sourceLocal') }}</option>
          </select>
        </div>
        <button v-if="hasActiveFilters" class="btn-clear-filters" @click="clearFilters">
          {{ t('modsUi.clearFilters') }}
        </button>
      </div>

      <div class="toolbar">
        <div class="search-box-wrap">
          <div class="search-box">
            <button class="search-submit" :title="t('modsUi.search')" @mousedown.prevent @click="confirmSearch">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="t('modsUi.searchPlaceholder')"
              @input="debouncedUpdate"
              @keydown.enter="confirmSearch"
              @keydown.esc="previewOpen = false"
              @blur="previewOpen = false"
            />
            <span v-if="isSearching" class="search-spinner"></span>
            <button v-if="searchQuery" class="browser-search" :title="t('modsUi.searchInBuiltinBrowser')" @mousedown.prevent @click="browserSearch">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </button>
            <button v-if="searchQuery" class="clear" @click="searchQuery = ''; updateFilteredMods()">×</button>
          </div>

          <div v-if="previewOpen && isPreviewing" class="search-preview preview-loading">
            <div class="loader-cubes small">
              <div class="loader-cube"></div>
              <div class="loader-cube"></div>
              <div class="loader-cube"></div>
            </div>
            <span>{{ t('modsUi.loadingSearch', { source: SEARCH_SOURCE, query: searchQuery }) }}...</span>
          </div>

          <div v-else-if="previewOpen && previewResults.length > 0" class="search-preview">
            <div class="preview-header">
              <span class="preview-source">🌐 {{ SEARCH_SOURCE }} · {{ SEARCH_SOURCE_URL }}</span>
              <span class="preview-query">{{ t('modsUi.previewQuery', { query: searchQuery }) }}</span>
            </div>
            <div v-for="mod in previewResults" :key="mod.id" class="preview-item" @mousedown.prevent="selectPreview(mod)">
              <img class="preview-icon" :src="getModIcon(mod)" :alt="mod.name" loading="lazy" @error="handleIconError(mod)"/>
              <div class="preview-info">
                <span class="preview-name">{{ mod.name }}</span>
                <span class="preview-author">{{ mod.author }} · {{ formatDownloads(mod.downloads) }} {{ t('modsUi.downloadsWord') }}</span>
              </div>
              <span v-for="loader in mod.loaders?.slice(0, 2)" :key="loader" class="loader-tag" :class="loader">{{ loader }}</span>
            </div>
            <div class="preview-footer" @mousedown.prevent="confirmSearch">
              {{ t('modsUi.searchAllHint', { query: searchQuery }) }}
            </div>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button :class="{ active: activeTab === 'installed' }" @click="switchTab('installed')">
          {{ t('modsUi.tabInstalled') }}
          <span class="badge">{{ installedCount }}</span>
        </button>
        <button :class="{ active: activeTab === 'downloadable' }" @click="switchTab('downloadable')">
          {{ t('modsUi.tabMods') }}
        </button>
        <button :class="{ active: activeTab === 'modpacks' }" @click="switchTab('modpacks')">
          {{ t('modsUi.tabModpacks') }}
        </button>
        <button :class="{ active: activeTab === 'shaders' }" @click="switchTab('shaders')">
          {{ t('modsUi.tabShaders') }}
        </button>
        <button :class="{ active: activeTab === 'resourcepacks' }" @click="switchTab('resourcepacks')">
          {{ t('modsUi.tabResourcePacks') }}
        </button>
      </div>

      <div v-if="isSearchActive" class="search-hint">
        <span class="search-source" :title="t('modsUi.dataSourcePage')">🌐 {{ SEARCH_SOURCE }}<em>· {{ SEARCH_SOURCE_URL }}</em></span>
        <template v-if="isSearching">
          <span class="search-spinner"></span>
          <span class="search-status">{{ t('modsUi.searchingQuery', { query: searchConfirmedQuery }) }}{{ currentPage > 0 ? t('modsUi.pageSuffix', { n: currentPage + 1 }) : '' }}...</span>
        </template>
        <template v-else-if="filteredMods.length > 0">
          <span class="search-status">{{ t('modsUi.resultsFor', { query: searchConfirmedQuery, n: searchTotal }) }}</span>
        </template>
        <template v-else>
          <span class="search-status">{{ t('modsUi.noResultsFor', { query: searchConfirmedQuery }) }}</span>
        </template>
        <button class="browser-search-hint" :title="t('modsUi.builtinBrowserSearchTitle')" @click="browserSearch">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          {{ t('modsUi.builtinBrowser') }}
        </button>
        <button class="browser-search-hint external" :title="t('modsUi.openExternalTitle')" @click="openExternalBrowser">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>
          </svg>
          {{ t('modsUi.externalBrowser') }}
        </button>
      </div>

      <div v-if="isSelectMode && selectedMods.size > 0" class="batch-actions">
        <span class="selected-count">{{ t('modsUi.selectedCount', { n: selectedMods.size }) }}</span>
        <button class="batch-btn enable" @click="batchEnable">{{ t('modsUi.enable') }}</button>
        <button class="batch-btn disable" @click="batchDisable">{{ t('modsUi.disable') }}</button>
        <button class="batch-btn delete" @click="batchDelete">{{ t('modsUi.delete') }}</button>
        <button class="batch-btn select-all" @click="selectAllMods">
          {{ selectedMods.size === filteredMods.length ? t('modsUi.deselectAll') : t('modsUi.selectAll') }}
        </button>
      </div>

      <div v-if="message" class="message" :class="messageType">{{ message }}</div>

      <div v-if="dragOver" class="drag-overlay">
        <div class="drag-content">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>{{ t('modsUi.dropToInstall') }}</span>
        </div>
      </div>

      <div class="mods-container">
        <div v-if="viewMode === 'grid'" class="mods-grid">
          <div
            v-for="mod in filteredMods"
            :key="mod.id"
            v-memo="[mod.id, mod.installed, isModEnabled(mod), isModSelected(mod.id), isModInstalling(mod.id)]"
            class="mod-card"
            :class="{
              installed: mod.installed,
              disabled: mod.installed && !isModEnabled(mod),
              selected: isModSelected(mod.id)
            }"
            @click="isSelectMode ? toggleModSelection(mod.id) : openModDetail(mod)"
          >
            <div v-if="isSelectMode" class="checkbox" :class="{ checked: isModSelected(mod.id) }">
              <svg v-if="isModSelected(mod.id)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <div class="mod-icon">
              <img :src="getModIcon(mod)" :alt="mod.name" loading="lazy" @error="handleIconError(mod)"/>
              <span v-if="mod.installed" class="status-badge" :class="{ enabled: isModEnabled(mod) }">
                {{ isModEnabled(mod) ? 'ON' : 'OFF' }}
              </span>
            </div>

            <div class="mod-info">
              <h3 class="mod-name">{{ mod.name }}</h3>
              <p class="mod-author">{{ mod.author }}</p>
              <div class="mod-meta">
                <span class="downloads">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {{ formatDownloads(mod.downloads) }}
                </span>
                <span v-for="loader in mod.loaders" :key="loader" class="loader-tag" :class="loader">{{ loader }}</span>
              </div>
            </div>

            <div class="mod-actions" @click.stop>
              <template v-if="!mod.installed && !isModInstalling(mod.id)">
                <button class="btn-install" @click="installMod(mod.id)">{{ t('modsUi.install') }}</button>
              </template>
              <template v-else-if="isModInstalling(mod.id)">
                <div class="install-progress">
                  <div class="progress-bar">
                    <div class="progress" :style="{ width: getInstallProgress(mod.id) + '%' }"></div>
                  </div>
                  <span>{{ getInstallProgress(mod.id) }}%</span>
                  <button class="btn-cancel-small" @click.stop="cancelModDownload(mod.id)" :title="t('modsUi.cancel')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </template>
              <template v-else>
                <button class="btn-toggle" :class="{ on: isModEnabled(mod) }" @click="toggleMod(mod.id)">
                  {{ isModEnabled(mod) ? t('modsUi.disable') : t('modsUi.enable') }}
                </button>
                <button class="btn-reinstall" @click="installMod(mod.id)" :title="t('modsUi.reinstall')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                </button>
              </template>
            </div>
          </div>
        </div>

        <div v-else class="mods-list">
          <div
            v-for="mod in filteredMods"
            :key="mod.id"
            v-memo="[mod.id, mod.installed, isModEnabled(mod), isModSelected(mod.id), isModInstalling(mod.id)]"
            class="mod-row"
            :class="{
              installed: mod.installed,
              disabled: mod.installed && !isModEnabled(mod),
              selected: isModSelected(mod.id)
            }"
            @click="isSelectMode ? toggleModSelection(mod.id) : openModDetail(mod)"
          >
            <div v-if="isSelectMode" class="checkbox" :class="{ checked: isModSelected(mod.id) }">
              <svg v-if="isModSelected(mod.id)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <div class="mod-icon-small">
              <img :src="getModIcon(mod)" :alt="mod.name" loading="lazy" @error="handleIconError(mod)"/>
            </div>

            <div class="mod-name-cell">
              <span class="name">{{ mod.name }}</span>
              <span class="author">by {{ mod.author }}</span>
            </div>

            <div class="mod-downloads">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {{ formatDownloads(mod.downloads) }}
            </div>

            <div class="mod-loader">
              <template v-if="mod.loaders && mod.loaders.length > 0">
                <span v-for="loader in mod.loaders" :key="loader" class="loader-tag" :class="loader">{{ loader }}</span>
              </template>
              <span v-else class="loader-tag generic">{{ t('modsUi.generic') }}</span>
            </div>

            <div class="mod-status">
              <span v-if="mod.installed" class="status-badge" :class="{ enabled: isModEnabled(mod) }">
                {{ isModEnabled(mod) ? t('modsUi.enabled') : t('modsUi.disabled') }}
              </span>
              <span v-else class="status-badge not-installed">{{ t('modsUi.notInstalled') }}</span>
            </div>

            <div class="mod-actions" @click.stop>
              <template v-if="!mod.installed && !isModInstalling(mod.id)">
                <button class="btn-install" @click="installMod(mod.id)">{{ t('modsUi.install') }}</button>
              </template>
              <template v-else-if="isModInstalling(mod.id)">
                <div class="install-progress">
                  <div class="progress-bar">
                    <div class="progress" :style="{ width: getInstallProgress(mod.id) + '%' }"></div>
                  </div>
                  <span>{{ getInstallProgress(mod.id) }}%</span>
                  <button class="btn-cancel-small" @click.stop="cancelModDownload(mod.id)" :title="t('modsUi.cancel')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </template>
              <template v-else>
                <button class="btn-toggle" :class="{ on: isModEnabled(mod) }" @click="toggleMod(mod.id)">
                  {{ isModEnabled(mod) ? t('modsUi.disable') : t('modsUi.enable') }}
                </button>
                <button class="btn-reinstall" @click="installMod(mod.id)" :title="t('modsUi.reinstall')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                </button>
              </template>
            </div>
          </div>
        </div>

        <div v-if="isLoadingMore || (modsStore.isLoading && filteredMods.length === 0)" class="loading">
          <div class="loader-cubes">
            <div class="loader-cube"></div>
            <div class="loader-cube"></div>
            <div class="loader-cube"></div>
          </div>
          <div class="loading-bar"><div class="loading-bar-fill"></div></div>
          <span class="loading-text">{{ currentLoadingText }}</span>
          <span class="loading-source">{{ t('modsUi.dataSource', { source: SEARCH_SOURCE, url: SEARCH_SOURCE_URL }) }}</span>
        </div>

        <div v-if="!isLoadingMore && (activeTab === 'downloadable' || activeTab === 'modpacks' || activeTab === 'shaders' || activeTab === 'resourcepacks')" class="pagination">
          <button 
            class="pagination-btn" 
            :disabled="currentPage <= 0" 
            @click="goToPage(currentPage - 1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span class="pagination-info">
            {{ t('modsUi.pageNumber', { n: currentPage + 1 }) }}
          </span>
          <button 
            class="pagination-btn" 
            @click="goToPage(currentPage + 1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        <div v-if="filteredMods.length === 0 && !modsStore.isLoading && !isSearchActive" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <p>{{ activeTab === 'installed' ? t('modsUi.noInstalledProjects') : t('modsUi.noMatchingProjects') }}</p>
        </div>
      </div>
    </div>

    <div v-if="showModDetail && detailMod" class="modal-overlay" @click="closeModDetail">
      <div class="modal mod-detail-modal" @click.stop>
        <div class="modal-header">
          <img :src="getModIcon(detailMod)" :alt="detailMod.name" class="modal-icon" @error="handleIconError(detailMod)"/>
          <div class="modal-title">
            <h2>{{ detailMod.name }}</h2>
            <p>by {{ detailMod.author }}</p>
          </div>
          <button class="modal-close" @click="closeModDetail">×</button>
        </div>
        
        <div class="modal-tabs">
          <button :class="{ active: detailTab === 'info' }" @click="detailTab = 'info'">{{ t('modsUi.info') }}</button>
          <button :class="{ active: detailTab === 'versions' }" @click="detailTab = 'versions'">{{ t('modsUi.versions') }}</button>
          <button :class="{ active: detailTab === 'changelog' }" @click="detailTab = 'changelog'">{{ t('modsUi.changelog') }}</button>
        </div>
        
        <div class="modal-body">
          <div v-if="detailTab === 'info'" class="tab-content">
            <div class="info-section">
              <h3>{{ t('modsUi.description') }}</h3>
              <p class="modal-desc">{{ detailMod.description || t('modsUi.noDescription') }}</p>
            </div>
            
            <div class="info-section">
              <h3>{{ t('modsUi.basicInfo') }}</h3>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">{{ t('modsUi.downloadsLabel') }}</span>
                  <span class="info-value">{{ formatDownloads(detailMod.downloads) }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('modsUi.gameVersion') }}</span>
                  <span class="info-value">{{ detailSupportedVersions.length ? detailSupportedVersions.join(', ') : t('modsUi.unknown') }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('modsUi.loader') }}</span>
                  <span class="info-value">{{ detailMod.loader || t('modsUi.generic') }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('modsUi.license') }}</span>
                  <span class="info-value">{{ detailMod.license || t('modsUi.unknown') }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('modsUi.installedVersion') }}</span>
                  <span class="info-value">{{ detailMod.installedVersion || t('modsUi.notInstalled') }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('modsUi.fileSize') }}</span>
                  <span class="info-value">{{ detailMod.fileSize || t('modsUi.unknown') }}</span>
                </div>
              </div>
            </div>
            
            <div class="info-section">
              <h3>{{ t('modsUi.tags') }}</h3>
              <div v-if="detailMod.tags?.length" class="modal-tags">
                <span v-for="tag in detailMod.tags" :key="tag" class="tag">{{ tag }}</span>
              </div>
              <p v-else>{{ t('modsUi.noTags') }}</p>
            </div>
            
            <div v-if="detailMod.screenshots?.length" class="info-section">
              <h3>{{ t('modsUi.screenshots') }}</h3>
              <div class="screenshot-gallery">
                <img v-for="(img, idx) in detailMod.screenshots.slice(0, 4)" :key="idx" :src="img" class="screenshot" loading="lazy"/>
              </div>
            </div>
          </div>
          
          <div v-if="detailTab === 'versions'" class="tab-content">
            <div v-if="modVersions.length > 0" class="versions-list">
              <div 
                v-for="version in modVersions" 
                :key="version.id" 
                class="version-item"
                :class="{ selected: selectedVersion?.id === version.id }"
                @click="selectVersion(version)"
              >
                <div class="version-header">
                  <span class="version-name">{{ version.name }}</span>
                  <span class="version-number">{{ version.version_number }}</span>
                </div>
                <div class="version-info">
                  <span v-for="gv in version.game_versions?.slice(0, 3)" :key="gv" class="version-tag">{{ gv }}</span>
                  <span v-for="loader in version.loaders?.slice(0, 2)" :key="loader" class="version-tag loader">{{ loader }}</span>
                </div>
                <div v-if="version.files?.length" class="version-files">
                  <span class="file-name">{{ version.files[0].filename }}</span>
                  <span class="file-size">{{ (version.files[0].size / (1024 * 1024)).toFixed(1) }} MB</span>
                </div>
                <button v-if="!detailMod.installed" class="version-install-btn" @click.stop="installModWithVersion(detailMod.id, version.version_number)">
                  {{ t('modsUi.install') }}
                </button>
              </div>
            </div>
            <div v-else class="empty-state">
              <p>{{ t('modsUi.noVersionInfo') }}</p>
            </div>
          </div>
          
          <div v-if="detailTab === 'changelog'" class="tab-content">
            <div v-if="selectedVersion?.changelog" class="changelog-content">
              <div v-html="selectedVersion.changelog"></div>
            </div>
            <div v-else-if="modVersions.length > 0">
              <p>{{ t('modsUi.selectVersionForChangelog') }}</p>
            </div>
            <div v-else class="empty-state">
              <p>{{ t('modsUi.noChangelog') }}</p>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <template v-if="!detailMod.installed && !isModInstalling(detailMod.id)">
            <button class="btn-primary" @click="installMod(detailMod.id)">
              {{ selectedVersion ? t('modsUi.installVersionNamed', { v: selectedVersion.version_number }) : t('modsUi.install') }}
            </button>
          </template>
          <template v-else-if="isModInstalling(detailMod.id)">
            <div class="install-progress wide">
              <div class="progress-bar">
                <div class="progress" :style="{ width: getInstallProgress(detailMod.id) + '%' }"></div>
              </div>
              <span>{{ getInstallProgress(detailMod.id) }}%</span>
              <button class="btn-cancel-small" @click.stop="cancelModDownload(detailMod.id)" :title="t('modsUi.cancel')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </template>
          <template v-else>
            <button class="btn-toggle" :class="{ on: isModEnabled(detailMod) }" @click="toggleMod(detailMod.id)">
              {{ isModEnabled(detailMod) ? t('modsUi.disable') : t('modsUi.enable') }}
            </button>
            <button class="btn-primary" @click="installMod(detailMod.id)">{{ t('modsUi.reinstall') }}</button>
          </template>
        </div>
      </div>
    </div>
    
    <div v-if="showDownloadQueue" class="modal-overlay" @click="showDownloadQueue = false">
      <div class="modal download-queue-modal" @click.stop>
        <div class="modal-header">
          <h2>{{ t('modsUi.downloadQueue') }}</h2>
          <button class="modal-close" @click="showDownloadQueue = false">×</button>
        </div>
        <div class="modal-body">
          <div v-if="modsStore.downloadQueue.length > 0" class="download-list">
            <div v-for="item in modsStore.downloadQueue" :key="item.modId" class="download-item">
              <div class="download-info">
                <span class="download-name">{{ item.modName }}</span>
                <span v-if="item.version" class="download-version">{{ item.version }}</span>
              </div>
              <div class="download-status">
                <span :class="item.status">{{ item.status === 'downloading' ? t('modsUi.downloading') : item.status === 'completed' ? t('modsUi.done') : item.status === 'cancelled' ? t('modsUi.cancelled') : t('modsUi.failed') }}</span>
              </div>
              <div class="download-progress">
                <div class="progress-bar">
                  <div class="progress" :style="{ width: item.progress + '%' }"></div>
                </div>
                <span>{{ item.progress }}%</span>
              </div>
              <p v-if="item.status === 'failed' && item.error" class="download-error">{{ item.error }}</p>
              <button v-if="item.status === 'downloading'" class="cancel-btn" @click="modsStore.cancelDownload(item.modId)">{{ t('modsUi.cancel') }}</button>
            </div>
          </div>
          <div v-else class="empty-state">
            <p>{{ t('modsUi.downloadQueueEmpty') }}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="showDownloadQueue = false">{{ t('modsUi.close') }}</button>
        </div>
      </div>
    </div>
    
    <!-- 版本选择弹窗（版本隔离） -->
    <div v-if="showVersionSelectModal" class="modal-overlay" @click="closeVersionSelectModal">
      <div class="modal version-select-modal" @click.stop>
        <div class="modal-header">
          <h2>{{ t('modsUi.selectInstallVersion') }}</h2>
          <button class="modal-close" @click="closeVersionSelectModal">×</button>
        </div>
        <div class="modal-body">
          <p class="version-select-desc">{{ t('modsUi.selectGameVersionForInstall') }}</p>
          <div v-if="modToInstallLoading" class="modpack-version-loading">
            <span class="spinner"></span>
            {{ t('modsUi.loadingVersionList') }}
          </div>
          <div v-else-if="compatibleVersions.length === 0" class="version-list-empty">
            <p>{{ t('modsUi.noCompatibleVersions') }}</p>
            <p class="version-select-hint">{{ t('modsUi.installCompatibleVersionHint') }}</p>
          </div>
          <div v-else class="version-list">
            <div
              v-for="version in compatibleVersions"
              :key="version.id + (version.directoryName || '')"
              class="version-item-select"
              @click="confirmInstallWithVersion(version.directoryName || version.id)"
            >
              <div class="version-info-row">
                <span class="version-display-name">{{ version.displayName || version.id }}</span>
                <span class="version-id">{{ version.id }}</span>
              </div>
              <span v-if="version.loader" class="version-loader">{{ version.loader }}</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closeVersionSelectModal">{{ t('modsUi.cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- 整合包版本选择弹窗 -->
    <div v-if="showModpackVersionModal" class="modal-overlay" @click="closeModpackVersionPicker">
      <div class="modal version-select-modal" @click.stop>
        <div class="modal-header">
          <h2>{{ t('modsUi.selectModpackVersion') }}</h2>
          <button class="modal-close" @click="closeModpackVersionPicker">×</button>
        </div>
        <div class="modal-body">
          <p class="version-select-desc">
            {{ t('modsUi.selectVersionToDownload') }}
            <span v-if="modpackInstallTarget" class="modpack-name">{{ modpackInstallTarget.name }}</span>
          </p>
          <div v-if="modpackVersionLoading" class="modpack-version-loading">
            <span class="spinner"></span>
            {{ t('modsUi.loadingVersionList') }}
          </div>
          <div v-else-if="modpackVersions.length > 0" class="version-list">
            <div
              v-for="version in modpackVersions"
              :key="version.id"
              class="version-item-select"
              :class="{ selected: modpackSelectedVersion?.id === version.id }"
              @click="selectModpackVersion(version)"
            >
              <div class="version-info-row">
                <span class="version-display-name">{{ version.version_number }}</span>
                <span class="version-id">
                  <template v-if="version.game_versions && version.game_versions.length">
                    <span v-for="gv in version.game_versions.slice(0, 3)" :key="gv" class="version-tag">{{ gv }}</span>
                  </template>
                  <template v-if="version.loaders && version.loaders.length">
                    <span v-for="loader in version.loaders.slice(0, 2)" :key="loader" class="version-tag loader">{{ loader }}</span>
                  </template>
                </span>
                <span v-if="version.files && version.files.length" class="version-file-size">
                  {{ (version.files[0].size / (1024 * 1024)).toFixed(1) }} MB
                </span>
              </div>
              <span v-if="version.name" class="version-desc">{{ version.name }}</span>
            </div>
          </div>
          <div v-else class="empty-state">
            <p>{{ t('modsUi.noAvailableVersions') }}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closeModpackVersionPicker">{{ t('modsUi.cancel') }}</button>
          <button class="btn-primary" :disabled="!modpackSelectedVersion" @click="confirmModpackInstall">
            {{ modpackSelectedVersion ? t('modsUi.downloadVersionNamed', { v: modpackSelectedVersion.version_number }) : t('modsUi.selectVersion') }}
          </button>
        </div>
      </div>
    </div>

    <button
      v-if="modsStore.downloadQueue.length > 0"
      class="download-queue-btn"
      @click="showDownloadQueue = true"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>{{ modsStore.downloadQueue.length }}</span>
    </button>

    <div class="notification-container">
      <TransitionGroup name="notification">
        <div
          v-for="notif in modsStore.notifications"
          :key="notif.id"
          class="notification-toast"
          :class="notif.type"
        >
          <div class="notification-header">
            <div class="notification-title-row">
              <span class="notification-icon">
                <svg v-if="notif.type === 'downloading'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <svg v-else-if="notif.type === 'completed'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <svg v-else-if="notif.type === 'failed'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </span>
              <span class="notification-app">{{ t('modsUi.launcher') }}</span>
            </div>
            <div class="notification-actions">
              <button class="notification-close" @click="modsStore.removeNotification(notif.id)">×</button>
            </div>
          </div>
          <div class="notification-body">
            <div class="notification-title">{{ notif.modName }}</div>
            <div v-if="notif.type === 'downloading'" class="notification-subtitle">
              <div class="mini-progress-bar">
                <div class="mini-progress" :style="{ width: notif.progress + '%' }"></div>
              </div>
              <span>{{ notif.progress }}%</span>
            </div>
            <div v-else class="notification-subtitle">{{ notif.message }}</div>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <div v-if="browserOpen && !browserFullscreen" class="builtin-browser-bar">
      <div class="browser-progress" :class="{ active: browserLoading || browserProgress > 0 }">
        <div class="browser-progress-fill" :style="{ width: browserProgress + '%' }"></div>
      </div>
      <div class="browser-controls">
        <button class="browser-btn" :title="t('modsUi.home')" @click="browserHome">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9.5 12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z"/><polyline points="9 21.5 9 14 15 14 15 21.5"/></svg>
        </button>
        <button class="browser-btn" :disabled="!browserCanBack" :title="t('modsUi.backTitle')" @click="browserAction('back')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button class="browser-btn" :disabled="!browserCanForward" :title="t('modsUi.forwardTitle')" @click="browserAction('forward')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button class="browser-btn" :title="t('modsUi.reloadTitle')" @click="browserAction('reload')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
        <button v-if="browserLoading" class="browser-btn" :title="t('modsUi.stopTitle')" @click="browserAction('stop')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"/></svg>
        </button>
      </div>
      <div class="browser-address-wrap">
        <form class="browser-address" @submit.prevent="browserNavigate" @click="showHistory = true">
          <input v-model="browserUrl" :placeholder="t('modsUi.addressPlaceholder')" spellcheck="false" @focus="loadBrowserHistory; showHistory = true"/>
        </form>
        <div v-if="showHistory" class="browser-history" @mousedown.prevent>
          <div v-if="browserHistory.length === 0" class="browser-history-empty">{{ t('modsUi.noBrowserHistory') }}</div>
          <div v-for="(item, idx) in browserHistory" :key="idx" class="browser-history-item" @click="goToHistory(item)">
            <span class="history-title">{{ item.title }}</span>
            <span class="history-url">{{ item.url }}</span>
          </div>
        </div>
      </div>
      <div v-if="browserError" class="browser-error" :title="browserError">{{ t('modsUi.pageLoadFailed') }}</div>
      <div v-else-if="browserDownloadDone" class="browser-download done" :title="browserDownloadDone.filename">
        ✓ {{ browserDownloadDone.filename }}
        <button class="browser-download-open" @click="browserOpenFolder">{{ t('modsUi.openFolder') }}</button>
        <button class="browser-download-open install" @click="showInstallMenu = !showInstallMenu">{{ t('modsUi.installToGame') }}</button>
        <div v-if="showInstallMenu" class="browser-install-menu" @click.stop>
          <button class="install-opt" @click="installFromBrowser('mods')">{{ t('modsUi.installAsMod') }}</button>
          <button class="install-opt" @click="installFromBrowser('resourcepacks')">{{ t('modsUi.installAsResourcePack') }}</button>
          <button class="install-opt" @click="installFromBrowser('shaderpacks')">{{ t('modsUi.installAsShaderPack') }}</button>
          <button class="install-opt" @click="installFromBrowser('modpack-downloads')">{{ t('modsUi.stashAsModpack') }}</button>
        </div>
      </div>
      <div v-else-if="browserDownload" class="browser-download" :title="browserDownload.filename">
        ⬇ {{ browserDownload.filename }}
        <span class="browser-download-pct">
          {{ browserDownload.totalBytes > 0 ? Math.round(browserDownload.receivedBytes / browserDownload.totalBytes * 100) : 0 }}%
        </span>
      </div>
      <div v-if="browserLoading" class="browser-title loading-text">
        <span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span>
        {{ t('modsUi.browserLoading', { p: browserProgress > 0 ? Math.round(browserProgress) + '%' : '…' }) }}
      </div>
      <div v-else class="browser-title" :title="browserTitle">{{ browserTitle || t('modsUi.builtinBrowserTitle') }}</div>
      <button class="browser-btn" :class="{ active: browserFullscreen }" :title="t('modsUi.fullscreenTitle')" @click="toggleFullscreen">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
      </button>
      <button class="browser-btn browser-close" :title="t('modsUi.closeBrowserTitle')" @click="closeBuiltinBrowser">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <button v-if="browserOpen && browserFullscreen" class="browser-exit-fullscreen" :title="t('modsUi.exitFullscreenTitle')" @click="toggleFullscreen">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
    </button>
  </div>
</template>

<style scoped>
.mod-manager {
  height: 100%;
  display: flex;
  overflow: hidden;
  position: relative;
}

.sidebar {
  width: 200px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.category-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.category-item:hover {
  background: var(--bg-tertiary);
}

.category-item.active {
  background: var(--accent-soft);
  color: var(--accent-primary);
}

.category-item.active .category-name {
  font-weight: 600;
}

.category-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
}

.category-name {
  flex: 1;
  font-size: 13px;
  color: inherit;
}

.category-count {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--bg-primary);
  border-radius: 10px;
  color: var(--text-muted);
}

.category-item.active .category-count {
  background: var(--accent-soft);
  color: var(--accent-primary);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.header-left h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.mod-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.view-toggle {
  display: flex;
  background: var(--bg-tertiary);
  border-radius: 6px;
  padding: 2px;
}

.view-toggle button {
  width: 32px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.view-toggle button svg {
  width: 16px;
  height: 16px;
}

.view-toggle button:hover {
  background: var(--bg-hover);
}

.view-toggle button.active {
  background: var(--primary);
  color: white;
}

.sort-select {
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.btn-select {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-select svg {
  width: 16px;
  height: 16px;
}

.btn-select:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.btn-select.active {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--primary);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  color: white;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.btn-icon {
  padding: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.btn-icon:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon svg {
  width: 18px;
  height: 18px;
}

.btn-icon svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.filters-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-group label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.filter-select-lg {
  padding: 8px 36px 8px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
  min-width: 140px;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  transition: all 0.15s;
}

.filter-select-lg:hover {
  border-color: var(--primary);
}

.filter-select-lg:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.btn-clear-filters {
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-tertiary);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-clear-filters:hover {
  border-color: var(--error);
  color: var(--error);
}

.toolbar {
  display: flex;
  gap: 12px;
  padding: 12px 20px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.search-box-wrap {
  position: relative;
  flex: 1;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.search-submit {
  border: none;
  background: none;
  padding: 0;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--text-muted);
}

.search-submit:hover {
  color: var(--accent-primary);
}

.search-box svg {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
}

.search-box input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 14px;
  color: var(--text-primary);
}

.search-box .clear {
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  font-size: 16px;
}

.search-box .browser-search {
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
}

.search-box .browser-search:hover {
  color: var(--accent-primary);
}

.search-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.search-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.search-source {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-primary)1a;
  color: var(--accent-primary);
  font-weight: 600;
  flex-shrink: 0;
}

.search-source em {
  font-style: normal;
  font-weight: 400;
  opacity: 0.7;
  font-size: 11px;
}

.search-status {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-search-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 3px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--accent-primary);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}

.browser-search-hint:hover {
  background: var(--accent-primary)1a;
  border-color: var(--accent-primary);
}

.browser-search-hint svg {
  width: 13px;
  height: 13px;
}

.search-preview {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 60;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  font-size: 13px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.preview-source {
  color: var(--accent-primary);
  font-weight: 600;
  flex-shrink: 0;
}

.preview-query {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
}

.preview-item:last-child {
  border-bottom: none;
}

.preview-item:hover {
  background: var(--bg-hover);
}

.preview-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  flex-shrink: 0;
  object-fit: cover;
}

.preview-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.preview-name {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-author {
  font-size: 12px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-footer {
  padding: 11px 16px;
  font-size: 13px;
  color: var(--accent-primary);
  cursor: pointer;
  text-align: center;
  border-top: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.preview-footer:hover {
  background: var(--bg-hover);
}

.preview-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.loader-cubes.small .loader-cube {
  width: 12px;
  height: 12px;
}

.filter-select {
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.btn-clear {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.btn-clear:hover {
  border-color: var(--error);
  color: var(--error);
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px 0;
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.tabs button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  transition: all 0.2s;
}

.tabs button:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.tabs button.active {
  color: var(--primary);
  background: var(--bg-tertiary);
  font-weight: 500;
}

.tabs .badge {
  padding: 2px 6px;
  background: var(--bg-primary);
  border-radius: 10px;
  font-size: 12px;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: var(--primary);
  color: white;
  flex-shrink: 0;
}

.selected-count {
  font-size: 14px;
  font-weight: 500;
}

.batch-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.batch-btn.enable {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.batch-btn.enable:hover {
  background: rgba(255, 255, 255, 0.3);
}

.batch-btn.disable {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.batch-btn.disable:hover {
  background: rgba(255, 255, 255, 0.3);
}

.batch-btn.delete {
  background: var(--error);
  color: white;
}

.batch-btn.delete:hover {
  background: #d32f2f;
}

.batch-btn.select-all {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.batch-btn.select-all:hover {
  background: rgba(255, 255, 255, 0.3);
}

.message {
  position: fixed;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  z-index: 1000;
}

.message.success {
  background: var(--success);
  color: white;
}

.message.error {
  background: var(--error);
  color: white;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.drag-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: white;
}

.drag-content svg {
  width: 48px;
  height: 48px;
}

.mods-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.mods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.mod-card {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.mod-card:hover {
  border-color: var(--primary);
  background: var(--bg-tertiary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.mod-card.installed {
  border-color: var(--success);
}

.mod-card.disabled {
  opacity: 0.6;
}

.mod-card.selected {
  border-color: var(--primary);
  background: var(--bg-tertiary);
  box-shadow: 0 0 0 1px var(--primary);
}

.checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all 0.15s;
}

.checkbox.checked {
  background: var(--primary);
  border-color: var(--primary);
}

.checkbox svg {
  width: 14px;
  height: 14px;
  color: white;
}

.mod-icon {
  position: relative;
  width: 100%;
  padding-top: 100%;
  background: linear-gradient(135deg, var(--bg-tertiary) 0%, var(--bg-secondary) 100%);
}

.mod-icon img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.status-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 4px;
  background: var(--error);
  color: white;
}

.status-badge.enabled {
  background: var(--success);
}

.status-badge.not-installed {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.mod-info {
  padding: 12px;
}

.mod-name {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mod-author {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mod-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.downloads {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.downloads svg {
  width: 14px;
  height: 14px;
}

.loader-tag {
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  margin-right: 6px;
}

.loader-tag.fabric {
  background: #3b82f6;
  color: white;
}

.loader-tag.forge {
  background: #a31621;
  color: white;
}

.loader-tag.neoforge {
  background: #d93025;
  color: white;
}

.loader-tag.quilt {
  background: #9333ea;
  color: white;
}

.loader-tag.generic {
  background: var(--bg-tertiary);
}

.mod-actions {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border-color);
}

.btn-install {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 4px;
  background: var(--primary);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-install:hover {
  background: var(--primary-hover);
}

.install-progress {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
}

.install-progress.wide {
  width: 100%;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.progress {
  height: 100%;
  background: var(--primary);
  border-radius: 4px;
  transition: width 0.2s;
}

.btn-toggle {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-toggle:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.btn-toggle.on {
  background: var(--success);
  border-color: var(--success);
  color: white;
}

.btn-delete {
  padding: 8px;
  border: none;
  border-radius: 4px;
  background: var(--error);
  color: white;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-delete:hover {
  background: #d32f2f;
}

.btn-delete svg {
  width: 16px;
  height: 16px;
}

.btn-reinstall {
  padding: 8px;
  border: none;
  border-radius: 4px;
  background: var(--primary);
  color: white;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-reinstall:hover {
  background: var(--primary-dark);
}

.btn-reinstall svg {
  width: 16px;
  height: 16px;
}

.btn-cancel-small {
  padding: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--error);
  cursor: pointer;
  transition: all 0.15s;
  margin-left: 4px;
}

.btn-cancel-small:hover {
  background: var(--error);
  color: white;
}

.btn-cancel-small svg {
  width: 14px;
  height: 14px;
}

.mods-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mod-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.mod-row:hover {
  border-color: var(--primary);
}

.mod-row.installed {
  border-color: var(--success);
}

.mod-row.disabled {
  opacity: 0.6;
}

.mod-row.selected {
  border-color: var(--primary);
  background: var(--bg-tertiary);
}

.mod-icon-small {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.mod-icon-small img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mod-name-cell {
  flex: 1;
  min-width: 0;
}

.mod-name-cell .name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mod-name-cell .author {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mod-downloads {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  width: 100px;
  flex-shrink: 0;
}

.mod-downloads svg {
  width: 16px;
  height: 16px;
}

.mod-loader {
  width: 80px;
  flex-shrink: 0;
  text-align: center;
}

.mod-status {
  width: 80px;
  flex-shrink: 0;
  text-align: center;
}

.mod-row .mod-actions {
  padding: 0;
  border: none;
  width: 140px;
  flex-shrink: 0;
}

.mod-row .btn-install,
.mod-row .btn-toggle {
  flex: 1;
  padding: 6px 8px;
  font-size: 12px;
}

.mod-row .btn-delete {
  padding: 6px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 32px;
}

.loader-cubes {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.loader-cube {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  box-shadow: inset 0 -5px 0 rgba(0, 0, 0, 0.18);
  animation: loader-cube-bounce 1.2s ease-in-out infinite;
}

.loader-cube:nth-child(1) { background: #5da94f; }
.loader-cube:nth-child(2) { background: #2ea9d0; animation-delay: 0.15s; }
.loader-cube:nth-child(3) { background: #7048e8; animation-delay: 0.3s; }

@keyframes loader-cube-bounce {
  0%, 100% { transform: translateY(0); opacity: 0.85; }
  50% { transform: translateY(-14px); opacity: 1; }
}

.loading-bar {
  width: 200px;
  height: 5px;
  border-radius: 3px;
  background: var(--bg-tertiary);
  overflow: hidden;
}

.loading-bar-fill {
  height: 100%;
  width: 40%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
  animation: loading-bar-slide 1.1s ease-in-out infinite;
}

@keyframes loading-bar-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary);
}

.loading-source {
  font-size: 12px;
  color: var(--text-tertiary);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px;
  border-top: 1px solid var(--border-color);
}

.pagination-btn {
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  cursor: pointer;
  transition: all 0.15s;
}

.pagination-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-btn svg {
  width: 16px;
  height: 16px;
}

.pagination-info {
  font-size: 13px;
  color: var(--text-secondary);
}

.pagination-jump {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pagination-jump span {
  font-size: 13px;
  color: var(--text-secondary);
}

.jump-input {
  width: 50px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}

.jump-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  font-size: 13px;
  cursor: pointer;
}

.jump-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px;
  color: var(--text-muted);
  animation: fadeIn 0.3s ease;
}

.empty-state svg {
  width: 48px;
  height: 48px;
  opacity: 0.55;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  overflow: hidden;
  max-width: 700px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
  animation: modalIn 0.18s ease;
}

@keyframes modalIn {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.download-queue-modal {
  max-width: 500px;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
}

.modal-title h2 {
  margin: 0;
  font-size: 18px;
}

.modal-title p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.modal-close {
  margin-left: auto;
  padding: 8px;
  border: none;
  background: none;
  font-size: 24px;
  color: var(--text-secondary);
  cursor: pointer;
}

.modal-close:hover {
  color: var(--text-primary);
}

.modal-tabs {
  display: flex;
  padding: 12px 20px 0;
  gap: 4px;
  background: var(--bg-tertiary);
}

.modal-tabs button {
  padding: 8px 16px;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px 4px 0 0;
  transition: all 0.15s;
}

.modal-tabs button:hover {
  color: var(--text-primary);
}

.modal-tabs button.active {
  background: var(--bg-card);
  color: var(--primary);
  font-weight: 500;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-section h3 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.modal-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: var(--text-muted);
}

.info-value {
  font-size: 14px;
  font-weight: 500;
}

.modal-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  padding: 4px 10px;
  background: var(--bg-tertiary);
  border-radius: 20px;
  font-size: 12px;
}

.screenshot-gallery {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.screenshot {
  width: 100%;
  height: 150px;
  object-fit: cover;
  border-radius: 8px;
}

.versions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-item {
  padding: 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.version-item:hover {
  border-color: var(--primary);
}

.version-item.selected {
  border-color: var(--primary);
  background: var(--bg-hover);
}

.version-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.version-name {
  font-size: 14px;
  font-weight: 600;
}

.version-number {
  font-size: 13px;
  color: var(--text-secondary);
}

.version-info {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.version-tag {
  padding: 2px 8px;
  background: var(--bg-primary);
  border-radius: 4px;
  font-size: 11px;
}

.version-tag.loader {
  background: var(--primary);
  color: white;
}

.version-files {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.file-name {
  font-size: 12px;
  color: var(--text-secondary);
}

.file-size {
  font-size: 12px;
  color: var(--text-muted);
}

.version-install-btn {
  margin-top: 12px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: var(--primary);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.version-install-btn:hover {
  background: var(--primary-hover);
}

.changelog-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

.btn-secondary {
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.btn-danger {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: var(--error);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-danger:hover {
  background: #d32f2f;
}

.download-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.download-item {
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.download-info {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.download-name {
  font-size: 14px;
  font-weight: 500;
}

.download-version {
  font-size: 12px;
  color: var(--text-secondary);
}

.download-status {
  margin-bottom: 8px;
}

.download-status span {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}

.download-status span.downloading {
  background: var(--primary);
  color: white;
}

.download-status span.completed {
  background: var(--success);
  color: white;
}

.download-status span.cancelled {
  background: var(--bg-primary);
  color: var(--text-secondary);
}

.download-status span.failed {
  background: var(--error);
  color: white;
}

.download-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.download-progress .progress-bar {
  flex: 1;
}

.download-progress span {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 40px;
}

.cancel-btn {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  font-size: 12px;
  cursor: pointer;
}

.cancel-btn:hover {
  border-color: var(--error);
  color: var(--error);
}

.download-error {
  width: 100%;
  margin: 8px 0 0;
  padding: 8px 12px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.3);
  border-radius: 6px;
  font-size: 12px;
  color: var(--error);
  line-height: 1.5;
}

.download-queue-btn {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 50px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: all 0.2s;
}

.download-queue-btn:hover {
  background: var(--primary-hover);
  transform: translateY(-2px);
}

.download-queue-btn svg {
  width: 18px;
  height: 18px;
}

.download-queue-btn span {
  min-width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  font-size: 12px;
}

/* 版本选择弹窗样式 */
.version-select-modal {
  max-width: 420px;
}

.version-select-desc {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.version-list-empty {
  text-align: center;
  padding: 24px 16px;
  color: var(--text-muted);
}

.version-list-empty p {
  margin: 0 0 8px;
  font-size: 14px;
}

.version-select-hint {
  font-size: 12px !important;
  color: var(--text-muted);
  opacity: 0.7;
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.version-item-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.version-item-select:hover {
  border-color: var(--primary);
  background: var(--bg-hover);
}

.version-item-select.selected {
  border-color: var(--primary);
  background: rgba(52, 152, 219, 0.08);
  box-shadow: 0 0 0 1px var(--primary);
}

.modpack-name {
  color: var(--primary);
  font-weight: 600;
}

.modpack-version-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.modpack-version-loading .spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.version-file-size {
  font-size: 12px;
  color: var(--text-muted);
}

.version-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.version-info-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.version-display-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.version-id {
  font-size: 12px;
  color: var(--text-muted);
}

.version-loader {
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  background: var(--primary);
  color: white;
}

.notification-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 10000;
  max-width: 380px;
  pointer-events: none;
}

.notification-toast {
  pointer-events: auto;
  background: var(--toast-bg);
  border: 1px solid var(--toast-border);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  padding: 14px 16px;
  min-width: 320px;
  max-width: 380px;
  overflow: hidden;
}

.notification-toast::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}

.notification-toast.downloading::before {
  background: var(--primary);
}

.notification-toast.completed::before {
  background: #4CAF50;
}

.notification-toast.failed::before {
  background: #f44336;
}

.notification-toast.info::before {
  background: #2196F3;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.notification-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
}

.notification-icon svg {
  width: 20px;
  height: 20px;
}

.notification-toast.completed .notification-icon {
  color: #4CAF50;
}

.notification-toast.failed .notification-icon {
  color: #f44336;
}

.notification-app {
  font-size: 14px;
  font-weight: 600;
  color: var(--toast-text);
}

.notification-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notification-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--toast-close-color);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}

.notification-close:hover {
  background: var(--toast-close-hover-bg);
  color: var(--text-primary);
}

.notification-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.notification-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--toast-text);
  line-height: 1.4;
}

.notification-subtitle {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--toast-text-secondary);
}

.mini-progress-bar {
  flex: 1;
  height: 4px;
  background: var(--toast-progress-bg);
  border-radius: 2px;
  overflow: hidden;
}

.mini-progress {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.notification-toast.completed .mini-progress {
  background: #4CAF50;
}

.notification-toast.failed .mini-progress {
  background: #f44336;
}

.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100px);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100px);
}

.notification-move {
  transition: transform 0.3s ease;
}

.builtin-browser-bar {
  position: fixed;
  left: 4px;
  right: 4px;
  bottom: 4px;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.35);
  z-index: 9999;
}

.browser-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.browser-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.browser-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.browser-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.browser-btn svg {
  width: 16px;
  height: 16px;
}

.browser-address {
  flex: 1;
  min-width: 120px;
  display: flex;
  align-items: center;
}

.browser-address-wrap {
  position: relative;
  flex: 1;
  min-width: 120px;
}

.browser-address-wrap .browser-address {
  flex: none;
}

.browser-address input {
  width: 100%;
  padding: 5px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.browser-address input:focus {
  border-color: var(--accent-primary);
}

.browser-history {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 70;
  max-height: 260px;
  overflow-y: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  padding: 4px;
}

.browser-history-empty {
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.browser-history-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
}

.browser-history-item:hover {
  background: var(--bg-hover);
}

.history-title {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-url {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-install-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  padding: 6px;
  min-width: 220px;
}

.install-opt {
  border: none;
  background: none;
  text-align: left;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.install-opt:hover {
  background: var(--accent-primary)1a;
  color: var(--accent-primary);
}

.browser-btn.active {
  color: var(--accent-primary);
  background: var(--accent-primary)1a;
}

.browser-exit-fullscreen {
  position: fixed;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  z-index: 9999;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.browser-exit-fullscreen:hover {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}

.browser-exit-fullscreen svg {
  width: 18px;
  height: 18px;
}

.browser-title {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.browser-title.loading-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent-primary);
  font-weight: 600;
}

.loading-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-primary);
  animation: dot-blink 1.2s infinite ease-in-out;
}

.loading-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.loading-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes dot-blink {
  0%, 80%, 100% { opacity: 0.2; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}

.browser-progress {
  position: absolute;
  top: -1px;
  left: 0;
  right: 0;
  height: 3px;
  overflow: hidden;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.browser-progress.active {
  opacity: 1;
}

.browser-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), #38ef7d, var(--accent-primary));
  background-size: 200% 100%;
  animation: progress-slide 1.1s linear infinite;
  transition: width 0.2s ease;
}

@keyframes progress-slide {
  0% { background-position: 0% 0; }
  100% { background-position: 200% 0; }
}

.browser-error {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--error);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-download {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--accent-primary);
  background: var(--accent-primary)1a;
  padding: 3px 10px;
  border-radius: 6px;
}

.browser-download.done {
  overflow: visible;
  color: var(--success, #2ecc71);
  background: rgba(46, 204, 113, 0.12);
}

.browser-download-pct {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.browser-download-open {
  border: 1px solid var(--accent-primary);
  background: none;
  color: var(--accent-primary);
  border-radius: 4px;
  font-size: 11px;
  padding: 1px 8px;
  cursor: pointer;
  flex-shrink: 0;
}

.browser-download-open:hover {
  background: var(--accent-primary)1a;
}

.browser-close {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.browser-close:hover {
  background: var(--error);
  color: white;
}
</style>
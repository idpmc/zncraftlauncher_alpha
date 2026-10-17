/**
 * 版本自动升级脚本
 *
 * 用法（在项目根目录）：
 *   npm run bump
 *   npm run bump -- --title "功能名" --note "变更说明(zh)" --noteEn "Change note(en)"
 *
 * 行为：
 *   1. 读取 package.json 的 version，递增 patch（保留 -alpha 等后缀）
 *   2. 若提供了 --title/--note，自动在首页「动态」顶部插入一条更新日志
 *      （HomePage.vue 的 newsItems + locales/parts/home.ts 的 zh/en 键）
 *
 * 约定：每次完成功能更改后运行一次，版本号即自动 +1，无需手动改 package.json 和更新日志。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const pkgPath = path.join(ROOT, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const current = pkg.version || '0.0.0'
const match = current.match(/^(\d+)\.(\d+)\.(\d+)(-.+)?$/)
if (!match) {
  console.error('[bump] 无法解析当前版本: ' + current)
  process.exit(1)
}
const [, maj, min, pat, suffix] = match
const next = `${maj}.${min}.${Number(pat) + 1}${suffix || ''}`
pkg.version = next
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

const args = process.argv.slice(2)
const readArg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const title = readArg('--title')
const note = readArg('--note')
const titleEn = readArg('--titleEn') || title
const noteEn = readArg('--noteEn') || note

if (note) {
  try {
    const now = new Date()
    const stamp = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // 1. HomePage.vue：在 newsItems 数组顶部插入新条目
    const homepagePath = path.join(ROOT, 'src', 'components', 'HomePage.vue')
    let hp = fs.readFileSync(homepagePath, 'utf8')
    const anchor = 'const newsItems = computed(() => ['
    const ai = hp.indexOf(anchor)
    if (ai < 0) throw new Error('HomePage.vue 中未找到 newsItems 锚点')
    const ni = hp.indexOf('\n', ai)
    if (ni < 0) throw new Error('HomePage.vue 中 newsItems 数组格式异常')
    const nums = [...hp.matchAll(/news(\d+)Title/g)].map(m => Number(m[1]))
    const N = (nums.length ? Math.max(...nums) : 0) + 1
    const itemLine = `\n  { date: '${stamp}', title: t('home.news${N}Title'), desc: t('home.news${N}Desc') },`
    hp = hp.slice(0, ni + 1) + itemLine + '\n' + hp.slice(ni + 1)
    fs.writeFileSync(homepagePath, hp, 'utf8')

    // 2. locales/parts/home.ts：zh / en 各插入 newsNTitle / newsNDesc
    const localePath = path.join(ROOT, 'src', 'locales', 'parts', 'home.ts')
    let lc = fs.readFileSync(localePath, 'utf8')
    const esc = (s) => String(s).replace(/'/g, "\\'")
    const blockZh = `\n      ${'news' + N + 'Title'}: '${esc(title || '更新')}',`
      + `\n      ${'news' + N + 'Desc'}: '${esc(note)}',`
    const blockEn = `\n      ${'news' + N + 'Title'}: '${esc(titleEn || 'Update')}',`
      + `\n      ${'news' + N + 'Desc'}: '${esc(noteEn)}',`

    // 依次锚定 zh 的 home 与 en 的 home，按出现顺序插入
    const homeAnchor = 'home: {'
    const idxs = []
    let from = 0
    while (true) {
      const i = lc.indexOf(homeAnchor, from)
      if (i < 0) break
      idxs.push(i)
      from = i + homeAnchor.length
    }
    if (idxs.length < 2) {
      console.warn('[bump] parts/home.ts 中未找到 zh/en 两个 home 区块，仅插入第一个')
    }
    // 从后往前插，避免索引错位
    let zhDone = false
    for (let k = idxs.length - 1; k >= 0; k--) {
      const i = idxs[k]
      const nl = lc.indexOf('\n', i)
      if (nl < 0) continue
      const isEn = !zhDone
      const block = isEn ? blockEn : blockZh
      lc = lc.slice(0, nl + 1) + block + '\n' + lc.slice(nl + 1)
      zhDone = true
    }
    fs.writeFileSync(localePath, lc, 'utf8')

    console.log(`[bump] 已插入首页更新日志: [${stamp}] ${title || '更新'}`)
  } catch (e) {
    console.error('[bump] 更新日志写入失败（版本号仍已递增）:', e && e.message ? e.message : e)
  }
}

console.log(`[bump] 版本 ${current} -> ${next}`)
// 集成校验：一次性检查 exam-wx 工程完整性
// 用法：node scripts/verify.cjs
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
// Web 版（Nuxt server）位于兄弟目录 exam-new/
const SERVER_API = path.join(ROOT, '..', 'exam-new', 'server', 'api')
let failures = 0
const fail = (msg) => { failures++; console.log('  ✗ ' + msg) }
const ok = (msg) => console.log('  ✓ ' + msg)

function walk(dir, ext, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, ext, out)
    else if (p.endsWith(ext)) out.push(p)
  }
  return out
}

// ---------- 1. app.json 页面 ↔ 文件 ----------
console.log('[1] app.json 页面清单')
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
for (const pg of appJson.pages) {
  const missing = ['.js', '.json', '.wxml', '.wxss'].filter((ext) => !fs.existsSync(path.join(ROOT, pg + ext)))
  if (missing.length) fail(`${pg} 缺少 ${missing.join(',')}`)
  else ok(pg)
}
for (const t of appJson.tabBar.list) {
  if (!appJson.pages.includes(t.pagePath)) fail(`tabBar 页 ${t.pagePath} 不在 pages 里`)
  for (const icon of [t.iconPath, t.selectedIconPath]) {
    if (!fs.existsSync(path.join(ROOT, icon))) fail(`图标缺失 ${icon}`)
  }
}
// 反向：pages 目录下未注册的页面
for (const js of walk(path.join(ROOT, 'pages'), '.js')) {
  const rel = path.relative(ROOT, js).replace(/\.js$/, '').replace(/\\/g, '/')
  if (!appJson.pages.includes(rel)) fail(`未在 app.json 注册的页面: ${rel}`)
}

// ---------- 2. JS 语法 ----------
console.log('[2] JS 语法（node --check）')
const jsFiles = [path.join(ROOT, 'app.js'), ...walk(path.join(ROOT, 'utils'), '.js'), ...walk(path.join(ROOT, 'components'), '.js'), ...walk(path.join(ROOT, 'pages'), '.js')]
for (const f of jsFiles) {
  try {
    execFileSync('node', ['--check', f], { stdio: 'pipe' })
  } catch (e) {
    fail(`${path.relative(ROOT, f)}: ${e.stderr}`)
  }
}
ok(`共检查 ${jsFiles.length} 个 js`)

// ---------- 3. JSON 合法性 ----------
console.log('[3] JSON 合法性')
const jsonFiles = [path.join(ROOT, 'app.json'), path.join(ROOT, 'sitemap.json'), path.join(ROOT, 'project.config.json'), ...walk(path.join(ROOT, 'components'), '.json'), ...walk(path.join(ROOT, 'pages'), '.json')]
for (const f of jsonFiles) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { fail(`${path.relative(ROOT, f)}: ${e.message}`) }
}
ok(`共检查 ${jsonFiles.length} 个 json`)

// ---------- 4. WXML：Vue 残留语法 / 模板内函数调用 / 事件处理器存在性 ----------
console.log('[4] WXML 检查')
const EVENTS = ['bindtap', 'catchtap', 'bindinput', 'bindchange', 'bindconfirm', 'binderror', 'bindblur', 'bindsubmit', 'bindreset', 'bindlongpress', 'catchtouchmove']
for (const wxml of walk(path.join(ROOT, 'pages'), '.wxml').concat(walk(path.join(ROOT, 'components'), '.wxml'))) {
  const src = fs.readFileSync(wxml, 'utf8')
  const rel = path.relative(ROOT, wxml)
  const cleaned = src.replace(/wx:[a-z-]+/g, 'wx')
  if (/\bv-(if|for|model|show|key|text|html|else|on[a-z-]*)\b|[@:](click|input|tap|change|blur|class|style|src|key)\s*=/.test(cleaned)) fail(`${rel}: 残留 Vue 语法`)
  const fnInTpl = src.match(/\{\{[^}]*[a-zA-Z_$][\w$]*\s*\(/)
  if (fnInTpl) fail(`${rel}: 模板内函数调用 ${fnInTpl[0].slice(0, 40)}...`)
  // 事件处理器必须存在于同名 js
  const jsPath = wxml.replace(/\.wxml$/, '.js')
  if (fs.existsSync(jsPath)) {
    const js = fs.readFileSync(jsPath, 'utf8')
    for (const ev of EVENTS) {
      const re = new RegExp(ev + '="([\\w]+)"', 'g')
      let m
      while ((m = re.exec(src))) {
        const fn = m[1]
        if (!new RegExp('[\\b\\s\'"]' + fn + '\\b').test(js)) fail(`${rel}: 事件处理器 ${fn} 未在 js 中定义`)
      }
    }
  }
}
ok('完成')

// ---------- 5. 公共工具方法存在性 ----------
console.log('[5] 公共工具方法')
const MODULES = {
  'utils/api.js': ['get', 'post', 'put', 'del'],
  'utils/store.js': ['getToken', 'getUser', 'isLoggedIn', 'setSession', 'updateUser', 'accuracy', 'getCache', 'setCache', 'fetchAll', 'getAllCaches', 'toastAchievements', 'clearSession', 'forceLogout', 'logout'],
  'utils/toast.js': ['success', 'error', 'info', 'warning', 'confirm'],
  'utils/quizState.js': ['init', 'get', 'reset', 'setCurrentIdx', 'setAnswers', 'setAnswerAt', 'setFlags', 'toggleFlagAt', 'setSelected', 'setAnswered', 'setElapsed', 'setResult', 'isAnsweredAt', 'isCorrectAt'],
  'utils/format.js': ['formatClock', 'formatDuration', 'timeAgo', 'formatDate', 'maskPhone', 'letter']
}
const modSource = {}
for (const mod of Object.keys(MODULES)) modSource[mod] = fs.readFileSync(path.join(ROOT, mod), 'utf8')
const USE_RE = /(api|store|toast|quizState|fmt)\.(\w+)\s*\(/g
for (const js of walk(path.join(ROOT, 'pages'), '.js')) {
  const src = fs.readFileSync(js, 'utf8')
  const rel = path.relative(ROOT, js)
  let m
  while ((m = USE_RE.exec(src))) {
    const [mod, fn] = [{ api: 'utils/api.js', store: 'utils/store.js', toast: 'utils/toast.js', quizState: 'utils/quizState.js', fmt: 'utils/format.js' }[m[1]], m[2]]
    if (!MODULES[mod].includes(fn) && !new RegExp(fn + '\\s*[:(]').test(modSource[mod])) {
      fail(`${rel}: ${m[1]}.${fn} 在 ${mod} 中不存在`)
    }
  }
}
ok('完成')

// ---------- 6. 接口对齐：小程序调用 vs server/api 路由 ----------
console.log('[6] 接口对齐')
// 服务端路由表：server/api/**/[name].{get,post,put,delete}.ts → METHOD /api/path
const serverRoutes = []
;(function collect(dir, prefix) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const m = name.match(/\.(get|post|put|delete)\.ts$/)
    const base = name.replace(/\.(get|post|put|delete)\.ts$/, '').replace(/\.ts$/, '')
    if (m) serverRoutes.push({ method: m[1].toUpperCase(), path: '/api' + (base === 'index' ? prefix : prefix + '/' + base) })
    else if (name === 'index.ts') serverRoutes.push({ method: '*', path: '/api' + prefix })
    else if (name.endsWith('.ts')) serverRoutes.push({ method: '*', path: '/api' + prefix + '/' + base }) // 单文件多方法（如 [qid].ts 导出 put/delete）
    if (fs.statSync(p).isDirectory()) collect(p, prefix + '/' + name)
  }
})(SERVER_API, '')
// 小程序调用：提取 /api/...（含模板串 ${} → 占位）
const used = new Set()
for (const js of walk(path.join(ROOT, 'pages'), '.js').concat(walk(path.join(ROOT, 'utils'), '.js'))) {
  const src = fs.readFileSync(js, 'utf8')
  const re = /\/api\/[\w$/{}/.-]*/g
  let m
  while ((m = re.exec(src))) {
    let p = m[0].replace(/\$\{[^}]*\}/g, '{}').replace(/\/+$/, '')
    // 字符串拼接：'/api/banks/' + id → /api/banks/{}
    used.add(p)
  }
}
// 拼接型调用无法直接提取，做前缀匹配兼容
const norm = (p) => p.replace(/\[.+\]/g, '{}')
const routeKeys = serverRoutes.map((r) => norm(r.path))
const segMatch = (u, rk) => {
  const uParts = u.split('/')
  const rParts = rk.split('/')
  if (uParts.length === rParts.length) {
    return uParts.every((seg, i) => seg === rParts[i] || rParts[i] === '{}')
  }
  // 拼接型 URL 提取会被截断：允许 u 是某合法路由的前缀（下一级为参数或更深路径）
  if (uParts.length < rParts.length) {
    return uParts.every((seg, i) => seg === rParts[i] || rParts[i] === '{}')
  }
  return false
}
let unmatched = []
for (const u of used) {
  if (!routeKeys.some((rk) => segMatch(u, rk))) unmatched.push(u)
}
if (unmatched.length) for (const u of unmatched) fail(`接口 ${u} 在 server/api 中无对应路由`)
ok(`小程序使用 ${used.size} 个接口路径，服务端 ${serverRoutes.length} 个路由，全部可对上`)

// ---------- 7. usingComponents ----------
console.log('[7] 组件引用')
for (const comp of Object.values(appJson.usingComponents)) {
  for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
    if (!fs.existsSync(path.join(ROOT, comp + ext))) fail(`组件文件缺失 ${comp}${ext}`)
  }
}
ok('完成')

console.log(failures ? `\n共 ${failures} 个问题` : '\n全部通过 ✓')
process.exit(failures ? 1 : 0)

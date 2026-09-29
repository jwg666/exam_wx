// 题库中心（首页 Tab）：对齐 Web 版 pages/index.vue + components/BankCenter.vue + BankCard.vue
// 游客可浏览；登录用户展示各题库完成进度（GET /api/progress → Record<bankId, done>）
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')

// 分类 emoji 映射（code / 中文名双保险，未知名类兜底 📚）
const CAT_EMOJI = {
  exam: '📝',
  skill: '🛠️',
  license: '📜',
  language: '🌐',
  interest: '🎨',
  assess: '🎭'
}
const CAT_NAME_EMOJI = {
  '考试类': '📝',
  '技能类': '🛠️',
  '资格类': '📜',
  '语言类': '🌐',
  '兴趣类': '🎨',
  '专业测评': '🎭'
}
const CAT_NAME_OF = {
  exam: '考试类',
  skill: '技能类',
  license: '资格类',
  language: '语言类',
  interest: '兴趣类',
  assess: '专业测评'
}
// 与 Web useStorage('quizApp_currentBankCategory') 对齐：记住上次选中的分类
const CAT_STORAGE_KEY = 'quizApp_currentBankCategory'

function typeNameOf(bank) {
  return bank.typeName || bank.type_name || CAT_NAME_OF[bank.type] || bank.type || ''
}

function emojiOf(bank) {
  return CAT_EMOJI[bank.type] || CAT_NAME_EMOJI[typeNameOf(bank)] || '📚'
}

// '#14B8A6' → [20, 184, 166]
function rgbOf(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function diffClassOf(difficulty) {
  if (difficulty === '简单') return 'diff-green'
  if (difficulty === '中等') return 'diff-amber'
  if (difficulty === '困难') return 'diff-red'
  return 'diff-gray'
}

function typeClassOf(bank) {
  return 'type-' + (bank.type || 'exam')
}

Page({
  data: {
    loggedIn: false,
    loading: true,
    loadError: '',
    categories: [{ code: 'all', name: '全部' }],
    currentCat: 'all',
    query: '',
    filtered: []
  },

  onLoad() {
    this.banksRaw = []
    this.progressMap = {}
    let cat = 'all'
    try { cat = wx.getStorageSync(CAT_STORAGE_KEY) || 'all' } catch (e) { /* 忽略 */ }
    this.setData({ currentCat: cat, loggedIn: store.isLoggedIn() })
    this.fetchBanks()
  },

  onShow() {
    // 从登录页返回时刷新登录态；已登录则拉最新进度
    const loggedIn = store.isLoggedIn()
    if (loggedIn !== this.data.loggedIn) this.setData({ loggedIn })
    if (loggedIn) this.refreshProgress()
  },

  // 拉题库 + 分类；silent=true 时（下拉刷新）不显示整页 loading
  // Promise.resolve().then 包一层：即使 api 调用同步抛错也落入 catch，
  // 保证 loading 状态必然收敛（否则骨架屏无 tap 处理器，整页看似"点击没反应"）
  fetchBanks(silent) {
    if (!silent) this.setData({ loading: true, loadError: '' })
    return Promise.resolve().then(() => Promise.all([
      api.get('/api/banks'),
      api.get('/api/categories')
    ])).then((rs) => {
      this.banksRaw = rs[0] || []
      // 「全部」+ 服务端分类（管理后台可维护）
      const cats = [{ code: 'all', name: '全部' }].concat(
        (rs[1] || []).map((c) => ({ code: c.code, name: c.name }))
      )
      this.setData({ categories: cats, loading: false, loadError: '' })
      this.applyFilter()
    }).catch((e) => {
      this.setData({ loading: false, loadError: (e && e.message) || '加载失败，请检查网络' })
    })
  },

  refreshProgress() {
    api.get('/api/progress').then((map) => {
      this.progressMap = map || {}
      store.setCache('bankProgress', this.progressMap)
      this.applyFilter()
    }).catch(() => { /* 进度拉取失败不阻塞浏览 */ })
  },

  // 组装卡片视图数据：分类/搜索过滤 + 进度换算
  applyFilter() {
    const cat = this.data.currentCat
    const q = (this.data.query || '').trim().toLowerCase()
    const loggedIn = store.isLoggedIn()
    const progress = loggedIn ? (this.progressMap || {}) : {}
    const list = (this.banksRaw || [])
      .filter((b) => cat === 'all' || b.type === cat)
      .filter((b) => {
        if (!q) return true
        const name = (b.name || '').toLowerCase()
        const desc = ((b.description || b.desc) || '').toLowerCase()
        return name.indexOf(q) > -1 || desc.indexOf(q) > -1
      })
      .map((b, i) => {
        const done = Number(progress[b.id] || 0)
        const total = Number(b.total || 0)
        const rgb = rgbOf(b.color)
        return {
          id: b.id,
          name: b.name || '',
          desc: (b.description || b.desc) || '',
          typeName: typeNameOf(b),
          typeClass: typeClassOf(b),
          difficulty: b.difficulty || '未知',
          diffClass: diffClassOf(b.difficulty),
          emoji: emojiOf(b),
          iconStyle: rgb
            ? 'background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.1);'
            : 'background:#1C2942;',
          done: done,
          total: total,
          pct: total ? Math.round((done / total) * 100) : 0,
          completed: total > 0 && done >= total,
          delay: Math.round((i % 12) * 5) / 100
        }
      })
    this.setData({ filtered: list })
  },

  onSearchInput(e) {
    this.setData({ query: e.detail.value })
    this.applyFilter()
  },

  onCatTap(e) {
    const code = e.currentTarget.dataset.code
    if (!code || code === this.data.currentCat) return
    try { wx.setStorageSync(CAT_STORAGE_KEY, code) } catch (err) { /* 忽略 */ }
    this.setData({ currentCat: code })
    this.applyFilter()
  },

  openBank(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/bank/detail?id=' + id })
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onRetry() {
    this.fetchBanks()
  },

  onPullDownRefresh() {
    const jobs = [this.fetchBanks(true).catch(() => {})]
    if (store.isLoggedIn()) {
      jobs.push(new Promise((resolve) => {
        api.get('/api/progress').then((map) => {
          this.progressMap = map || {}
          store.setCache('bankProgress', this.progressMap)
          this.applyFilter()
          resolve()
        }).catch(resolve)
      }))
    }
    Promise.all(jobs).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh())
  }
})

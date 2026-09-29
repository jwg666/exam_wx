// 成果 Tab（tabBar 页）：测评报告 + 最近学习 + 学习排行榜
// 对齐 Web 版 pages/results.vue，onShow 每次刷新数据
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')

// FontAwesome 图标 → emoji
const ICON_EMOJI = [
  ['brain', '🧠'], ['theater-masks', '🎭'], ['mask', '🎭'],
  ['door', '🚪'], ['pen', '✏️'], ['ship', '🚢'], ['water', '🌊'],
  ['graduation', '🎓'], ['fire', '🔥'], ['crown', '👑'], ['bullseye', '🎯'],
  ['gem', '💎'], ['bookmark', '🔖'], ['check', '✅'], ['trophy', '🏆'],
  ['medal', '🏅'], ['flag', '🚩'], ['car', '🚗'], ['language', '🌐'],
  ['puzzle', '🧩'], ['js', '💻'], ['python', '🐍'], ['code', '💻'],
  ['book', '📖'], ['star', '⭐'], ['clock', '⏱️'], ['bolt', '⚡'],
  ['rocket', '🚀'], ['heart', '❤️'], ['list', '📋']
]

// 难度 → 文案色
const DIFF_CLASS = { '简单': 'diff-easy', '中等': 'diff-mid', '困难': 'diff-hard' }

// 题库类型 → 标签配色（对齐 Web main.css 的 .type-*）
const TYPE_CLASS = ['exam', 'skill', 'license', 'language', 'interest']

function iconEmoji(icon) {
  const s = String(icon || '')
  for (let i = 0; i < ICON_EMOJI.length; i++) {
    if (s.indexOf(ICON_EMOJI[i][0]) >= 0) return ICON_EMOJI[i][1]
  }
  return '📘'
}

function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''))
  if (!m) return 'rgba(59,130,246,' + alpha + ')'
  const n = parseInt(m[1], 16)
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')'
}

// 测评报告卡片展示字段（对齐 Web keyResult / keyLabel）
function decorateReport(r) {
  const report = r.report || {}
  const kind = report.kind === 'mbti' ? 'mbti' : report.kind === 'iq' ? 'iq' : ''
  return {
    id: String(r.id),
    bankName: r.bankName || '测评',
    date: r.date || '',
    emoji: iconEmoji(r.icon),
    iconBg: (r.color || '#3B82F6') + '22',
    kind: kind,
    keyResult: kind === 'mbti' ? report.typeCode : String(report.iq),
    keyLabel: kind === 'mbti' ? report.typeName : 'IQ · ' + report.tier,
    keyStyle: kind === 'iq' && report.tierColor ? 'color: ' + report.tierColor + ';' : '',
    report: report
  }
}

// 最近学习卡片（对齐 Web BankCard）
function decorateBank(b, progress) {
  const total = Number(b.total || 0)
  const pct = total ? Math.round((progress / total) * 100) : 0
  return {
    id: b.id,
    name: b.name,
    desc: b.description || b.desc || '',
    emoji: iconEmoji(b.icon),
    iconBg: hexToRgba(b.color, 0.12),
    typeName: b.type_name || b.type || '练习',
    typeClass: 'type-' + (TYPE_CLASS.indexOf(b.type) >= 0 ? b.type : 'other'),
    total: total,
    difficulty: b.difficulty || '',
    diffClass: DIFF_CLASS[b.difficulty] || '',
    done: total > 0 && progress >= total,
    pct: pct
  }
}

// 排行榜行（取前 5）
function decorateRankRow(r, i) {
  return {
    id: String(r.id),
    rankNo: i + 1,
    rankClass: i === 0 ? 'rk-1' : i === 1 ? 'rk-2' : i === 2 ? 'rk-3' : '',
    name: r.name || '?',
    firstChar: (r.name || '?').slice(0, 1),
    isMe: !!r.isMe,
    accuracy: r.accuracy || 0,
    streak: r.streak || 0,
    totalAnswered: r.totalAnswered || 0
  }
}

Page({
  data: {
    guest: false,
    loading: true,
    reports: [],
    hotBanks: [],
    rankList: [],
    myRank: 0,
    expandedId: ''
  },

  onShow() {
    // 登录守卫（对齐 Web middleware/auth.global.ts，/results 不在公开路径里）
    if (!store.isLoggedIn()) {
      this.setData({ guest: true, loading: false })
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    if (this.data.guest) this.setData({ guest: false })
    this.fetchData(!this._loaded)
  },

  fetchData(silent) {
    const self = this
    if (!silent) this.setData({ loading: true })
    Promise.all([
      api.get('/api/assessment-reports'),
      api.get('/api/banks'),
      api.get('/api/ranking')
    ]).then((rs) => {
      self._loaded = true
      self._banks = rs[1] || []
      const rank = rs[2] || {}
      self.setData({
        loading: false,
        reports: (rs[0] || []).map(decorateReport),
        myRank: rank.myRank || 0,
        rankList: (rank.list || []).slice(0, 5).map(decorateRankRow)
      })
      self.applyHotBanks()
    }).catch((e) => {
      self.setData({ loading: false })
      toast.error((e && e.message) || '加载成果数据失败')
    })
    // 对齐 Web 版 appStore.fetchAll()：刷新打卡/成就/题库进度等全局缓存
    if (!silent) {
      store.fetchAll().then(() => { self.applyHotBanks() }).catch(() => {})
    }
  },

  // 最近学习：题库前 2 个 + 进度缓存
  applyHotBanks() {
    const banks = this._banks || []
    const progress = store.getCache('bankProgress') || {}
    this.setData({
      hotBanks: banks.slice(0, 2).map((b) => decorateBank(b, progress[b.id] || 0))
    })
  },

  onToggleReport(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ expandedId: this.data.expandedId === id ? '' : id })
  },

  // 去测评 / 查看全部 → 题库中心（tabBar 页必须 switchTab）
  goAssess() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  goBank(e) {
    const id = e.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: '/pages/bank/detail?id=' + id })
  },

  noop() {}
})

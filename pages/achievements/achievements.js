// 成就中心：徽章墙 + 收集进度
// 对齐 Web 版 pages/achievements.vue，数据来自 GET /api/achievements
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')
const fmt = require('../../utils/format.js')

// 成就 id → emoji（对齐 shared/achievements.ts 的 FontAwesome 图标）
const EMOJI_MAP = {
  first_login: '🚪',   // fas fa-door-open 初来乍到
  first_quiz: '✏️',    // fas fa-pen 小试牛刀
  quiz_50: '🚢',       // fas fa-ship 学海初航
  quiz_200: '🌊',      // fas fa-water 题海遨游
  quiz_500: '🎓',      // fas fa-graduation-cap 学富五车
  streak_3: '🔥',      // fas fa-fire 三日之约
  streak_7: '🔥',      // fas fa-fire-flame-curved 周周不落
  streak_30: '👑',     // fas fa-crown 月度冠军
  acc_80: '🎯',        // fas fa-bullseye 准确射手
  acc_100: '💎',       // fas fa-gem 完美无瑕
  fav_10: '🔖',        // fas fa-bookmark 收藏达人
  wrong_clear: '✅'    // fas fa-check-double 知错能改
}

// 时间字符串 → 时间戳（兼容 ISO 与 'YYYY-MM-DD HH:MM:SS'）
function toTs(input) {
  if (!input) return 0
  if (typeof input === 'number') return input
  const t = new Date(String(input).replace(' ', 'T')).getTime()
  return isNaN(t) ? 0 : t
}

Page({
  data: {
    guest: false,
    loading: true,
    list: [],
    unlockedCount: 0,
    total: 0,
    pct: 0
  },

  onShow() {
    // 登录守卫
    if (!store.isLoggedIn()) {
      this.setData({ guest: true, loading: false, list: [], unlockedCount: 0, total: 0, pct: 0 })
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    if (this.data.guest) this.setData({ guest: false })
    this.load()
  },

  load() {
    const self = this
    api.get('/api/achievements').then((rows) => {
      const list = (rows || []).map((a, i) => {
        const ts = toTs(a.unlockedAt)
        const dateText = a.unlocked && ts ? fmt.formatDate(ts) : ''
        return {
          id: a.id,
          name: a.name,
          desc: a.desc,
          unlocked: !!a.unlocked,
          emoji: a.unlocked ? (EMOJI_MAP[a.id] || '🏅') : '🔒',
          chipStyle: a.unlocked && a.color ? 'background: ' + a.color + ';' : '',
          unlockedAtText: a.unlocked ? (dateText ? '解锁于 ' + dateText : '已解锁') : '',
          delay: Math.round(i * 5) / 100
        }
      })
      const unlockedCount = list.filter((a) => a.unlocked).length
      const total = list.length
      self.setData({
        loading: false,
        list: list,
        unlockedCount: unlockedCount,
        total: total,
        pct: total ? Math.round((unlockedCount / total) * 100) : 0
      })
      store.setCache('achievements', rows || [])
    }).catch((e) => {
      self.setData({ loading: false })
      toast.error((e && e.message) || '加载成就失败')
    })
  }
})

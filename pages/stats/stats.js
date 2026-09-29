// 学习报告（数据分析）：核心指标 + 近7天趋势 + 各科目正确率 + 答题时段分布
// 对齐 Web 版 pages/stats.vue，数据来自 GET /api/stats
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// 时段分布三段（对齐 Web 的 morning/noon/evening 配色）
const SEGMENTS = [
  { key: 'morning', name: '早晨 (5:00-12:00)', emoji: '☀️', color: '#FBBF24' },
  { key: 'noon', name: '午后 (12:00-18:00)', emoji: '🌤️', color: '#60A5FA' },
  { key: 'evening', name: '夜晚 (18:00-5:00)', emoji: '🌙', color: '#A78BFA' }
]

// 'YYYY-MM-DD' → 星期文案
function dayLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return DAY_NAMES[d.getDay()] || ''
}

// 保留两位小数（柱高百分比）
function pct2(n) {
  return Math.round(n * 100) / 100
}

Page({
  data: {
    guest: false,
    loading: true,
    accuracy: 0,
    streak: 0,
    weekView: [],
    byTypeView: [],
    distView: [],
    distEmpty: true
  },

  onShow() {
    // 登录守卫
    if (!store.isLoggedIn()) {
      this.setData({ guest: true, loading: false })
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    if (this.data.guest) this.setData({ guest: false })
    this.load()
  },

  load() {
    const self = this
    api.get('/api/stats').then((s) => {
      s = s || {}
      const week = s.week || []
      let max = 1
      for (let i = 0; i < week.length; i++) {
        if (week[i].total > max) max = week[i].total
      }
      const weekView = week.map((w) => ({
        date: w.date,
        day: dayLabel(w.date),
        total: w.total || 0,
        hpct: pct2(((w.total || 0) / max) * 100)
      }))

      const byTypeView = (s.byType || []).map((t) => ({
        type: t.type,
        typeName: t.typeName || t.type,
        accuracy: t.accuracy || 0
      }))

      const dist = s.timeDistribution || {}
      const totalDist = (dist.morning || 0) + (dist.noon || 0) + (dist.evening || 0)
      const distView = SEGMENTS.map((seg) => {
        const pct = totalDist ? Math.round(((dist[seg.key] || 0) / totalDist) * 100) : 0
        return {
          key: seg.key,
          name: seg.name,
          emoji: seg.emoji,
          color: seg.color,
          pct: pct,
          style: 'width: ' + pct + '%; background: linear-gradient(90deg, ' + seg.color + '88, ' + seg.color + ');'
        }
      })

      self.setData({
        loading: false,
        accuracy: s.accuracy || 0,
        streak: s.streak || 0,
        weekView: weekView,
        byTypeView: byTypeView,
        distView: distView,
        distEmpty: totalDist === 0
      })
    }).catch((e) => {
      self.setData({ loading: false })
      toast.error((e && e.message) || '加载统计数据失败')
    })
  }
})

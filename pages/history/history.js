// 答题历史：对齐 Web 版 pages/history.vue
// - 登录守卫（未登录 → 空态 + 跳登录页）
// - 数据：优先 store.getCache('history') 直出，onShow 再 GET /api/histories 刷新
// - 记录流水：题库名、得分(accuracy)、对错数、耗时(formatDuration)、时间(timeAgo)，全部 JS 预计算
// - 卡片不绑定点击（Web 版无点击行为）
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')
const fmt = require('../../utils/format.js')

Page({
  data: {
    guest: false,
    loading: true,
    list: [],   // 记录视图模型
    total: 0    // 记录总数（头部「共 N 次」）
  },

  onShow() {
    // 登录守卫：对齐 Web middleware/auth.global.ts
    if (!store.isLoggedIn()) {
      this.setData({ guest: true, loading: false, list: [], total: 0 })
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    this.setData({ guest: false })
    // 缓存直出，再远端刷新
    this._raw = store.getCache('history') || null
    if (this._raw) this.render()
    this.fetch()
  },

  // GET /api/histories（对齐 Web onMounted 的拉取 + 失败提示）
  fetch() {
    const self = this
    if (!this._raw) this.setData({ loading: true })
    api.get('/api/histories').then((rows) => {
      self._raw = rows || []
      store.setCache('history', self._raw)
      self.setData({ loading: false })
      self.render()
    }).catch((e) => {
      self.setData({ loading: false })
      toast.error((e && e.message) || '加载记录失败')
    })
  },

  // 渲染视图模型：时间/耗时/对错数全部 JS 预计算（{{}} 内不能调函数）
  render() {
    const raw = this._raw || []
    const list = raw.map(function (h, i) {
      const accuracy = Number(h.accuracy) || 0
      const total = Number(h.total) || 0
      const correct = Number(h.correct) || 0
      return {
        id: h.id,
        bankName: h.bankName || '未知题库',
        dateText: fmt.timeAgo(h.createdAt || h.date || ''),
        durationText: fmt.formatDuration(h.time),
        accuracy: accuracy,
        good: accuracy >= 60,
        correct: correct,
        wrong: total - correct,
        delay: i / 20
      }
    })
    this.setData({ list: list, total: raw.length })
  },

  // 空态「去刷题」→ 题库中心（tabBar 页必须 switchTab）
  goPractice() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})

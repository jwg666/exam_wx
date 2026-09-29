// 消息通知：列表 + 全部已读
// 对齐 Web 版 pages/notifications.vue，数据来自 GET /api/notifications、POST /api/notifications/read-all
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')
const fmt = require('../../utils/format.js')

// 通知类型 → 图标 emoji + 配色 class（对齐 Web 的 type 字段映射）
const TYPE_STYLE = {
  system: { emoji: '📢', cls: 'nf-sys' },
  ranking: { emoji: '🏆', cls: 'nf-rank' },
  achievement: { emoji: '🎉', cls: 'nf-ach' }
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
    unread: 0,
    marking: false
  },

  onShow() {
    // 登录守卫
    if (!store.isLoggedIn()) {
      this.setData({ guest: true, loading: false, list: [], unread: 0 })
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    if (this.data.guest) this.setData({ guest: false })
    this.load()
  },

  load() {
    const self = this
    api.get('/api/notifications').then((res) => {
      const raw = (res && res.list) || []
      const list = raw.map((n, i) => {
        const st = TYPE_STYLE[n.type] || TYPE_STYLE.system
        return {
          id: n.id,
          title: n.title,
          content: n.content || '',
          is_read: !!n.is_read,
          emoji: st.emoji,
          boxClass: st.cls,
          timeText: fmt.timeAgo(toTs(n.created_at)),
          delay: Math.round(i * 5) / 100
        }
      })
      const unread = Number((res && res.unread) || 0)
      self.setData({ loading: false, list: list, unread: unread })
      store.setCache('unreadCount', unread)
    }).catch((e) => {
      self.setData({ loading: false })
      toast.error((e && e.message) || '加载通知失败')
    })
  },

  markAllRead() {
    if (this._marking) return
    this._marking = true
    const self = this
    this.setData({ marking: true })
    api.post('/api/notifications/read-all').then(() => {
      const list = self.data.list.map((n) => Object.assign({}, n, { is_read: true }))
      self.setData({ list: list, unread: 0, marking: false })
      store.setCache('unreadCount', 0)
      toast.info('已全部标记为已读')
      self._marking = false
    }).catch((e) => {
      self.setData({ marking: false })
      self._marking = false
      toast.error((e && e.message) || '操作失败')
    })
  }
})

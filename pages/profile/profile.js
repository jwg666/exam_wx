// 我的（个人中心，tabBar 页）：对齐 Web 版 pages/profile.vue
// - onShow 守卫：未登录 → 空态 + 跳登录页；已登录 → 缓存直出 + 拉全量/打卡/题库/排行榜
// - 打卡：POST /api/checkins → 成就弹幕 → 更新 checkin 缓存与 streak → 刷新排行榜
// - 编辑昵称：PUT /api/users/me → store.updateUser；退出登录：确认 → logout → 登录页
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')
const fmt = require('../../utils/format.js')

// #RRGGBB → rgba()（题库图标底色用，{{}} 内不能写函数故在 JS 预处理）
function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return 'rgba(59, 130, 246, ' + alpha + ')'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
}

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

Page({
  data: {
    guest: false,          // 未登录空态
    user: null,            // 渲染用用户信息（name/avatar/isAdmin/totalAnswered）
    nameInitial: '',
    avatarFailed: false,
    maskedPhone: '',
    binding: false,        // 绑定手机号表单态
    bindPhone: '',
    bindCode: '',
    bindCountdown: 0,
    bindSubmitting: false,
    accuracy: 0,
    unlockedCount: 0,
    checkedToday: false,
    checkingIn: false,
    streak: 0,
    weekDots: [],          // 近 7 天打卡圆点 { label, checked, today }
    wrongCount: 0,
    favCount: 0,
    historyCount: 0,
    unreadCount: 0,
    editing: false,        // 昵称编辑态
    editName: '',
    saving: false,
    recentBanks: [],       // 最近学习（前 2 个题库）
    ranking: { list: [], myRank: 0 }
  },

  onShow() {
    // 登录守卫：对齐 Web middleware/auth.global.ts（/profile 需登录）
    if (!store.isLoggedIn()) {
      this.setData({ guest: true, user: null })
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    this.setData({ guest: false })
    this.refreshFromCache()
    this.refreshRemote()
  },

  onUnload() {
    this.stopBindCountdown()
  },

  // ---------- 绑定手机号（微信免手机号账号的可选操作） ----------
  startBind() {
    this.setData({ binding: true, bindPhone: '', bindCode: '' })
  },

  cancelBind() {
    this.stopBindCountdown()
    this.setData({ binding: false, bindPhone: '', bindCode: '' })
  },

  onBindPhoneInput(e) { this.setData({ bindPhone: e.detail.value }) },
  onBindCodeInput(e) { this.setData({ bindCode: e.detail.value }) },

  stopBindCountdown() {
    if (this._bindTimer) {
      clearInterval(this._bindTimer)
      this._bindTimer = null
    }
  },

  sendBindCode() {
    const phone = this.data.bindPhone.trim()
    if (!/^1\d{10}$/.test(phone)) {
      toast.error('请输入正确的手机号')
      return
    }
    if (this.data.bindCountdown > 0) return
    api.post('/api/auth/sms/send', { phone }).then((res) => {
      this.stopBindCountdown()
      this.setData({ bindCountdown: 60 })
      this._bindTimer = setInterval(() => {
        const next = this.data.bindCountdown - 1
        if (next <= 0) {
          this.stopBindCountdown()
          this.setData({ bindCountdown: 0 })
        } else {
          this.setData({ bindCountdown: next })
        }
      }, 1000)
      if (res.provider === 'mock') {
        toast.info('当前为开发模式，验证码请输入 123456')
      } else {
        toast.info('验证码已发送，请注意查收短信')
      }
    }).catch((e) => {
      toast.error(e.message || '验证码发送失败')
    })
  },

  async saveBind() {
    const phone = this.data.bindPhone.trim()
    const code = this.data.bindCode.trim()
    if (!phone || !code) {
      toast.error('请输入手机号和验证码')
      return
    }
    if (this.data.bindSubmitting) return
    this.setData({ bindSubmitting: true })
    try {
      const res = await api.post('/api/auth/wechat/bind', { phone: phone, code: code })
      store.updateUser({ phone: res.user.phone })
      this.stopBindCountdown()
      this.setData({
        binding: false,
        bindPhone: '',
        bindCode: '',
        bindSubmitting: false,
        maskedPhone: fmt.maskPhone(res.user.phone || '')
      })
      toast.success('绑定成功')
    } catch (e) {
      toast.error(e.message || '绑定失败')
      this.setData({ bindSubmitting: false })
    }
  },

  // ---------- 缓存直出 ----------
  refreshFromCache() {
    const user = store.getUser()
    if (!user) {
      // token 在但本地 user 丢失：fetchAll 会从 /api/users/me 恢复，先不置 guest
      this.setData({ user: null })
      return
    }
    const checkin = store.getCache('checkin') || {}
    const achievements = store.getCache('achievements') || []
    const wrongBook = store.getCache('wrongBook') || []
    const favorites = store.getCache('favorites') || []
    const history = store.getCache('history') || []
    this.setData({
      user: {
        name: user.name || '',
        phone: user.phone || '',
        avatar: user.avatar || '',
        isAdmin: !!user.isAdmin,
        totalAnswered: user.totalAnswered || 0
      },
      nameInitial: (user.name || '友').slice(0, 1),
      avatarFailed: false,
      maskedPhone: fmt.maskPhone(user.phone || ''),
      accuracy: store.accuracy(),
      unlockedCount: achievements.filter(function (a) { return a.unlocked }).length,
      checkedToday: !!checkin.checkedToday,
      streak: checkin.streak || user.streak || 0,
      wrongCount: wrongBook.length,
      favCount: favorites.length,
      historyCount: history.length,
      unreadCount: store.getCache('unreadCount') || 0
    })
    this.applyBanks(this._banks)
  },

  // ---------- 远端刷新（fetchAll + 必要接口，静默） ----------
  async refreshRemote() {
    if (this._refreshing) return
    this._refreshing = true
    // 全量业务数据（对齐 Web appStore.fetchAll），完成后用缓存重绘
    store.fetchAll().then(() => {
      this.refreshFromCache()
    }).catch(function () { /* 拉取失败保持缓存数据 */ })
    // 近 7 天打卡记录 + streak（打卡卡数据源）
    try {
      const ck = await api.get('/api/checkins')
      this.applyCheckin(ck)
    } catch (e) { /* 静默 */ }
    // 最近学习题库
    try {
      const banks = await api.get('/api/banks')
      this._banks = banks
      this.applyBanks(banks)
    } catch (e) { /* 静默 */ }
    // 学习排行榜
    try {
      const rk = await api.get('/api/ranking')
      this.applyRanking(rk)
    } catch (e) { /* 静默 */ }
    this._refreshing = false
  },

  applyCheckin(ck) {
    const days = (ck && ck.days) || []
    const checkedToday = !!(ck && ck.checkedToday)
    const streak = (ck && ck.streak) || 0
    const weekDots = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      weekDots.push({
        label: i === 0 ? '今' : WEEK_LABELS[d.getDay()],
        checked: days.indexOf(fmt.formatDate(d)) !== -1,
        today: i === 0
      })
    }
    store.setCache('checkin', { checkedToday: checkedToday, streak: streak, days: days })
    this.setData({ checkedToday: checkedToday, streak: streak, weekDots: weekDots })
  },

  applyBanks(banks) {
    if (!banks || !banks.length) {
      this.setData({ recentBanks: [] })
      return
    }
    const progress = store.getCache('bankProgress') || {}
    const recent = banks.slice(0, 2).map(function (b) {
      const done = progress[b.id] || 0
      const total = b.total || 0
      return {
        id: b.id,
        name: b.name || '',
        desc: b.description || b.desc || '',
        typeName: b.typeName || b.type_name || '',
        total: total,
        difficulty: b.difficulty || '',
        color: b.color || '#3B82F6',
        bg: hexToRgba(b.color, 0.12),
        pct: total ? Math.min(100, Math.round((done / total) * 100)) : 0,
        completed: total ? done >= total : false
      }
    })
    this.setData({ recentBanks: recent })
  },

  applyRanking(rk) {
    const raw = (rk && rk.list) || []
    const list = raw.slice(0, 5).map(function (r) {
      return {
        id: r.id,
        name: r.name || '',
        initial: (r.name || '?').slice(0, 1),
        isMe: !!r.isMe,
        accuracy: r.accuracy || 0,
        streak: r.streak || 0,
        totalAnswered: r.totalAnswered || 0
      }
    })
    this.setData({ ranking: { list: list, myRank: (rk && rk.myRank) || 0 } })
  },

  // ---------- 打卡 ----------
  async onCheckin() {
    if (this.data.checkedToday || this.data.checkingIn) return
    this.setData({ checkingIn: true })
    try {
      const res = await api.post('/api/checkins', {})
      const streak = res.streak || 0
      const days = this._checkinDays()
      const today = fmt.formatDate(new Date())
      if (days.indexOf(today) === -1) days.push(today)
      store.setCache('checkin', { checkedToday: true, streak: streak, days: days })
      store.updateUser({ streak: streak })
      store.toastAchievements(res.newlyUnlocked || [])
      if (!res.alreadyChecked) toast.info('打卡成功！连续打卡 ' + streak + ' 天')
      // 按钮态 + 今日圆点即时点亮
      const weekDots = this.data.weekDots.map(function (d) {
        return d.today ? { label: d.label, checked: true, today: true } : d
      })
      this.setData({ checkedToday: true, streak: streak, weekDots: weekDots })
      // 与 Web 一致：打卡后刷新排行榜
      const rk = await api.get('/api/ranking').catch(function () { return null })
      if (rk) this.applyRanking(rk)
    } catch (e) {
      toast.error(e.message || '打卡失败')
    } finally {
      this.setData({ checkingIn: false })
    }
  },

  _checkinDays() {
    const c = store.getCache('checkin')
    return (c && c.days) || []
  },

  // ---------- 编辑昵称 ----------
  startEdit() {
    this.setData({ editName: this.data.user ? this.data.user.name : '', editing: true })
  },

  cancelEdit() {
    this.setData({ editing: false })
  },

  onEditNameInput(e) {
    this.setData({ editName: e.detail.value })
  },

  async saveName() {
    const name = (this.data.editName || '').trim()
    if (!name) {
      toast.warning('昵称不能为空')
      return
    }
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      await api.put('/api/users/me', { name: name })
      store.updateUser({
        name: name,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + name
      })
      this.refreshFromCache()
      this.setData({ editing: false })
      toast.success('昵称已更新')
    } catch (e) {
      toast.error(e.message || '保存失败')
    } finally {
      this.setData({ saving: false })
    }
  },

  // ---------- 头像加载失败回退首字母块 ----------
  onAvatarError() {
    this.setData({ avatarFailed: true })
  },

  // ---------- 跳转 ----------
  go(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    if (url === '/pages/index/index') {
      wx.switchTab({ url: url })
    } else {
      wx.navigateTo({ url: url })
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  // ---------- 退出登录 ----------
  async onLogout() {
    const ok = await toast.confirm('确定要退出登录吗？', '退出登录')
    if (!ok) return
    store.logout()
    toast.info('已退出登录')
    wx.reLaunch({ url: '/pages/login/login' })
  }
})

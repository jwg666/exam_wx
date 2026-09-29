// 全局状态：会话（token/user 持久化）+ 业务数据缓存（登录后从服务端拉取）
// 对齐 Web 版 stores/app.ts 的字段与行为
const api = require('./api.js')

const TOKEN_KEY = 'quizApp_token'
const USER_KEY = 'quizApp_user'
const CACHE_KEY = 'wx_app_cache'

// ---------- 会话 ----------
function getToken() {
  try { return wx.getStorageSync(TOKEN_KEY) || '' } catch (e) { return '' }
}

function getUser() {
  try {
    const u = wx.getStorageSync(USER_KEY)
    if (typeof u === 'string') return null // 自愈历史损坏数据
    return u || null
  } catch (e) { return null }
}

function isLoggedIn() {
  return !!getToken()
}

// 登录/注册成功后调用，data 为服务端 { token, user, newlyUnlocked? }
function setSession(data) {
  try {
    wx.setStorageSync(TOKEN_KEY, data.token)
    wx.setStorageSync(USER_KEY, normalizeUser(data.user))
  } catch (e) { /* 存储失败不阻塞 */ }
}

function updateUser(patch) {
  const u = getUser()
  if (!u) return null
  const next = Object.assign({}, u, patch)
  try { wx.setStorageSync(USER_KEY, next) } catch (e) { /* 忽略 */ }
  return next
}

// 本地换算：正确率（%）
function accuracy() {
  const u = getUser()
  if (!u || !u.totalAnswered) return 0
  return Math.round((u.totalCorrect / u.totalAnswered) * 100)
}

// ---------- 业务数据缓存 ----------
let cache = null

function loadCache() {
  if (cache) return cache
  try { cache = wx.getStorageSync(CACHE_KEY) || {} } catch (e) { cache = {} }
  return cache
}

function saveCache() {
  try { wx.setStorageSync(CACHE_KEY, cache || {}) } catch (e) { /* 忽略 */ }
}

// key: wrongBook / favorites / history / achievements / bankProgress / checkin / unreadCount
function getCache(key) {
  const c = loadCache()
  return c[key]
}

function setCache(key, val) {
  const c = loadCache()
  c[key] = val
  saveCache()
}

function normalizeUser(raw) {
  return {
    id: raw.id,
    phone: raw.phone,
    name: raw.name,
    totalAnswered: raw.totalAnswered || 0,
    totalCorrect: raw.totalCorrect || 0,
    streak: raw.streak || 0,
    isAdmin: !!raw.isAdmin,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + raw.name,
    loginTime: Date.now()
  }
}

// 登录后并行拉取全量用户数据（对齐 Web 版 fetchAll）
function fetchAll() {
  if (!getToken()) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const jobs = [
      api.get('/api/checkins'),
      api.get('/api/achievements'),
      api.get('/api/wrong-book'),
      api.get('/api/favorites'),
      api.get('/api/histories'),
      api.get('/api/progress')
    ]
    Promise.all(jobs).then((rs) => {
      const me = getUser()
      // 本地 user 丢失/损坏时从服务端恢复
      const finish = () => {
        setCache('checkin', { checkedToday: rs[0].checkedToday, streak: rs[0].streak })
        setCache('achievements', rs[1])
        setCache('wrongBook', rs[2])
        setCache('favorites', rs[3])
        setCache('history', rs[4])
        setCache('bankProgress', rs[5])
        if (me) updateUser({ streak: rs[0].streak })
        api.get('/api/notifications').then((nf) => {
          setCache('unreadCount', nf.unread)
          resolve(getAllCaches())
        }).catch(() => resolve(getAllCaches()))
      }
      if (!me || !me.id) {
        api.get('/api/users/me').then((m) => {
          try { wx.setStorageSync(USER_KEY, normalizeUser(m)) } catch (e) { /* 忽略 */ }
          finish()
        }).catch(() => finish())
      } else {
        finish()
      }
    }).catch(reject)
  })
}

function getAllCaches() {
  const c = loadCache()
  return {
    checkin: c.checkin || { checkedToday: false, streak: 0 },
    achievements: c.achievements || [],
    wrongBook: c.wrongBook || [],
    favorites: c.favorites || [],
    history: c.history || [],
    bankProgress: c.bankProgress || {},
    unreadCount: c.unreadCount || 0
  }
}

// ---------- 成就 Toast 队列 ----------
function toastAchievements(list) {
  if (!list || !list.length) return
  const titles = list.map((d) => '🎉 解锁成就：' + d.name)
  let i = 0
  const next = () => {
    if (i >= titles.length) return
    wx.showToast({
      title: titles[i++],
      icon: 'none',
      duration: 2000,
      complete: () => setTimeout(next, 400)
    })
  }
  next()
}

// ---------- 登出 ----------
function clearSession() {
  try {
    wx.removeStorageSync(TOKEN_KEY)
    wx.removeStorageSync(USER_KEY)
    wx.removeStorageSync(CACHE_KEY)
  } catch (e) { /* 忽略 */ }
  cache = null
}

// 401 时由 api 层调用：清会话并回到登录页
function forceLogout() {
  clearSession()
  wx.showToast({ title: '登录已过期，请重新登录', icon: 'none', duration: 2000 })
  setTimeout(() => {
    const pages = getCurrentPages()
    const cur = pages[pages.length - 1]
    if (cur && cur.route === 'pages/login/login') return
    wx.reLaunch({ url: '/pages/login/login' })
  }, 600)
}

// 主动退出登录
function logout() {
  clearSession()
}

module.exports = {
  getToken,
  getUser,
  isLoggedIn,
  setSession,
  updateUser,
  accuracy,
  getCache,
  setCache,
  fetchAll,
  getAllCaches,
  toastAchievements,
  clearSession,
  forceLogout,
  logout
}

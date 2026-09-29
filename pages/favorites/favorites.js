// 我的收藏：对齐 Web 版 pages/favorites.vue
// - 登录守卫（未登录 → 空态 + 跳登录页）
// - 数据：优先 store.getCache('favorites') 直出，onShow 再 GET /api/favorites 刷新
// - 「取消收藏」：POST /api/favorites { questionId }（幂等 toggle，再删即为取消）
// - 「重做」：quizState.init 单题 exam 模式（bankName 追加「· 收藏重做」）→ /pages/quiz/quiz
// 注意：{{}} 内不能调函数，答案字母 / 题型标签等全部在 JS 预计算后 setData
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')
const quizState = require('../../utils/quizState.js')

const TYPE_LABELS = { single: '单选', judge: '判断', multi: '多选' }
const TYPE_CLS = { single: 'tag-single', judge: 'tag-judge', multi: 'tag-multi' }

// 正确答案字母预计算：multi → 'A、C'，单选/判断 → 单字母（0 → A）
function ansText(f) {
  if (f.type === 'multi' && Array.isArray(f.ans)) {
    return f.ans.map(function (a) { return String.fromCharCode(65 + a) }).join('、')
  }
  return String.fromCharCode(65 + (f.ans || 0))
}

Page({
  data: {
    guest: false,
    loading: true,
    list: [],   // 收藏视图模型
    total: 0    // 收藏总数（头部「共 N 题」）
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
    this._raw = store.getCache('favorites') || null
    if (this._raw) this.render()
    this.fetch()
  },

  // GET /api/favorites（对齐 Web onMounted 的拉取 + 失败提示）
  fetch() {
    const self = this
    if (!this._raw) this.setData({ loading: true })
    api.get('/api/favorites').then((rows) => {
      self._raw = rows || []
      store.setCache('favorites', self._raw)
      self.setData({ loading: false })
      self.render()
    }).catch((e) => {
      self.setData({ loading: false })
      toast.error((e && e.message) || '加载收藏失败')
    })
  },

  // 渲染视图模型（字母/题型标签全部 JS 预计算）
  render() {
    const raw = this._raw || []
    const list = raw.map(function (f, i) {
      return {
        id: f.id,
        questionId: f.questionId,
        typeLabel: TYPE_LABELS[f.type || 'single'] || '单选',
        typeCls: TYPE_CLS[f.type || 'single'] || 'tag-single',
        question: f.question || '',
        ansText: ansText(f),
        exp: f.exp || '',
        hasExp: !!f.exp,
        bankName: f.bankName || '未知题库',
        delay: i / 20
      }
    })
    this.setData({ list: list, total: raw.length })
  },

  // 取消收藏：POST /api/favorites { questionId }（幂等 toggle，此处必为取消）
  onRemove(e) {
    const questionId = e.currentTarget.dataset.qid
    const self = this
    api.post('/api/favorites', { questionId: questionId }).then(function () {
      self._raw = (self._raw || []).filter(function (x) { return String(x.questionId) !== String(questionId) })
      store.setCache('favorites', self._raw)
      toast.success('已取消收藏')
      self.render()
    }).catch(function () {
      toast.error('操作失败')
    })
  },

  // 单题重做：与 Web retryOne 一致（exam 模式，题库署名「· 收藏重做」）
  onRetry(e) {
    const questionId = e.currentTarget.dataset.qid
    const f = (this._raw || []).find(function (x) { return String(x.questionId) === String(questionId) })
    if (!f) return
    quizState.init({
      bankId: f.bankId,
      bankName: (f.bankName || '') + ' · 收藏重做',
      kind: 'quiz',
      mode: 'exam',
      questions: [{ id: f.questionId, type: f.type, q: f.question, opts: f.opts, ans: f.ans, exp: f.exp }],
      startTime: Date.now()
    })
    wx.navigateTo({ url: '/pages/quiz/quiz' })
  },

  // 空态「去刷题」→ 题库中心（tabBar 页必须 switchTab）
  goPractice() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})

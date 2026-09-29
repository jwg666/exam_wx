// 错题本：对齐 Web 版 pages/wrong.vue
// - 登录守卫（未登录 → 空态 + 跳登录页）
// - 数据：优先 store.getCache('wrongBook') 直出，onShow 再 GET /api/wrong-book 刷新
// - 按题库分类筛选 chips（仅当题库数 > 1 时显示）
// - 单题「已掌握」移除：DELETE /api/wrong-book?id=xx（server 从查询参数取 id）
// - 「清空」：确认后 DELETE /api/wrong-book（不带参数即全清，服务端可能解锁「知错能改」成就）
// - 重做：quizState.init 单题 exam 模式（bankName 追加「· 错题重练」）→ /pages/quiz/quiz
// 注意：{{}} 内不能调函数，答案字母 / 题型标签等全部在 JS 预计算后 setData
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')
const quizState = require('../../utils/quizState.js')

const TYPE_LABELS = { single: '单选', judge: '判断', multi: '多选' }
const TYPE_CLS = { single: 'tag-single', judge: 'tag-judge', multi: 'tag-multi' }

// 正确答案字母预计算：multi → 'A、C'，单选/判断 → 单字母（0 → A）
function ansText(w) {
  if (w.type === 'multi' && Array.isArray(w.ans)) {
    return w.ans.map(function (a) { return String.fromCharCode(65 + a) }).join('、')
  }
  return String.fromCharCode(65 + (w.ans || 0))
}

Page({
  data: {
    guest: false,
    loading: true,
    activeType: 'all',   // 当前筛选的题库 id（'all' 为全部）
    chips: [],           // 分类筛选 [{ id, name }]
    list: [],            // 筛选后的错题视图模型
    totalCount: 0        // 全量错题数（控制头部「清空」按钮显隐）
  },

  onShow() {
    // 登录守卫：对齐 Web middleware/auth.global.ts
    if (!store.isLoggedIn()) {
      this.setData({ guest: true, loading: false, list: [], totalCount: 0 })
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    this.setData({ guest: false })
    // 缓存直出，再远端刷新
    this._raw = store.getCache('wrongBook') || null
    if (this._raw) this.render()
    this.fetch()
  },

  // GET /api/wrong-book（对齐 Web onMounted 的拉取 + 失败提示）
  fetch() {
    const self = this
    if (!this._raw) this.setData({ loading: true })
    api.get('/api/wrong-book').then((rows) => {
      self._raw = rows || []
      store.setCache('wrongBook', self._raw)
      self.setData({ loading: false })
      self.render()
    }).catch((e) => {
      self.setData({ loading: false })
      toast.error((e && e.message) || '加载错题失败')
    })
  },

  // 渲染：chips 去重 + 按题库过滤 + 视图模型预计算
  render() {
    const raw = this._raw || []
    const active = this.data.activeType
    const seen = {}
    const chips = [{ id: 'all', name: '全部' }]
    for (let i = 0; i < raw.length; i++) {
      const bid = raw[i].bankId
      if (bid && !seen[bid]) {
        seen[bid] = true
        chips.push({ id: bid, name: raw[i].bankName || bid })
      }
    }
    const list = []
    for (let i = 0; i < raw.length; i++) {
      const w = raw[i]
      if (active !== 'all' && w.bankId !== active) continue
      list.push({
        id: w.id,
        typeLabel: TYPE_LABELS[w.type || 'single'] || '单选',
        typeCls: TYPE_CLS[w.type || 'single'] || 'tag-single',
        question: w.question || '',
        ansText: ansText(w),
        exp: w.exp || '',
        hasExp: !!w.exp,
        bankName: w.bankName || '未知题库',
        delay: i / 20
      })
    }
    this.setData({ chips: chips, list: list, totalCount: raw.length })
  },

  // 切换分类筛选
  onChipTap(e) {
    this.setData({ activeType: e.currentTarget.dataset.id || 'all' })
    this.render()
  },

  // 移除单题（已掌握）：DELETE /api/wrong-book?id=xx
  onRemove(e) {
    const id = e.currentTarget.dataset.id
    const self = this
    api.del('/api/wrong-book?id=' + id).then((res) => {
      self._raw = (self._raw || []).filter(function (x) { return String(x.id) !== String(id) })
      store.setCache('wrongBook', self._raw)
      store.toastAchievements((res && res.newlyUnlocked) || [])
      toast.success('已移除错题')
      self.render()
    }).catch(function () {
      toast.error('操作失败')
    })
  },

  // 清空错题本：DELETE /api/wrong-book（不带参数 → 全清）
  onClearAll() {
    const self = this
    toast.confirm('确定清空错题本吗？', '清空错题本').then(function (ok) {
      if (!ok) return
      api.del('/api/wrong-book').then((res) => {
        self._raw = []
        store.setCache('wrongBook', [])
        store.toastAchievements((res && res.newlyUnlocked) || [])
        toast.success('错题本已清空')
        self.setData({ activeType: 'all' })
        self.render()
      }).catch(function () {
        toast.error('操作失败')
      })
    })
  },

  // 单题重做：与 Web retryOne 一致（exam 模式，题库署名「· 错题重练」）
  onRetry(e) {
    const id = e.currentTarget.dataset.id
    const w = (this._raw || []).find(function (x) { return String(x.id) === String(id) })
    if (!w) return
    quizState.init({
      bankId: w.bankId,
      bankName: (w.bankName || '') + ' · 错题重练',
      kind: 'quiz',
      mode: 'exam',
      questions: [{ id: w.questionId, type: w.type, q: w.question, opts: w.opts, ans: w.ans, exp: w.exp }],
      startTime: Date.now()
    })
    wx.navigateTo({ url: '/pages/quiz/quiz' })
  },

  // 空态「去刷题」→ 题库中心（tabBar 页必须 switchTab）
  goPractice() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})

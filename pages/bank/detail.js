// 题库详情：对齐 Web 版 pages/bank/[id].vue（路由守卫对齐 middleware/auth.global.ts，需登录）
// - GET /api/banks/{id}：题库详情含题目目录（测评题库不下发 ans/exp）
// - 三个入口：顺序练习(practice) / 错题重练(exam, GET /api/wrong-book?bankId=) / 随机10题(exam, GET /api/banks/{id}/random?n=10)
// - 测评题库（mbti/iq）：单一「开始测评」入口，kind='assessment'、mode='exam'
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')
const quizState = require('../../utils/quizState.js')

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

function emojiOf(bank) {
  return CAT_EMOJI[bank.type] || CAT_NAME_EMOJI[bank.typeName || bank.type_name] || '📚'
}

// '#8B5CF6' → '139,92,246'
function rgbStr(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '')
  if (!m) return null
  const n = parseInt(m[1], 16)
  return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255)
}

Page({
  data: {
    guest: false,
    loading: true,
    bank: null,
    coverBg: '',
    isAssessment: false,
    reportWord: '人格',
    assessCount: 0,
    progress: 0,
    pct: 0,
    wrongCount: 0,
    questions: [],
    loadingRandom: false,
    loadingWrong: false
  },

  onLoad(options) {
    this.bankId = (options && options.id) || ''
    this.bankRaw = null
    this.loaded = false
    this.loginJumped = false
  },

  onShow() {
    // 登录守卫（对齐 Web auth.global.ts：/bank/[id] 不在公开路径）
    if (!store.isLoggedIn()) {
      this.setData({ guest: true, loading: false })
      // 自动带去登录页只带一次，避免从登录页返回时反复压栈
      if (!this.loginJumped) {
        this.loginJumped = true
        wx.navigateTo({ url: '/pages/login/login' })
      }
      return
    }
    this.loginJumped = false
    if (this.data.guest) this.setData({ guest: false })
    if (!this.loaded) this.fetchBank()
    else this.refreshStats()
  },

  fetchBank() {
    this.setData({ loading: true })
    api.get('/api/banks/' + this.bankId).then((bank) => {
      this.loaded = true
      this.bankRaw = bank
      const rgb = rgbStr(bank.color)
      const typeName = bank.typeName || bank.type_name || bank.type || ''
      this.setData({
        loading: false,
        guest: false,
        bank: {
          id: bank.id,
          name: bank.name || '',
          description: bank.description || '',
          total: Number(bank.total || 0),
          typeName: typeName,
          difficulty: bank.difficulty || '',
          emoji: emojiOf(bank)
        },
        coverBg: rgb
          ? 'linear-gradient(160deg, rgba(' + rgb + ',0.4) 0%, rgba(11,17,32,0.2) 55%, #0B1120 100%)'
          : 'linear-gradient(160deg, #1C2942 0%, #0B1120 100%)',
        isAssessment: (bank.kind || 'quiz') === 'assessment',
        reportWord: bank.id === 'mbti' ? '人格' : '智商',
        assessCount: (bank.questions || []).length,
        questions: this.buildQuestionVMs(bank.questions || [], 0)
      })
      try { wx.setNavigationBarTitle({ title: bank.name || '题库详情' }) } catch (e) { /* 忽略 */ }
      this.refreshStats()
    }).catch((e) => {
      this.setData({ loading: false })
      toast.error((e && e.message) || '题库加载失败')
      // 对齐 Web：题库不存在时回题库中心（页面已被销毁则跳过）
      setTimeout(() => {
        const pages = getCurrentPages()
        const cur = pages[pages.length - 1]
        if (!cur || cur.route !== 'pages/bank/detail') return
        if (pages.length > 1) wx.navigateBack()
        else wx.switchTab({ url: '/pages/index/index' })
      }, 800)
    })
  },

  // 进度/错题数：先取本地缓存立即渲染，再拉服务端刷新（并回写缓存）
  refreshStats() {
    if (!this.bankRaw) return
    const applyProgress = (map) => {
      if (!this.bankRaw) return
      const total = Number(this.bankRaw.total || 0)
      const progress = Number((map || {})[this.bankId] || 0)
      this.setData({
        progress: progress,
        pct: total ? Math.min(100, Math.round((progress / total) * 100)) : 0,
        questions: this.buildQuestionVMs(this.bankRaw.questions || [], progress)
      })
    }
    applyProgress(store.getCache('bankProgress') || {})
    api.get('/api/progress').then((map) => {
      store.setCache('bankProgress', map || {})
      applyProgress(map)
    }).catch(() => { /* 静默 */ })

    const applyWrong = (list) => {
      const n = (list || []).filter((w) => w.bankId === this.bankId).length
      this.setData({ wrongCount: n })
    }
    applyWrong(store.getCache('wrongBook') || [])
    api.get('/api/wrong-book?bankId=' + this.bankId).then(applyWrong).catch(() => { /* 静默 */ })
  },

  buildQuestionVMs(questions, progress) {
    return (questions || []).map((q, i) => ({
      idx: i,
      no: i + 1,
      q: q.q || '',
      done: i < progress
    }))
  },

  // 统一入口：对齐 Web startQuiz(mode, questions, startIndex, name, kind)
  startQuiz(mode, questions, startIndex, name, kind) {
    if (!questions || !questions.length) return
    quizState.init({
      bankId: this.bankId,
      bankName: name || (this.bankRaw && this.bankRaw.name) || '',
      kind: kind || 'quiz',
      mode: mode,
      questions: questions,
      startTime: Date.now()
    })
    if (startIndex > 0) quizState.setCurrentIdx(startIndex)
    wx.navigateTo({ url: '/pages/quiz/quiz' })
  },

  // 顺序练习：从上次进度继续（Web: Math.min(progress, len-1)）
  startPractice() {
    const qs = (this.bankRaw && this.bankRaw.questions) || []
    if (!qs.length) {
      toast.info('该题库暂无题目')
      return
    }
    const start = Math.max(0, Math.min(this.data.progress, qs.length - 1))
    this.startQuiz('practice', qs, start, this.bankRaw.name)
  },

  // 测评：kind='assessment'、mode='exam'
  startAssessment() {
    const qs = (this.bankRaw && this.bankRaw.questions) || []
    if (!qs.length) {
      toast.info('该题库暂无题目')
      return
    }
    this.startQuiz('exam', qs, 0, this.bankRaw.name || '', 'assessment')
  },

  // 随机 10 题：GET /api/banks/{id}/random?n=10，mode='exam'
  startRandom() {
    if (this.data.loadingRandom) return
    this.setData({ loadingRandom: true })
    api.get('/api/banks/' + this.bankId + '/random?n=10').then((res) => {
      this.setData({ loadingRandom: false })
      if (!res.questions || !res.questions.length) {
        toast.info('该题库暂无题目')
        return
      }
      this.startQuiz('exam', res.questions, 0, (this.bankRaw.name || '') + ' · 随机' + res.questions.length + '题')
    }).catch(() => {
      this.setData({ loadingRandom: false })
      toast.error('抽题失败')
    })
  },

  // 错题重练：GET /api/wrong-book?bankId=，映射字段后 mode='exam'
  startWrong() {
    if (this.data.loadingWrong) return
    this.setData({ loadingWrong: true })
    api.get('/api/wrong-book?bankId=' + this.bankId).then((wrongs) => {
      this.setData({ loadingWrong: false, wrongCount: (wrongs || []).length })
      if (!wrongs || !wrongs.length) {
        toast.info('该题库暂无错题')
        return
      }
      const questions = wrongs.map((w) => ({
        id: w.questionId,
        type: w.type,
        q: w.question,
        opts: w.opts,
        ans: w.ans,
        exp: w.exp
      }))
      this.startQuiz('exam', questions, 0, (this.bankRaw.name || '') + ' · 错题重练')
    }).catch(() => {
      this.setData({ loadingWrong: false })
      toast.error('获取错题失败')
    })
  },

  // 题目目录单题直达：测评题库点击任意题重新开始测评，普通题库从该题顺序练习
  onQuestionTap(e) {
    const idx = Number(e.currentTarget.dataset.idx || 0)
    if (this.data.isAssessment) {
      this.startAssessment()
      return
    }
    const qs = (this.bankRaw && this.bankRaw.questions) || []
    this.startQuiz('practice', qs, idx, this.bankRaw.name)
  },

  goLogin() {
    this.loginJumped = true
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onRetry() {
    if (store.isLoggedIn()) this.fetchBank()
  }
})

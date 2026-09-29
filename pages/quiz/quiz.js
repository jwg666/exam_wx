// 答题页：逐行对齐 Web 版 pages/quiz.vue
// practice/exam × single/judge/multi × 已答/未答 全分支
// 注意：WXML 的 {{}} 内不能调函数，字母/评语/格式化时间等全部在 JS 预计算后 setData
const api = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')
const quizState = require('../../utils/quizState.js')
const fmt = require('../../utils/format.js')

const TYPE_LABELS = { single: '单选', judge: '判断', multi: '多选' }

Page({
  data: {
    headerLabel: '',      // 模式标签：人格测评/智商测评/自由练习/模拟考试
    curNum: 1,            // 当前题号（从 1 开始）
    total: 0,
    timeText: '0:00',     // 计时器文案（每秒 setData）
    progressPct: 0,       // 顶部细进度条宽度百分比
    cur: null,            // 当前题视图模型 { q, typeLabel, typeClass, isMulti, opts, ansText, exp }
    answered: false,      // 当前题是否已提交答案
    isCorrect: false,     // 当前题是否答对（practice 解析卡用）
    showExp: false,       // practice 已答后展示解析卡
    showFav: true,        // assessment 时隐藏收藏
    isFav: false,
    isFlagged: false,
    showSubmit: true,     // 未答 或 多选未确认 时显示提交按钮
    submitLabel: '提交答案',
    submitDisabled: false,
    showNav: false,       // 已答后显示 上一题/下一题
    prevDisabled: false,
    showNext: true,
    nextLabel: '下一题',
    nextIcon: '›',
    showSheet: false,     // 答题卡弹层
    grid: []              // 答题卡格子视图模型 [{ num, cls }]
  },

  // ---------- 生命周期 ----------
  onLoad() {
    if (!store.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const s = quizState.get()
    if (!s.bankId || !s.questions || s.questions.length === 0) {
      wx.reLaunch({ url: '/pages/index/index' })
      return
    }
    this._started = true
    this.setData({ timeText: fmt.formatClock(Math.floor((Date.now() - s.startTime) / 1000)) })
    this.startTimer()
    this.syncPage()
  },

  onShow() {
    if (this._started) {
      this.startTimer()
      this.syncPage()
    }
  },

  onHide() { this.stopTimer() },
  onUnload() { this.stopTimer() },

  startTimer() {
    this.stopTimer()
    this._timer = setInterval(() => {
      const s = quizState.get()
      this.setData({ timeText: fmt.formatClock(Math.floor((Date.now() - s.startTime) / 1000)) })
    }, 1000)
  },

  stopTimer() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  // ---------- 视图同步（全部预计算） ----------
  syncPage() {
    const s = quizState.get()
    const idx = s.currentIdx
    const q = s.questions[idx]
    if (!q) return
    const total = s.questions.length
    const type = q.type || 'single'
    const isMulti = type === 'multi'
    const practice = s.mode === 'practice'
    const answered = s.answered

    const headerLabel = s.kind === 'assessment'
      ? (s.bankId === 'mbti' ? '人格测评' : '智商测评')
      : (s.mode === 'exam' ? '模拟考试' : '自由练习')

    // optionState：与 Web 版完全一致
    // 多选 picked 取「已提交答案」answers[idx]；单选/判断取 selected[0]
    const pickedMulti = (isMulti && Array.isArray(s.answers[idx])) ? s.answers[idx] : []
    const rightMulti = (isMulti && Array.isArray(q.ans)) ? q.ans : []
    const pickedSingle = (!isMulti && Array.isArray(s.selected)) ? s.selected[0] : undefined

    const opts = []
    const optList = q.opts || []
    for (let i = 0; i < optList.length; i++) {
      let state = ''
      if (isMulti) {
        if (answered && practice) {
          // 正确选项一律标绿（无论是否被选中），错选标红
          if (rightMulti.indexOf(i) > -1) state = 'correct'
          else if (pickedMulti.indexOf(i) > -1) state = 'wrong'
        } else {
          state = pickedMulti.indexOf(i) > -1 ? 'selected' : ''
        }
      } else if (answered && practice) {
        if (i === q.ans) state = 'correct'
        else if (pickedSingle === i) state = 'wrong'
      } else {
        state = (pickedSingle === i && (!answered || s.mode === 'exam')) ? 'selected' : ''
      }

      // 勾/叉图标（与 Web 模板的 v-if 条件一致：仅 practice 已答后出现）
      let ok = false
      let no = false
      if (answered && practice) {
        if (isMulti) {
          ok = rightMulti.indexOf(i) > -1
        } else {
          ok = i === q.ans
          no = pickedSingle === i && i !== q.ans
        }
      }
      opts.push({ letter: fmt.letter(i), text: optList[i], state: state, ok: ok, no: no })
    }

    // 正确答案字母（多选顿号连接）
    const ansText = isMulti
      ? (Array.isArray(q.ans) ? q.ans : []).map((a) => fmt.letter(a)).join('、')
      : fmt.letter(q.ans)

    this.setData({
      headerLabel: headerLabel,
      curNum: idx + 1,
      total: total,
      progressPct: total ? ((idx + 1) / total) * 100 : 0,
      cur: {
        q: q.q,
        typeLabel: TYPE_LABELS[type] || '单选',
        typeClass: isMulti ? 'tag-multi' : (type === 'judge' ? 'tag-judge' : 'tag-single'),
        isMulti: isMulti,
        opts: opts,
        ansText: ansText,
        exp: q.exp || ''
      },
      answered: answered,
      isCorrect: quizState.isCorrectAt(idx),
      showExp: answered && practice,
      showFav: s.kind !== 'assessment',
      isFav: this.computeIsFav(q),
      isFlagged: !!s.flags[idx],
      showSubmit: !answered || isMulti,
      submitLabel: (answered && isMulti) ? '已提交' : (isMulti ? '确认答案' : '提交答案'),
      submitDisabled: answered && practice && isMulti,
      showNav: answered,
      prevDisabled: idx === 0,
      showNext: !isMulti || practice,
      nextLabel: idx === total - 1 ? '完成' : '下一题',
      nextIcon: idx === total - 1 ? '✓' : '›'
    })
  },

  computeIsFav(q) {
    const favs = store.getCache('favorites') || []
    for (let i = 0; i < favs.length; i++) {
      if (favs[i].questionId === q.id) return true
    }
    return false
  },

  // 答题卡格子：与 Web 版 class 判定逐条一致
  buildGrid() {
    const s = quizState.get()
    const practice = s.mode === 'practice'
    const grid = []
    for (let i = 0; i < s.questions.length; i++) {
      const answeredI = quizState.isAnsweredAt(i)
      const correctI = quizState.isCorrectAt(i)
      const flagged = !!s.flags[i]
      let cls = 'grid-item'
      if (s.currentIdx === i) cls += ' current'
      if (answeredI && !flagged && (s.mode === 'exam' || s.currentIdx === i)) cls += ' answered'
      if (flagged) cls += ' flagged'
      if (practice && answeredI && correctI && s.currentIdx !== i) cls += ' correct-small'
      if (practice && answeredI && !correctI && s.currentIdx !== i) cls += ' wrong-small'
      grid.push({ num: i + 1, cls: cls })
    }
    return grid
  },

  // ---------- 事件 ----------
  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.reLaunch({ url: '/pages/index/index' })
  },

  onSelectOption(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const s = quizState.get()
    const q = s.questions[s.currentIdx]
    if (!q) return
    const isMulti = (q.type || 'single') === 'multi'
    if (s.answered && s.mode === 'practice') return
    if (isMulti) {
      const arr = (s.selected || []).slice()
      const pos = arr.indexOf(idx)
      if (pos > -1) arr.splice(pos, 1)
      else arr.push(idx)
      quizState.setSelected(arr)
    } else {
      quizState.setSelected([idx])
      // 单选/判断在考试模式下选择即提交
      if (s.mode === 'exam') {
        this.submitAnswer()
        return
      }
    }
    this.syncPage()
  },

  onSubmitAnswer() {
    this.submitAnswer()
  },

  submitAnswer() {
    const s = quizState.get()
    const q = s.questions[s.currentIdx]
    if (!q) return
    const isMulti = (q.type || 'single') === 'multi'
    if (!isMulti && (!s.selected || s.selected.length !== 1)) {
      toast.warning('请先选择一个选项')
      return
    }
    if (isMulti && (!s.selected || s.selected.length === 0)) {
      toast.warning('请先选择选项（多选）')
      return
    }
    quizState.setAnswerAt(s.currentIdx, isMulti ? s.selected.slice().sort((a, b) => a - b) : s.selected[0])
    quizState.setAnswered(true)
    if (s.mode === 'exam') {
      this.goNext()
    } else {
      this.syncPage()
    }
  },

  onNextTap() {
    this.goNext()
  },

  goNext() {
    const s = quizState.get()
    if (s.currentIdx < s.questions.length - 1) {
      const next = s.currentIdx + 1
      quizState.setCurrentIdx(next)
      this.restoreAnswerAt(next)
      this.syncPage()
    } else {
      this.finishQuiz()
    }
  },

  onPrev() {
    const s = quizState.get()
    if (s.currentIdx > 0) {
      const prev = s.currentIdx - 1
      quizState.setCurrentIdx(prev)
      this.restoreAnswerAt(prev)
      this.syncPage()
    }
  },

  onToggleFav() {
    const s = quizState.get()
    const q = s.questions[s.currentIdx]
    if (!q) return
    api.post('/api/favorites', { questionId: q.id }).then((res) => {
      const favs = (store.getCache('favorites') || []).slice()
      if (res.favorited) {
        favs.push({
          questionId: q.id,
          bankId: s.bankId,
          question: q.q,
          opts: q.opts,
          ans: q.ans,
          type: q.type || 'single',
          exp: q.exp
        })
        store.setCache('favorites', favs)
        toast.success('收藏成功')
      } else {
        store.setCache('favorites', favs.filter((f) => f.questionId !== q.id))
        toast.info('已取消收藏')
      }
      store.toastAchievements(res.newlyUnlocked || [])
      this.setData({ isFav: this.computeIsFav(q) })
    }).catch(() => {
      toast.error('操作失败')
    })
  },

  onToggleFlag() {
    const s = quizState.get()
    quizState.toggleFlagAt(s.currentIdx)
    this.syncPage()
  },

  onOpenSheet() {
    this.setData({ showSheet: true, grid: this.buildGrid() })
  },

  onCloseSheet() {
    this.setData({ showSheet: false })
  },

  onGridTap(e) {
    const i = Number(e.currentTarget.dataset.idx)
    quizState.setCurrentIdx(i)
    this.restoreAnswerAt(i)
    this.setData({ showSheet: false })
    this.syncPage()
  },

  onFinish() {
    this.finishQuiz()
  },

  // 跳题/翻题后恢复现场：有答案则恢复 selected/answered，无则清空
  restoreAnswerAt(i) {
    const s = quizState.get()
    const q = s.questions[i]
    if (!q) return
    const isMulti = (q.type || 'single') === 'multi'
    const a = s.answers[i]
    if (a === undefined) {
      quizState.setSelected([])
      quizState.setAnswered(false)
    } else {
      quizState.setSelected(isMulti && Array.isArray(a) ? a.slice() : [a])
      quizState.setAnswered(true)
    }
  },

  // 交卷：与 Web 版 finishQuiz 逐步对齐
  finishQuiz() {
    const s = quizState.get()
    const total = s.questions.length
    let unanswered = 0
    for (let i = 0; i < total; i++) {
      if (!quizState.isAnsweredAt(i)) unanswered++
    }
    if (unanswered > 0) {
      toast.confirm('还有 ' + unanswered + ' 题未作答，确定交卷吗？').then((ok) => {
        if (ok) this.doSubmit()
      })
      return
    }
    this.doSubmit()
  },

  doSubmit() {
    const s = quizState.get()
    const total = s.questions.length
    const elapsed = Math.floor((Date.now() - s.startTime) / 1000)

    // 原始作答数组（按题目顺序，未答为 -1），服务端统一判分
    const answers = []
    for (let i = 0; i < total; i++) {
      const a = s.answers[i]
      answers.push(a === undefined ? -1 : a)
    }

    // 本地判分（assessment 无对错概念）
    let correct = 0
    const wrongQuestions = []
    if (s.kind !== 'assessment') {
      for (let i = 0; i < total; i++) {
        if (quizState.isCorrectAt(i)) correct++
        else wrongQuestions.push(s.questions[i].id)
      }
    }
    const score = Math.round((correct / total) * 100) || 0

    api.post('/api/quiz/submit', {
      bankId: s.bankId,
      timeSpent: elapsed,
      answers: answers
    }).then((res) => {
      store.toastAchievements(res.newlyUnlocked || [])
      const report = res.report
      const countsForStats = report ? report.kind === 'iq' : true
      const user = store.getUser()
      if (user && countsForStats) {
        store.updateUser({
          totalAnswered: (user.totalAnswered || 0) + total,
          totalCorrect: (user.totalCorrect || 0) + correct
        })
      }
      quizState.setElapsed(elapsed)
      quizState.setResult({
        bankId: s.bankId,
        bankName: s.bankName,
        mode: s.mode,
        kind: s.kind,
        total: total,
        correct: countsForStats ? correct : 0,
        wrong: countsForStats ? total - correct : 0,
        // score 取值照抄 Web：iq 报告用 report.iq，mbti 用 100，普通用百分制
        score: report ? (report.kind === 'iq' ? report.iq : 100) : score,
        elapsed: elapsed,
        report: report || null
      })
      wx.redirectTo({ url: '/pages/result/result' })
    }).catch((e) => {
      console.error('Submit to server failed', e)
      toast.error('提交失败，请重试')
    })
  },

  noop() {}
})

// 结算页：逐行对齐 Web 版 pages/result.vue
// 环形进度用 <canvas type="2d"> 实现（小程序无 SVG），弧长 ~1s requestAnimationFrame 动画
// {{}} 内不能调函数，中心文字/评语/用时等全部在 JS 预计算后 setData
const store = require('../../utils/store.js')
const quizState = require('../../utils/quizState.js')
const fmt = require('../../utils/format.js')

Page({
  data: {
    ready: false,
    pageTitle: '',      // 测评完成 / 答题完成
    subTitle: '',       // 题库名 · 测评报告/模拟考试/自由练习
    comment: '',        // 评语
    centerText: '',     // 圆环中央大数字（MBTI=typeCode / IQ=iq / 普通=分数）
    centerLabel: '',    // 圆环中央小字（人格类型 / IQ · tier / 分）
    centerSmall: false, // MBTI 中央数字用小字号
    isMbti: false,
    isIq: false,
    hasReport: false,
    report: null,
    correct: 0,
    wrong: 0,
    total: 0,
    elapsedText: ''     // fmt.formatDuration 预计算
  },

  onLoad() {
    if (!store.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const r = quizState.get().result
    if (!r) {
      wx.reLaunch({ url: '/pages/index/index' })
      return
    }

    const report = r.report || null
    const isMbti = !!report && report.kind === 'mbti'
    const isIq = !!report && report.kind === 'iq'
    const hasReport = !!report

    // 圆环中心：MBTI 显示人格代码，IQ 显示智商值，普通题显示百分制分数
    const centerText = isMbti ? report.typeCode : String(r.score == null ? 0 : r.score)
    const centerLabel = isMbti ? '人格类型' : (isIq ? 'IQ · ' + report.tier : '分')

    // 圆环进度：MBTI 用完成度，IQ 按智商值映射（60-145 → 0-100%），普通用分数
    let ringPct
    if (isMbti) ringPct = 100
    else if (isIq) ringPct = Math.min(100, Math.max(0, ((report.iq - 60) / 85) * 100))
    else ringPct = r.score || 0

    // 评语：MBTI 用 tagline，IQ 用 advice，普通按 100/80/60 档位
    let comment
    if (isMbti) comment = report.tagline
    else if (isIq) comment = report.advice
    else {
      const score = r.score || 0
      if (score === 100) comment = '完美无瑕！全部答对，你就是题海之王！'
      else if (score >= 80) comment = '非常出色！继续保持这个状态。'
      else if (score >= 60) comment = '不错的成绩，错题记得回顾哦。'
      else comment = '别灰心，把错题加入错题本多多练习吧。'
    }

    this._targetPct = ringPct
    this._isIq = isIq
    this._tierColor = isIq ? report.tierColor : ''

    this.setData({
      ready: true,
      pageTitle: hasReport ? '测评完成' : '答题完成',
      subTitle: (r.bankName || '综合练习') + ' · ' + (hasReport ? '测评报告' : (r.mode === 'exam' ? '模拟考试' : '自由练习')),
      comment: comment,
      centerText: centerText,
      centerLabel: centerLabel,
      centerSmall: isMbti,
      isMbti: isMbti,
      isIq: isIq,
      hasReport: hasReport,
      report: report,
      correct: r.correct || 0,
      wrong: r.wrong || 0,
      total: r.total || 0,
      elapsedText: fmt.formatDuration(r.elapsed || 0)
    })
  },

  onReady() {
    if (!this.data.ready) return
    const query = wx.createSelectorQuery()
    query.select('#ringCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return
      const canvas = res[0].node
      const size = res[0].width
      let dpr = 2
      try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        dpr = info.pixelRatio || 2
      } catch (e) { dpr = 2 }
      canvas.width = size * dpr
      canvas.height = size * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      this._canvas = canvas
      this._ctx = ctx
      this._size = size
      this.animateRing(this._targetPct || 0)
    })
  },

  onUnload() {
    if (this._canvas && this._raf && this._canvas.cancelAnimationFrame) {
      this._canvas.cancelAnimationFrame(this._raf)
    }
    this._canvas = null
    this._ctx = null
  },

  // 弧长动画 ~1s（ease-out），与 Web 版 transition duration-1000 对齐
  animateRing(target) {
    const canvas = this._canvas
    if (!canvas || !canvas.requestAnimationFrame) {
      this.drawRing(target)
      return
    }
    const duration = 1000
    const start = Date.now()
    const step = () => {
      if (!this._ctx) return
      let t = (Date.now() - start) / duration
      if (t > 1) t = 1
      const eased = 1 - Math.pow(1 - t, 3)
      this.drawRing(target * eased)
      if (t < 1) this._raf = canvas.requestAnimationFrame(step)
    }
    this._raf = canvas.requestAnimationFrame(step)
  },

  // 环形进度：底环 #162032、进度弧 lineCap round
  // 普通题 teal→blue 线性渐变（对齐 Web 的 linearGradient #0D9488→#3B82F6），IQ 用 report.tierColor
  drawRing(pct) {
    const ctx = this._ctx
    if (!ctx) return
    const S = this._size
    const cx = S / 2
    const cy = S / 2
    const r = S * 0.45          // viewBox 120 中 r=54
    const lw = S * (8 / 120)    // stroke-width 8

    ctx.clearRect(0, 0, S, S)

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = '#162032'
    ctx.lineWidth = lw
    ctx.stroke()

    if (pct <= 0) return

    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100)
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.shadowColor = 'rgba(20, 184, 166, 0.45)'
    ctx.shadowBlur = S * 0.08
    if (this._isIq && this._tierColor) {
      ctx.strokeStyle = this._tierColor
    } else {
      const g = ctx.createLinearGradient(0, cy, S, cy)
      g.addColorStop(0, '#0D9488')
      g.addColorStop(1, '#3B82F6')
      ctx.strokeStyle = g
    }
    ctx.stroke()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  },

  // ---------- 按钮 ----------
  onGoBank() {
    const r = quizState.get().result
    wx.redirectTo({ url: '/pages/bank/detail?id=' + ((r && r.bankId) || '') })
  },

  onGoWrong() {
    wx.redirectTo({ url: '/pages/wrong/wrong' })
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})

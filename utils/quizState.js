// 答题现场状态：对齐 Web 版 stores/quiz.ts（含本地持久化与判分逻辑）
// 所有修改必须通过下方 mutator 方法（内部自动落盘），不要直接改 get() 返回的对象后不 save
const KEY = 'wx_quiz_state'

function defaults() {
  return {
    bankId: null,          // 题库 id；测评题为 'mbti' / 'iq'
    bankName: '',
    kind: 'quiz',          // 'quiz' | 'assessment'
    questions: [],         // [{ id, q, opts, ans, type, exp, meta? }]
    currentIdx: 0,
    answers: {},           // { [idx]: number | number[] }
    flags: {},             // { [idx]: boolean }
    selected: [],          // 当前题已点选的选项索引数组
    answered: false,       // 当前题是否已提交答案
    startTime: 0,
    elapsed: 0,
    mode: 'practice',      // 'practice' | 'exam'
    result: null           // 交卷后的结果快照（结算页展示用）
  }
}

let state = null

function load() {
  if (state) return state
  try {
    state = wx.getStorageSync(KEY) || defaults()
  } catch (e) {
    state = defaults()
  }
  const def = defaults()
  for (const k in def) {
    if (state[k] === undefined) state[k] = def[k]
  }
  return state
}

function save() {
  try { wx.setStorageSync(KEY, state) } catch (e) { /* 忽略 */ }
}

// 开启一次答题（进入 quiz 页前由入口页调用）
function init(payload) {
  const s = load()
  const def = defaults()
  s.bankId = payload.bankId
  s.bankName = payload.bankName || ''
  s.kind = payload.kind || 'quiz'
  s.mode = payload.mode || 'practice'
  s.questions = payload.questions || []
  s.startTime = payload.startTime || Date.now()
  s.currentIdx = 0
  s.answers = {}
  s.flags = {}
  s.selected = []
  s.answered = false
  s.elapsed = 0
  s.result = null
  save()
  return s
}

function get() { return load() }

function reset() {
  state = defaults()
  save()
}

// ---------- mutators ----------
function setCurrentIdx(i) { const s = load(); s.currentIdx = i; save() }
function setAnswers(a) { const s = load(); s.answers = a; save() }
function setAnswerAt(i, val) { const s = load(); s.answers[i] = val; save() }
function setFlags(f) { const s = load(); s.flags = f; save() }
function toggleFlagAt(i) { const s = load(); s.flags[i] = !s.flags[i]; save() }
function setSelected(arr) { const s = load(); s.selected = arr; save() }
function setAnswered(b) { const s = load(); s.answered = b; save() }
function setElapsed(sec) { const s = load(); s.elapsed = sec; save() }
function setResult(r) { const s = load(); s.result = r; save() }

// ---------- 判分（与 Web 版完全一致） ----------
// 单题是否已作答
function isAnsweredAt(i) {
  const s = load()
  return s.answers[i] !== undefined
}

// 多选须完全一致，单选/判断比较索引
function isCorrectAt(i) {
  const s = load()
  const q = s.questions[i]
  const a = s.answers[i]
  if (!q || a === undefined || q.ans === undefined) return false
  if ((q.type || 'single') === 'multi') {
    const right = Array.isArray(q.ans) ? q.ans.slice().sort() : []
    const got = Array.isArray(a) ? a.slice().sort() : []
    return right.length === got.length && right.every((v, idx) => v === got[idx])
  }
  return a === q.ans
}

module.exports = {
  init,
  get,
  reset,
  setCurrentIdx,
  setAnswers,
  setAnswerAt,
  setFlags,
  toggleFlagAt,
  setSelected,
  setAnswered,
  setElapsed,
  setResult,
  isAnsweredAt,
  isCorrectAt
}

// 题库管理后台（迁移自 Web 版 pages/admin.vue）
// 模块：权限守卫 / 题库列表+新建+编辑+删除 / 分类管理（列表+新增+编辑+删除）/ 题目管理（加载+新增+编辑+删除）
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')

const DIFFICULTIES = ['简单', '中等', '困难']
const TYPE_LABELS = { single: '单选', judge: '判断', multi: '多选' }
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function emptyBankForm() {
  return { id: '', name: '', type: '', typeName: '', difficulty: '中等', description: '' }
}

// 选项行（对象承载，便于 wx:key 与逐行输入）
function rows4() {
  return [
    { i: 0, v: '' },
    { i: 1, v: '' },
    { i: 2, v: '' },
    { i: 3, v: '' }
  ]
}

function judgeRows() {
  return [
    { i: 0, v: '正确' },
    { i: 1, v: '错误' }
  ]
}

Page({
  data: {
    // 权限与题库列表
    denied: false,
    loading: true,
    banks: [],

    // 新建/编辑题库弹层
    showBankForm: false,
    editingBank: false,
    bankForm: emptyBankForm(),
    catNames: [],
    difficulties: DIFFICULTIES,

    // 分类管理弹层
    showCats: false,
    cats: [],
    newCat: { code: '', name: '', sort: '' },

    // 题目管理弹层
    showManage: false,
    manageName: '',
    manageCount: 0,
    questions: [],
    loadingQuestions: false,

    // 新增/编辑题目弹层
    showQuestion: false,
    editingQuestionId: 0,
    qTypes: [
      { k: 'single', label: '单选' },
      { k: 'judge', label: '判断' },
      { k: 'multi', label: '多选' }
    ],
    letters: LETTERS,
    qForm: { type: 'single', content: '', explanation: '', ansSet: [] },
    qOpts: rows4(),
    qAnsMarks: [false, false, false, false]
  },

  onLoad() {
    this._banks = []
    this._categories = []
    this._questions = []
    this._manageBank = null
    this._editBank = null
    this._firstLoad = true
  },

  // ---------- 权限守卫 ----------
  onShow() {
    if (!store.isLoggedIn()) {
      this.setData({ denied: true, loading: false })
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    const u = store.getUser()
    if (!u || !u.isAdmin) {
      this.setData({ denied: true, loading: false })
      return
    }
    this.setData({ denied: false })
    this.loadBanks(this._firstLoad)
    this._firstLoad = false
    this.loadCategories()
  },

  // ---------- 题库列表 ----------
  loadBanks(spinner) {
    if (spinner) this.setData({ loading: true })
    api.get('/api/admin/banks').then((rows) => {
      this._banks = rows || []
      this.setData({
        loading: false,
        banks: this._banks.map((b) => ({
          id: b.id,
          name: b.name,
          typeLabel: b.type_name || b.type || '未分类',
          difficulty: b.difficulty || '中等',
          count: Number(b.question_count) || 0,
          color: b.color || '#3B82F6',
          kind: b.kind === 'assessment' ? '测评' : '练习',
          isAssessment: b.kind === 'assessment'
        }))
      })
    }).catch((e) => {
      this.setData({ loading: false })
      // 已登录但非管理员：服务端 403，展示无权限空态
      if (e && e.statusCode === 403) {
        this.setData({ denied: true })
        return
      }
      toast.error('加载题库失败')
    })
  },

  findBank(id) {
    return this._banks.filter((b) => b.id === id)[0]
  },

  // ---------- 新建/编辑题库 ----------
  openCreateBank() {
    this.setData({ showBankForm: true, editingBank: false, bankForm: emptyBankForm() })
  },

  openEditBank(e) {
    const b = this.findBank(e.currentTarget.dataset.id)
    if (!b) return
    this._editBank = b
    this.setData({
      showBankForm: true,
      editingBank: true,
      bankForm: {
        id: b.id,
        name: b.name,
        type: b.type || '',
        typeName: b.type_name || b.type || '',
        difficulty: b.difficulty || '中等',
        description: b.description || ''
      }
    })
  },

  closeBankForm() {
    this.setData({ showBankForm: false })
  },

  onBankFormInput(e) {
    this.setData({ ['bankForm.' + e.currentTarget.dataset.field]: e.detail.value })
  },

  // 分类选择：对齐 Web onBankTypeChange，同步 typeName
  onBankTypePick(e) {
    const cat = this._categories[Number(e.detail.value)]
    if (!cat) return
    this.setData({ 'bankForm.type': cat.code, 'bankForm.typeName': cat.name })
  },

  onBankDiffPick(e) {
    this.setData({ 'bankForm.difficulty': DIFFICULTIES[Number(e.detail.value)] || '中等' })
  },

  submitBank() {
    const editing = this.data.editingBank
    const f = this.data.bankForm
    if (!editing && !/^[a-z0-9_-]{2,50}$/.test(f.id)) {
      toast.warning('题库 ID 须为 2~50 位小写字母/数字/中划线')
      return
    }
    if (!String(f.name).trim()) {
      toast.warning('题库名称不能为空')
      return
    }
    const cat = this._categories.filter((c) => c.code === f.type)[0]
    const body = {
      id: String(f.id).trim(),
      name: String(f.name).trim(),
      type: f.type,
      typeName: cat ? cat.name : f.typeName,
      difficulty: f.difficulty,
      description: f.description
    }
    // 编辑时保留原有图标/颜色（服务端 PUT 对缺省字段会重置为默认值）
    if (editing && this._editBank) {
      body.icon = this._editBank.icon
      body.color = this._editBank.color
    }
    const req = editing
      ? api.put('/api/admin/banks/' + body.id, body)
      : api.post('/api/admin/banks', body)
    req.then(() => {
      toast.success(editing ? '题库已保存' : '题库已创建')
      if (editing && this._manageBank && this._manageBank.id === body.id) {
        this._manageBank.name = body.name
        this.setData({ manageName: body.name })
      }
      this.setData({ showBankForm: false })
      this.loadBanks()
    }).catch((err) => {
      toast.error(err.message || (editing ? '保存失败' : '创建失败'))
    })
  },

  // ---------- 删除题库 ----------
  deleteBank(e) {
    const b = this.findBank(e.currentTarget.dataset.id)
    if (!b) return
    toast.confirm('确定删除题库「' + b.name + '」？其下所有题目将一并删除。').then((ok) => {
      if (!ok) return
      api.del('/api/admin/banks/' + b.id).then(() => {
        toast.success('已删除')
        if (this._manageBank && this._manageBank.id === b.id) {
          this._manageBank = null
          this.setData({ showManage: false })
        }
        this.loadBanks()
      }).catch(() => toast.error('删除失败'))
    })
  },

  // ---------- 分类管理 ----------
  loadCategories() {
    return api.get('/api/categories').then((rows) => {
      this._categories = rows || []
      this.setData({
        catNames: this._categories.map((c) => c.name),
        cats: this._categories.map((c) => ({ id: c.id, code: c.code, name: c.name, sort: c.sort }))
      })
    }).catch(() => { /* 分类加载失败不阻塞页面 */ })
  },

  openCategories() {
    this.setData({ showCats: true })
    this.loadCategories()
  },

  closeCategories() {
    this.setData({ showCats: false })
  },

  onCatInput(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    this.setData({ ['cats[' + idx + '].' + e.currentTarget.dataset.field]: e.detail.value })
  },

  onNewCatInput(e) {
    this.setData({ ['newCat.' + e.currentTarget.dataset.field]: e.detail.value })
  },

  createCategory() {
    const c = this.data.newCat
    if (!String(c.code).trim()) {
      toast.warning('请输入分类编码')
      return
    }
    if (!String(c.name).trim()) {
      toast.warning('请输入分类名称')
      return
    }
    api.post('/api/admin/categories', {
      code: String(c.code).trim(),
      name: String(c.name).trim(),
      sort: Number(c.sort) || 0
    }).then(() => {
      toast.success('分类已创建')
      this.setData({ newCat: { code: '', name: '', sort: '' } })
      this.loadCategories()
    }).catch((err) => toast.error(err.message || '创建失败'))
  },

  saveCategory(e) {
    const c = this.data.cats[Number(e.currentTarget.dataset.idx)]
    if (!c) return
    if (!String(c.name).trim()) {
      toast.warning('分类名称不能为空')
      return
    }
    api.put('/api/admin/categories/' + c.id, {
      name: String(c.name).trim(),
      sort: Number(c.sort) || 0
    }).then(() => {
      toast.success('分类已保存')
      this.loadCategories()
    }).catch((err) => toast.error(err.message || '保存失败'))
  },

  deleteCategory(e) {
    const c = this.data.cats[Number(e.currentTarget.dataset.idx)]
    if (!c) return
    toast.confirm('确定删除分类「' + c.name + '」？').then((ok) => {
      if (!ok) return
      api.del('/api/admin/categories/' + c.id).then(() => {
        toast.success('已删除')
        this.loadCategories()
      }).catch((err) => toast.error(err.message || '删除失败'))
    })
  },

  // ---------- 题目管理 ----------
  openManage(e) {
    const b = this.findBank(e.currentTarget.dataset.id)
    if (!b) return
    this._manageBank = b
    this.setData({
      showManage: true,
      manageName: b.name,
      manageCount: Number(b.question_count) || 0,
      questions: [],
      loadingQuestions: true
    })
    this.loadQuestions()
  },

  closeManage() {
    this._manageBank = null
    this.setData({ showManage: false })
  },

  loadQuestions() {
    const b = this._manageBank
    if (!b) return
    this.setData({ loadingQuestions: true })
    api.get('/api/banks/' + b.id).then((detail) => {
      this.renderQuestions((detail && detail.questions) || [])
      this.setData({ loadingQuestions: false })
    }).catch(() => {
      this.setData({ loadingQuestions: false })
      toast.error('加载题目失败')
    })
  },

  renderQuestions(list) {
    this._questions = list
    this.setData({
      manageCount: list.length,
      questions: list.map((q, i) => ({
        id: q.id,
        idx: i + 1,
        q: q.q,
        typeLabel: TYPE_LABELS[q.type] || '单选',
        ansText: this.ansTextOf(q)
      }))
    })
  },

  // 答案转字母（多选数组用「、」连接；测评题库答案不下发则显示 —）
  ansTextOf(q) {
    if (q.ans === undefined || q.ans === null) return '—'
    if (Array.isArray(q.ans)) return q.ans.map((a) => LETTERS[a] || '?').join('、')
    return LETTERS[q.ans] || String(q.ans)
  },

  // 同步题库列表里的题数（删除题目后本地即时更新）
  syncBankCount(bankId, count) {
    this.setData({
      banks: this.data.banks.map((b) => (b.id === bankId ? Object.assign({}, b, { count: count }) : b))
    })
    const raw = this.findBank(bankId)
    if (raw) raw.question_count = count
    if (this._manageBank && this._manageBank.id === bankId) this._manageBank.question_count = count
  },

  deleteQuestion(e) {
    const qid = Number(e.currentTarget.dataset.qid)
    toast.confirm('确定删除该题目？').then((ok) => {
      if (!ok) return
      api.del('/api/admin/questions/' + qid).then(() => {
        toast.success('已删除')
        const rest = this._questions.filter((q) => q.id !== qid)
        this.renderQuestions(rest)
        const b = this._manageBank
        if (b) this.syncBankCount(b.id, rest.length)
      }).catch(() => toast.error('删除失败'))
    })
  },

  // ---------- 新增/编辑题目 ----------
  resetQuestionForm() {
    this.setData({
      editingQuestionId: 0,
      qForm: { type: 'single', content: '', explanation: '', ansSet: [] },
      qOpts: rows4(),
      qAnsMarks: [false, false, false, false]
    })
  },

  openAddQuestion() {
    this.resetQuestionForm()
    this.setData({ showQuestion: true })
  },

  // 点击题目行进入编辑，回填表单
  openEditQuestion(e) {
    const qid = Number(e.currentTarget.dataset.qid)
    const q = this._questions.filter((x) => x.id === qid)[0]
    if (!q) return
    const type = q.type || 'single'
    let opts = (q.opts || []).map((o) => String(o))
    if (type === 'judge') {
      opts = ['正确', '错误']
    } else {
      while (opts.length < 4) opts.push('')
    }
    const ansSet = Array.isArray(q.ans)
      ? q.ans.slice()
      : (q.ans === undefined || q.ans === null ? [] : [q.ans])
    this.setData({
      showQuestion: true,
      editingQuestionId: qid,
      qForm: { type: type, content: q.q || '', explanation: q.exp || '', ansSet: ansSet },
      qOpts: opts.map((v, i) => ({ i: i, v: v })),
      qAnsMarks: opts.map((_, i) => ansSet.indexOf(i) > -1)
    })
  },

  closeQuestion() {
    this.setData({ showQuestion: false })
    this.resetQuestionForm()
  },

  // 切换题型：判断题固定「正确/错误」，从判断切回恢复四空行，清空已选答案（对齐 Web onTypeChange）
  setType(e) {
    const t = e.currentTarget.dataset.type
    const prev = this.data.qOpts
    let rows
    if (t === 'judge') {
      rows = judgeRows()
    } else if (prev.length === 2 && prev[0].v === '正确') {
      rows = rows4()
    } else {
      rows = prev
    }
    this.setData({
      'qForm.type': t,
      qOpts: rows,
      'qForm.ansSet': [],
      qAnsMarks: rows.map(() => false)
    })
  },

  onQFormInput(e) {
    this.setData({ ['qForm.' + e.currentTarget.dataset.field]: e.detail.value })
  },

  onOptInput(e) {
    const i = Number(e.currentTarget.dataset.idx)
    this.setData({ ['qOpts[' + i + '].v']: e.detail.value })
  },

  // 点字母设答案：单选/判断为数字索引，多选为数组切换（对齐 Web toggleAns）
  toggleAns(e) {
    const i = Number(e.currentTarget.dataset.idx)
    if (this.data.qForm.type === 'multi') {
      const set = this.data.qForm.ansSet || []
      const pos = set.indexOf(i)
      const next = pos > -1
        ? set.filter((n) => n !== i)
        : set.concat([i]).sort((a, b) => a - b)
      this.setData({ 'qForm.ansSet': next })
    } else {
      this.setData({ 'qForm.ansSet': [i] })
    }
    const set = this.data.qForm.ansSet || []
    this.setData({ qAnsMarks: this.data.qOpts.map((row) => set.indexOf(row.i) > -1) })
  },

  saveQuestion() {
    const bank = this._manageBank
    if (!bank) return
    const qf = this.data.qForm
    if (!String(qf.content).trim()) {
      toast.warning('请输入题干')
      return
    }
    const opts = this.data.qOpts.map((r) => String(r.v).trim()).filter((v) => v)
    if (opts.length < 2) {
      toast.warning('至少两个选项')
      return
    }
    const ansSet = qf.ansSet || []
    if (!ansSet.length) {
      toast.warning('请选择正确答案')
      return
    }
    const body = {
      type: qf.type,
      content: qf.content,
      opts: opts,
      ans: qf.type === 'multi' ? ansSet : ansSet[0],
      explanation: qf.explanation
    }
    const editing = this.data.editingQuestionId > 0
    const req = editing
      ? api.put('/api/admin/questions/' + this.data.editingQuestionId, body)
      : api.post('/api/admin/banks/' + bank.id + '/questions', body)
    req.then(() => {
      toast.success(editing ? '题目已保存' : '题目已添加')
      this.setData({ showQuestion: false })
      this.resetQuestionForm()
      this.loadQuestions()
      this.loadBanks()
    }).catch((err) => {
      toast.error(err.message || (editing ? '保存失败' : '添加失败'))
    })
  },

  // 遮罩点击关闭、弹层内容 catchtap 阻止冒泡
  noop() {}
})

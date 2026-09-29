// 登录/注册页：对齐 Web 版 pages/login.vue
// - 密码登录（存量账号）/ 验证码登录 分段切换；注册 = 昵称(选填) + 手机号 + 验证码
// - 获取验证码 60s 倒计时（onUnload 清理定时器），mock 提示输入 123456
// - 登录/注册成功统一走 afterAuth：setSession → 成就弹幕 → toast → fetchAll → 进入首页
const { api } = require('../../utils/api.js')
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')

Page({
  data: {
    isLoginMode: true,      // true=登录 / false=注册
    authMode: 'password',   // 密码登录 password / 验证码登录 sms
    phone: '',
    password: '',
    name: '',
    code: '',
    isPasswordVisible: false,
    submitting: false,
    countdown: 0
  },

  onUnload() {
    this.stopCountdown()
  },

  // ---------- 输入 ----------
  onPhoneInput(e) { this.setData({ phone: e.detail.value }) },
  onPasswordInput(e) { this.setData({ password: e.detail.value }) },
  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onCodeInput(e) { this.setData({ code: e.detail.value }) },

  togglePasswordVisible() {
    this.setData({ isPasswordVisible: !this.data.isPasswordVisible })
  },

  // 登录/注册形态切换：清空全部字段并回到密码登录（与 Web toggleMode 一致）
  toggleMode() {
    this.setData({
      isLoginMode: !this.data.isLoginMode,
      authMode: 'password',
      phone: '',
      password: '',
      name: '',
      code: ''
    })
  },

  switchAuthMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode && mode !== this.data.authMode) this.setData({ authMode: mode })
  },

  // ---------- 验证码 ----------
  stopCountdown() {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer)
      this._countdownTimer = null
    }
  },

  startCountdown() {
    this.stopCountdown()
    this.setData({ countdown: 60 })
    this._countdownTimer = setInterval(() => {
      const next = this.data.countdown - 1
      if (next <= 0) {
        this.stopCountdown()
        this.setData({ countdown: 0 })
      } else {
        this.setData({ countdown: next })
      }
    }, 1000)
  },

  async sendCode() {
    const phone = this.data.phone.trim()
    if (!/^1\d{10}$/.test(phone)) {
      toast.error('请输入正确的手机号')
      return
    }
    if (this.data.countdown > 0) return
    try {
      const res = await api.post('/api/auth/sms/send', { phone })
      this.startCountdown()
      if (res.provider === 'mock') {
        toast.info('当前为开发模式，验证码请输入 123456')
      } else {
        toast.info('验证码已发送，请注意查收短信')
      }
    } catch (e) {
      toast.error(e.message || '验证码发送失败')
    }
  },

  // ---------- 登录 / 注册 ----------
  async afterAuth(data, msg) {
    store.setSession(data)
    store.toastAchievements(data.newlyUnlocked || [])
    toast.success(msg)
    try {
      await store.fetchAll()
    } catch (e) { /* 全量数据拉取失败不阻塞进入首页 */ }
    wx.switchTab({ url: '/pages/index/index' })
  },

  async handleLogin() {
    const phone = this.data.phone.trim()
    const isPassword = this.data.authMode === 'password'
    if (!phone || (isPassword ? !this.data.password : !this.data.code.trim())) {
      toast.error(isPassword ? '请输入手机号和密码' : '请输入手机号和验证码')
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const body = isPassword
        ? { phone: phone, password: this.data.password }
        : { phone: phone, code: this.data.code.trim() }
      const data = await api.post('/api/auth/login', body)
      await this.afterAuth(data, '登录成功')
    } catch (e) {
      toast.error(e.message || '网络错误')
    } finally {
      this.setData({ submitting: false })
    }
  },

  async handleRegister() {
    const phone = this.data.phone.trim()
    const code = this.data.code.trim()
    if (!phone || !code) {
      toast.error('请输入手机号和验证码')
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const data = await api.post('/api/auth/register', {
        name: this.data.name.trim(),
        phone: phone,
        code: code
      })
      await this.afterAuth(data, '注册成功')
    } catch (e) {
      toast.error(e.message || '网络错误')
    } finally {
      this.setData({ submitting: false })
    }
  }
})

// 请求层：与 Web 版 plugins/api.ts 行为对齐
// - 自动附带 Authorization: Bearer <token>
// - 非 2xx 时 reject Error（带 statusCode / message）
// - 401 统一清会话并跳转登录页
const { BASE_URL } = require('./config.js')

function makeError(statusCode, message) {
  const e = new Error(message || '请求失败')
  e.statusCode = statusCode
  e.message = message || '请求失败'
  return e
}

// 延迟获取 store，避免 api <-> store 循环 require
function storeRef() {
  return require('./store.js')
}

// 401 单飞：fetchAll 启动时并发多个请求，token 失效时会同时 401。
// 若每个 401 都执行 forceLogout（Toast + 延迟 reLaunch），导航互相打断会把页面栈冲成
// "看得见页面但点击无响应"的半死状态。这里保证一段时间内只触发一次登出跳转。
let handling401 = false
function on401() {
  if (handling401) return
  handling401 = true
  storeRef().forceLogout()
  setTimeout(() => { handling401 = false }, 1500)
}

function gotoLogin() {
  const pages = getCurrentPages()
  const cur = pages[pages.length - 1]
  if (cur && cur.route === 'pages/login/login') return
  wx.reLaunch({ url: '/pages/login/login' })
}

/**
 * 发起请求
 * @param {string} path 以 /api 开头的接口路径
 * @param {{ method?: string, data?: any }} [options]
 * @returns {Promise<any>} resolve 服务端返回体
 */
function request(path, options) {
  options = options || {}
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }
    const token = storeRef().getToken()
    if (token) header.Authorization = 'Bearer ' + token

    wx.request({
      url: BASE_URL + path,
      method: options.method || 'GET',
      data: options.data,
      header,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        if (res.statusCode === 401) {
          on401()
          reject(makeError(401, '未登录或登录已过期'))
          return
        }
        reject(makeError(res.statusCode, res.data && res.data.message))
      },
      fail() {
        reject(makeError(0, '网络错误，请检查服务是否可达'))
      }
    })
  })
}

function get(path) { return request(path) }
function post(path, data) { return request(path, { method: 'POST', data }) }
function put(path, data) { return request(path, { method: 'PUT', data }) }
function del(path, data) { return request(path, { method: 'DELETE', data }) }

// 页面统一 const { api } = require('../../utils/api.js') 后走 api.get/post/put/del（见 CONVENTIONS.md）
const api = { get, post, put, del }

module.exports = {
  BASE_URL,
  request,
  api,
  get,
  post,
  put,
  del
}

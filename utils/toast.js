// 轻提示：对齐 Web 版 useToast 的四个级别
// 注意：icon: 'success' 时标题超过约 7 个字会被截断，长文案请用 info/error
function success(msg) {
  wx.showToast({ title: msg, icon: 'success', duration: 2000 })
}

function error(msg) {
  wx.showToast({ title: msg, icon: 'none', duration: 2500 })
}

function info(msg) {
  wx.showToast({ title: msg, icon: 'none', duration: 2000 })
}

function warning(msg) {
  wx.showToast({ title: msg, icon: 'none', duration: 2000 })
}

// wx.showModal 的 Promise 封装，resolve(true) 表示用户点了确定
function confirm(content, title) {
  return new Promise((resolve) => {
    wx.showModal({
      title: title || '提示',
      content: content,
      confirmText: '确定',
      cancelText: '取消',
      confirmColor: '#14B8A6',
      success(res) { resolve(!!res.confirm) },
      fail() { resolve(false) }
    })
  })
}

module.exports = { success, error, info, warning, confirm }

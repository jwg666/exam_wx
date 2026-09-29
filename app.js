const store = require('./utils/store.js')

App({
  globalData: {},

  onLaunch() {
    // 与 Web 版一致：已有 token 则静默恢复用户数据（失败不阻塞启动）
    if (store.isLoggedIn()) {
      store.fetchAll().catch(() => {})
    }
  }
})

# exam-wx · 题海拾贝 微信小程序（原生）

Web 版（Nuxt 3，仓库根目录）的**原生微信小程序**完整移植：题库中心、答题引擎（单选/判断/多选）、错题本、收藏、打卡、成就、排行榜、学习报告、消息通知、MBTI/IQ 测评与题库管理后台。

## 运行

1. 微信开发者工具 →「导入项目」→ 选择本目录 `exam-wx`
2. AppID 已配置为 `wx1b620b9bf0b037bd`（如需更换，改 `project.config.json` 的 `appid`）
3. 本地设置勾选「不校验合法域名…」（因为后端是 http）
4. 启动 Web 版后端：仓库根目录 `pnpm dev`（默认 `http://127.0.0.1:3000`）
5. 后端地址在 `utils/config.js` 的 `BASE_URL` 修改；生产环境改为 https 域名并在微信公众平台配置 request 合法域名
6. 开发模式短信验证码固定为 `123456`（服务端 mock）

## 结构

```
exam-wx/
├── app.js / app.json / app.wxss     # 入口、页面注册、全局设计系统（暗色主题）
├── project.config.json              # 工程配置（appid 在这里换）
├── utils/
│   ├── config.js                    # BASE_URL（唯一按环境修改处）
│   ├── api.js                       # wx.request 封装：Bearer 鉴权、401 统一登出
│   ├── store.js                     # 会话 + 业务缓存（对齐 Web stores/app.ts）
│   ├── quizState.js                 # 答题现场（对齐 Web stores/quiz.ts，含判分）
│   ├── toast.js / format.js         # 轻提示 / 格式化
├── components/
│   ├── report-mbti/                 # MBTI 报告卡（结果页、成果页共用）
│   └── report-iq/                   # IQ 报告卡（结果页、成果页共用）
├── assets/tab/                      # tabBar 图标（node scripts/gen-tab-icons.js 重新生成）
└── pages/                           # 14 个页面，与 Web 版 pages/ 一一对应
```

## 页面 ↔ Web 版对应

| 小程序页面 | Web 源 | 说明 |
| --- | --- | --- |
| pages/index/index | pages/index.vue + components/BankCenter/BankCard | 首页 Tab：题库中心（游客可浏览） |
| pages/bank/detail | pages/bank/[id].vue | 题库详情：数据面板、三种刷题入口、题目目录 |
| pages/quiz/quiz | pages/quiz.vue | 答题引擎：即时反馈、计时、答题卡、标记、收藏 |
| pages/result/result | pages/result.vue | 结算：环形得分、MBTI/IQ 报告 |
| pages/results/results | pages/results.vue | 成果 Tab：测评报告与学习成果 |
| pages/login/login | pages/login.vue | 密码/验证码登录、注册 |
| pages/profile/profile | pages/profile.vue | 我的 Tab：用户卡、打卡、功能入口、设置 |
| pages/wrong/wrong | pages/wrong.vue | 错题本 |
| pages/favorites/favorites | pages/favorites.vue | 我的收藏 |
| pages/history/history | pages/history.vue | 答题历史 |
| pages/stats/stats | pages/stats.vue | 学习报告 |
| pages/achievements/achievements | pages/achievements.vue | 成就徽章 |
| pages/notifications/notifications | pages/notifications.vue | 消息通知 |
| pages/admin/admin | pages/admin.vue | 题库管理后台（仅管理员） |

## 后端

直接复用 Web 版 Nuxt server（`/api/*`），鉴权为 `Authorization: Bearer <token>`，小程序无需任何后端改动。

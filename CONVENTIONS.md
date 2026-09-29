# exam-wx 开发约定（所有页面迁移必须遵守）

原生微信小程序工程：JavaScript (CommonJS) + WXML + WXSS，**无 TypeScript、无 npm 依赖、无框架**。
对应 Web 版（Nuxt 3 + Pinia + Tailwind）位于仓库根目录，接口与业务逻辑 1:1 迁移。

## 1. 文件与目录

- 每个页面 = 4 个同名文件：`pages/<dir>/<name>.{js,json,wxml,wxss}`，页面路径必须与 `app.json` 的 `pages` 列表一致。
- 页面 `.json` 至少含 `navigationBarTitleText`；需要下拉刷新时加 `"enablePullDownRefresh": true`。
- 只允许写自己名下的页面目录；**禁止修改** `app.json`、`app.js`、`app.wxss`、`utils/`、`components/`、`assets/`。
- 页面私有辅助函数写在本页面 `.js` 内；多个页面都不该改动公共文件。

## 2. 公共工具（require 路径从 pages/xxx/ 出发为 `../../utils/xxx.js`）

```js
const { BASE_URL, api } = require('../../utils/api.js')   // api.get/post/put/del(path, data) → Promise
const store = require('../../utils/store.js')
const toast = require('../../utils/toast.js')             // success/error/info/warning/confirm
const quizState = require('../../utils/quizState.js')     // 答题现场（仅答题相关页面用）
const fmt = require('../../utils/format.js')              // formatClock/formatDuration/timeAgo/formatDate/maskPhone/letter
```

### api
- `api.get(path)`、`api.post(path, data)`、`api.put(path, data)`、`api.del(path, data)`，path 以 `/api` 开头。
- resolve 服务端返回体（与 Web `$api` 一致）；reject `Error` 带 `.message`（可直接 toast）。
- 401 已在 api 层统一处理（清会话 + 跳登录），页面只需 catch 后 toast 提示。

### store（会话 + 业务缓存，对齐 Web stores/app.ts）
- `store.isLoggedIn()` / `store.getToken()` / `store.getUser()`（含 id/phone/name/totalAnswered/totalCorrect/streak/isAdmin/avatar）
- `store.setSession({token, user, newlyUnlocked})` 后：`store.toastAchievements(data.newlyUnlocked)` → `store.fetchAll()` 拉全量数据
- 业务缓存读写：`store.getCache(key)` / `store.setCache(key, val)`，key ∈ `checkin`( {checkedToday, streak} ) / `achievements` / `wrongBook` / `favorites` / `history` / `bankProgress` / `unreadCount`
- `store.updateUser(patch)` 局部更新用户；`store.accuracy()` 正确率%；`store.logout()` 退出；`store.toastAchievements(list)` 成就弹幕
- 修改了收藏/错题/历史等数据后，记得同步 `store.setCache(...)`，其他页面 onShow 才能看到新数据

### quizState（答题现场，自动持久化）
- 入口页开启答题：`quizState.init({ bankId, bankName, kind: 'quiz'|'assessment', mode: 'practice'|'exam', questions, startTime: Date.now() })` → `wx.navigateTo({ url: '/pages/quiz/quiz' })`
- quiz 页内只通过方法读写：`get()`、`setCurrentIdx(i)`、`setAnswerAt(i, val)`、`toggleFlagAt(i)`、`setSelected(arr)`、`setAnswered(b)`、`setElapsed(sec)`、`setResult(obj)`、`reset()`
- 判分：`isAnsweredAt(i)`、`isCorrectAt(i)`（多选须完全一致；单选/判断比较索引）
- 题目对象：`{ id, q, opts: string[], ans, type: 'single'|'judge'|'multi', exp, meta? }`（meta 为 JSON 字符串时需 JSON.parse）

### toast
- `toast.success(msg)` 仅用于 ≤7 字短文案（icon success 会截断长文案）；长文案用 `toast.info/error/warning`
- `toast.confirm(content, title?)` → `Promise<boolean>`

## 3. 登录守卫（对齐 Web middleware/auth.global.ts）

- 公开页：`pages/index`（题库中心）、`pages/login`；其余页面 onShow/onLoad 检查：
```js
if (!store.isLoggedIn()) { wx.navigateTo({ url: '/pages/login/login' }); return }  // 在 onShow 里 return 前先 this.setData({ guest: true }) 展示空态
```
- admin 页额外校验 `store.getUser()?.isAdmin`，无权限展示「无管理员权限」空态（服务端也会 403）。

## 4. 视觉规范（对齐 Web 暗色主题）

- 配色：底 `#0B1120`、卡片 `#162032`、卡片2 `#1C2942`、边框 `#243049`、主文字 `#E8EDF5`、次文字 `#94A3B8`、弱文字 `#64748B`、强调 teal `#14B8A6`（深 `#0D9488`）、blue `#3B82F6`、purple `#8B5CF6`、orange `#F97316`、amber `#F59E0B`、green `#10B981`、red `#EF4444`
- 尺寸换算：**Web 1px ≈ 2rpx**（text-sm=28rpx，p-4=32rpx…）
- `app.wxss` 已提供：`.page .row .col .grow .between .center .wrap .gap-* .mt-* .mb-* .p-* .px-* .t-* .c-* .g-card .g-card-2 .g-tag .g-input .g-btn(-primary/-ghost/-danger/-disabled) .g-ph .page-header .section-title .modal-overlay .sheet .sheet-grip .progress-bar .progress-fill .empty .empty-emoji .avatar .avatar-fallback .fade-up .divider .safe-bottom`，优先复用，页面特有样式写页面 wxss
- 输入框占位符颜色：`placeholder-class="g-ph"`
- 图标一律用 emoji 替代 FontAwesome，常用映射：
  首页🏠 我的👤 奖牌🏅 星标⭐ 旗标🚩 计时⏱️ 灯泡💡 对✅ 错❌ 浪潮🌊 锁🔒 手机📱 盾🛡️ 关闭✕ 网格▦ 发送📤 交卷📋 奖杯🏆 火🔥 书📖 铃🔔 齿轮⚙️ 图表📊 笔✏️ 垃圾桶🗑️ 加➕ 搜索🔍 皇冠👑 火箭🚀 大脑🧠 闪电⚡ 面具🎭 靶🎯 钻石💎 书签🔖 毕业🎓 学士帽🎓 门🚪 船🚢 杠铃💪 列表📋 心❤️ 包💼 警告⚠️ 信息ℹ️ 向右›
- 长列表必须有 `wx:key`；空态用 `.empty`（emoji + 一句话说明）

## 5. WXML/JS 限制（与 Vue 的差异，最易出错）

- **没有** `v-if/v-for/v-model/@click/:class`；用 `wx:if/wx:for/bindtap/bindinput`、`class="{{cond ? 'a' : 'b'}}"`
- **没有** 双向绑定：`<input value="{{v}}" bindinput="onInput" />`，onInput 里 `this.setData({ v: e.detail.value })`
- `{{ }}` 内只能写简单表达式；**不能调用函数**（`fmt.timeAgo(x)`、`String.fromCharCode` 等必须在 JS 里算好再 setData）
- 改数据必须 `this.setData({...})`，直接改 `this.data` 不生效；对象/数组可带路径：`'answers[0]': val`
- **没有 SVG**：环形进度用 `<canvas type="2d">` 画弧；柱状图用 view 高度百分比
- 跳转：普通页 `wx.navigateTo`；**tabBar 页（index/results/profile）必须 `wx.switchTab`**；关闭当前再进用 `wx.redirectTo`；清栈用 `wx.reLaunch`
- 页面间传参用 URL query：`wx.navigateTo({ url: '/pages/bank/detail?id=' + id })`，onLoad(options) 接收
- 返回上一页：`wx.navigateBack()`；题目详情等弹层用 `.modal-overlay` + `.sheet`
- 网络图片需 `binderror` 兜底（如头像加载失败时改用首字母块）
- setData 的数据量别太大：题目列表只传渲染需要的字段，不要把整份 raw 数据反复塞进去

## 6. 自检（提交前必须全部通过）

1. `node --check <每个.js>`（在 exam-wx 目录下，已是 CommonJS）
2. 每个 `.json` 可被 `JSON.parse`
3. wxml 里 grep 不到 `v-if|v-for|v-model|@click|@input|:class|:style|{{.*\(.*\).*}}`（模板里不许函数调用）
4. 与 Web 源文件逐块对照：功能点无缺失（列表/筛选/弹层/空态/加载态/边界提示）
5. 所有接口路径与 `server/api/` 下的实现一一对应

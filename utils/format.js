// 展示格式化工具

// 秒 → "m:ss"（答题计时）
function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  return m + ':' + String(s % 60).padStart(2, '0')
}

// 秒 → "X分Y秒"（结算页用时）
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  return m + '分' + (s % 60) + '秒'
}

// ISO/时间戳 → 相对时间（"3分钟前"）
function timeAgo(input) {
  if (!input) return ''
  const t = typeof input === 'number' ? input : new Date(input).getTime()
  if (isNaN(t)) return ''
  const diff = Math.floor((Date.now() - t) / 1000)
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前'
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + '天前'
  return formatDate(t)
}

// ISO/时间戳 → "YYYY-MM-DD"
function formatDate(input) {
  const d = typeof input === 'number' ? new Date(input) : new Date(input)
  if (isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

// 手机号脱敏：138****1234
function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || ''
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

// 选项索引 → 字母（0 → A）
function letter(i) {
  return String.fromCharCode(65 + (i || 0))
}

module.exports = { formatClock, formatDuration, timeAgo, formatDate, maskPhone, letter }

// WXML 检查：栈式标签配对 + wx:key 缺失检查
// 用法：node scripts/check-wxml.cjs
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.wxml')) out.push(p)
  }
  return out
}

let bad = 0
for (const file of walk(path.join(ROOT, 'pages')).concat(walk(path.join(ROOT, 'components')))) {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)

  // 去掉注释
  const clean = src.replace(/<!--[\s\S]*?-->/g, '')

  // 逐标签扫描
  const tagRe = /<(\/?)([\w-]+)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/?)>/g
  const stack = []
  let m
  let err = null
  while ((m = tagRe.exec(clean))) {
    const [full, closing, tag, attrs, selfClose] = m
    if (closing) {
      // 闭合标签：栈顶必须匹配（允许中间有未闭合异常时报出具体位置）
      const top = stack.pop()
      if (top !== tag) {
        err = `闭合 </${tag}> 但栈顶是 <${top}>`
        break
      }
    } else if (!selfClose) {
      // input/image 等在 WXML 中也允许不闭合，保守起见非显式自闭合都压栈
      stack.push(tag)
    }
  }
  if (!err && stack.length) err = '未闭合标签: ' + stack.join(', ')
  if (err) {
    console.log('✗', rel, err)
    bad++
  }

  // wx:for 必须带 wx:key
  const forRe = /<[^>]*wx:for=(?![^>]*wx:key=)[^>]*>/g
  let f
  while ((f = forRe.exec(clean))) {
    console.log('✗', rel, 'wx:for 缺少 wx:key:', f[0].slice(0, 60))
    bad++
  }
}

console.log(bad ? `共 ${bad} 个问题` : 'WXML 标签配对与 wx:key 全部正常')
process.exit(bad ? 1 : 0)

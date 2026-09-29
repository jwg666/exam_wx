// 生成 tabBar 图标（81x81 PNG，抗锯齿）。纯 Node 实现，无第三方依赖。
// 用法：node scripts/gen-tab-icons.js
// 图标与 app.json 的 tabBar 配置一一对应，改形状/颜色后重新运行即可。
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 81
const SS = 3 // 3x 超采样抗锯齿
const N = SIZE * SS

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length)
  return out
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0 // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- 形状判定（坐标均为 0..1） ----------
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function inRing(x, y, cx, cy, rOuter, rInner) {
  return inCircle(x, y, cx, cy, rOuter) && !inCircle(x, y, cx, cy, rInner)
}

function inPoly(x, y, pts) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inRect(x, y, x1, y1, x2, y2) {
  return x >= x1 && x <= x2 && y >= y1 && y <= y2
}

// 首页：房子
function shapeHome(x, y) {
  const roof = y >= 0.10 && y <= 0.46 && Math.abs(x - 0.5) <= ((y - 0.10) / 0.36) * 0.42
  const body = inRect(x, y, 0.18, 0.46, 0.82, 0.88)
  const door = inRect(x, y, 0.41, 0.62, 0.59, 0.88)
  return (roof || body) && !door
}

// 成果：奖牌
function shapeMedal(x, y) {
  const ribbonL = inPoly(x, y, [[0.38, 0.42], [0.24, 0.86], [0.34, 0.90], [0.46, 0.42]])
  const ribbonR = inPoly(x, y, [[0.62, 0.42], [0.76, 0.86], [0.66, 0.90], [0.54, 0.42]])
  const ring = inRing(x, y, 0.5, 0.32, 0.21, 0.145)
  const dot = inCircle(x, y, 0.5, 0.32, 0.075)
  return ribbonL || ribbonR || ring || dot
}

// 我的：人像
function shapeUser(x, y) {
  const head = inCircle(x, y, 0.5, 0.27, 0.155)
  const dx = (x - 0.5) / 0.30
  const dy = (y - 0.72) / 0.22
  const body = dx * dx + dy * dy <= 1 && y <= 0.72
  return head || body
}

// ---------- 渲染 ----------
function render(shape, rgb) {
  // 超采样网格覆盖度 → 目标分辨率 alpha
  const alpha = new Float32Array(SIZE * SIZE)
  for (let sy = 0; sy < N; sy++) {
    for (let sx = 0; sx < N; sx++) {
      const x = (sx + 0.5) / N
      const y = (sy + 0.5) / N
      if (shape(x, y)) {
        alpha[Math.floor(sy / SS) * SIZE + Math.floor(sx / SS)] += 1 / (SS * SS)
      }
    }
  }
  const rgba = Buffer.alloc(SIZE * SIZE * 4)
  for (let i = 0; i < SIZE * SIZE; i++) {
    const a = Math.round(Math.min(1, alpha[i]) * 255)
    rgba[i * 4] = rgb[0]
    rgba[i * 4 + 1] = rgb[1]
    rgba[i * 4 + 2] = rgb[2]
    rgba[i * 4 + 3] = a
  }
  return encodePNG(SIZE, SIZE, rgba)
}

const GRAY = [100, 116, 139] // #64748B
const TEAL = [20, 184, 166] // #14B8A6

const outDir = path.join(__dirname, '..', 'assets', 'tab')
fs.mkdirSync(outDir, { recursive: true })

const icons = [
  ['home.png', shapeHome, GRAY],
  ['home-active.png', shapeHome, TEAL],
  ['medal.png', shapeMedal, GRAY],
  ['medal-active.png', shapeMedal, TEAL],
  ['user.png', shapeUser, GRAY],
  ['user-active.png', shapeUser, TEAL]
]

for (const [name, shape, color] of icons) {
  fs.writeFileSync(path.join(outDir, name), render(shape, color))
  console.log('written', name)
}
console.log('done:', outDir)

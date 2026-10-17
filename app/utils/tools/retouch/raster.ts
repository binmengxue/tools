/**
 * 栅格基础操作：遮罩（Float32Array，0 ~ 1）上的多边形 / 圆形填充、模糊等。
 * 全部是纯函数，按行优先存储（index = y * width + x）。
 */
import type { Point } from './regions'

export type FillMode = 'max' | 'subtract' | 'set'

function applyValue(mask: Float32Array, i: number, value: number, mode: FillMode) {
  if (mode === 'max') mask[i] = Math.max(mask[i]!, value)
  else if (mode === 'subtract') mask[i] = Math.max(0, mask[i]! - value)
  else mask[i] = value
}

/**
 * 扫描线填充多边形（奇偶规则，以像素中心判断是否在内部）。
 * offset 用于局部区域：多边形坐标减去 offset 后再填充。
 */
export function fillPolygon(
  mask: Float32Array,
  width: number,
  height: number,
  polygon: Point[],
  value = 1,
  mode: FillMode = 'max',
  offset: Point = { x: 0, y: 0 },
): void {
  const n = polygon.length
  if (n < 3) return
  const pts = polygon.map(p => ({ x: p.x - offset.x, y: p.y - offset.y }))
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const y0 = Math.max(0, Math.floor(minY))
  const y1 = Math.min(height - 1, Math.ceil(maxY))
  const xs: number[] = []
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5
    xs.length = 0
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = pts[i]!
      const b = pts[j]!
      if ((a.y > cy) !== (b.y > cy)) {
        xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x))
      }
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xStart = Math.max(0, Math.ceil(xs[k]! - 0.5))
      const xEnd = Math.min(width - 1, Math.floor(xs[k + 1]! - 0.5))
      const row = y * width
      for (let x = xStart; x <= xEnd; x++) applyValue(mask, row + x, value, mode)
    }
  }
}

/**
 * 填充圆形；hardness 为 1 时边缘锐利，越小边缘越柔和（从 hardness × r 处开始衰减到 0）。
 */
export function fillCircle(
  mask: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  value = 1,
  mode: FillMode = 'max',
  hardness = 1,
): void {
  const x0 = Math.max(0, Math.floor(cx - radius))
  const x1 = Math.min(width - 1, Math.ceil(cx + radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const y1 = Math.min(height - 1, Math.ceil(cy + radius))
  const inner = radius * hardness
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d > radius) continue
      const falloff = d <= inner ? 1 : 1 - (d - inner) / (radius - inner)
      applyValue(mask, y * width + x, value * falloff, mode)
    }
  }
}

/**
 * 盒式模糊（可分离，滑动窗口，O(N) 与半径无关），边缘按截断窗口取平均。
 */
export function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const r = Math.max(0, Math.round(radius))
  if (r === 0) return src.slice()
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  // 水平
  for (let y = 0; y < height; y++) {
    const row = y * width
    let sum = 0
    let count = 0
    for (let x = 0; x <= Math.min(r, width - 1); x++) {
      sum += src[row + x]!
      count++
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / count
      const add = x + r + 1
      const remove = x - r
      if (add < width) {
        sum += src[row + add]!
        count++
      }
      if (remove >= 0) {
        sum -= src[row + remove]!
        count--
      }
    }
  }
  // 垂直
  for (let x = 0; x < width; x++) {
    let sum = 0
    let count = 0
    for (let y = 0; y <= Math.min(r, height - 1); y++) {
      sum += tmp[y * width + x]!
      count++
    }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / count
      const add = y + r + 1
      const remove = y - r
      if (add < height) {
        sum += tmp[add * width + x]!
        count++
      }
      if (remove >= 0) {
        sum -= tmp[remove * width + x]!
        count--
      }
    }
  }
  return out
}

/** 近似高斯模糊：三次盒式模糊（sigma 为高斯标准差） */
export function gaussianBlur(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  if (sigma < 0.5) return src.slice()
  // 宽 2r+1 的盒式模糊方差为 (r² + r) / 3，三次叠加为 r² + r，令其等于 sigma² 求 r
  const r = Math.max(1, Math.round(Math.sqrt(sigma * sigma + 0.25) - 0.5))
  return boxBlur(boxBlur(boxBlur(src, width, height, r), width, height, r), width, height, r)
}

/** 羽化遮罩边缘（结果仍在 0 ~ 1 之间） */
export function feather(mask: Float32Array, width: number, height: number, radius: number): Float32Array {
  return gaussianBlur(mask, width, height, radius)
}

/** 逐元素相乘（两个遮罩取交集） */
export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i]! * b[i]!
  return out
}

/** 矩形区域，用于只处理人脸附近的局部，提升速度 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 外扩矩形并裁剪到图片范围内（取整） */
export function expandRect(rect: Rect, margin: number, maxWidth: number, maxHeight: number): Rect {
  const x = Math.max(0, Math.floor(rect.x - margin))
  const y = Math.max(0, Math.floor(rect.y - margin))
  const x2 = Math.min(maxWidth, Math.ceil(rect.x + rect.width + margin))
  const y2 = Math.min(maxHeight, Math.ceil(rect.y + rect.height + margin))
  return { x, y, width: Math.max(0, x2 - x), height: Math.max(0, y2 - y) }
}

/** 分离通道的局部图像（浮点，0 ~ 255） */
export interface Planes {
  width: number
  height: number
  r: Float32Array
  g: Float32Array
  b: Float32Array
}

/** 从 RGBA 数据中取出一个矩形区域的三个通道 */
export function extractPlanes(rgba: Uint8ClampedArray, imageWidth: number, rect: Rect): Planes {
  const { width, height } = rect
  const r = new Float32Array(width * height)
  const g = new Float32Array(width * height)
  const b = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    let src = ((rect.y + y) * imageWidth + rect.x) * 4
    let dst = y * width
    for (let x = 0; x < width; x++) {
      r[dst] = rgba[src]!
      g[dst] = rgba[src + 1]!
      b[dst] = rgba[src + 2]!
      src += 4
      dst++
    }
  }
  return { width, height, r, g, b }
}

/** 把局部三个通道写回 RGBA 数据（透明度不变） */
export function writePlanes(rgba: Uint8ClampedArray, imageWidth: number, rect: Rect, planes: Planes): void {
  for (let y = 0; y < planes.height; y++) {
    let dst = ((rect.y + y) * imageWidth + rect.x) * 4
    let src = y * planes.width
    for (let x = 0; x < planes.width; x++) {
      rgba[dst] = planes.r[src]!
      rgba[dst + 1] = planes.g[src]!
      rgba[dst + 2] = planes.b[src]!
      dst += 4
      src++
    }
  }
}

/** 遮罩中大于阈值部分的外接矩形（局部坐标）；没有时返回 null */
export function maskBounds(mask: Float32Array, width: number, height: number, threshold = 0.001): Rect | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (mask[row + x]! > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** 取出局部图像中的一个子矩形（复制） */
export function cropPlanes(planes: Planes, rect: Rect): Planes {
  const { width: w } = planes
  const out = {
    width: rect.width,
    height: rect.height,
    r: new Float32Array(rect.width * rect.height),
    g: new Float32Array(rect.width * rect.height),
    b: new Float32Array(rect.width * rect.height),
  }
  for (let y = 0; y < rect.height; y++) {
    const from = (rect.y + y) * w + rect.x
    out.r.set(planes.r.subarray(from, from + rect.width), y * rect.width)
    out.g.set(planes.g.subarray(from, from + rect.width), y * rect.width)
    out.b.set(planes.b.subarray(from, from + rect.width), y * rect.width)
  }
  return out
}

/** 把子图写回局部图像 */
export function pastePlanes(planes: Planes, rect: Rect, part: Planes): void {
  for (let y = 0; y < rect.height; y++) {
    const to = (rect.y + y) * planes.width + rect.x
    planes.r.set(part.r.subarray(y * rect.width, (y + 1) * rect.width), to)
    planes.g.set(part.g.subarray(y * rect.width, (y + 1) * rect.width), to)
    planes.b.set(part.b.subarray(y * rect.width, (y + 1) * rect.width), to)
  }
}

/** 取出遮罩的子矩形（复制） */
export function cropMask(mask: Float32Array, width: number, rect: Rect): Float32Array {
  const out = new Float32Array(rect.width * rect.height)
  for (let y = 0; y < rect.height; y++) {
    const from = (rect.y + y) * width + rect.x
    out.set(mask.subarray(from, from + rect.width), y * rect.width)
  }
  return out
}

/** 缩小为 1/factor（块平均） */
export function downscale(src: Float32Array, width: number, height: number, factor: number): { data: Float32Array, width: number, height: number } {
  const w = Math.max(1, Math.ceil(width / factor))
  const h = Math.max(1, Math.ceil(height / factor))
  const data = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      const y1 = Math.min(height, (y + 1) * factor)
      const x1 = Math.min(width, (x + 1) * factor)
      for (let sy = y * factor; sy < y1; sy++) {
        for (let sx = x * factor; sx < x1; sx++) {
          sum += src[sy * width + sx]!
          n++
        }
      }
      data[y * w + x] = sum / n
    }
  }
  return { data, width: w, height: h }
}

/** 双线性放大到指定尺寸（与 downscale 对应，按块中心对齐） */
export function upscale(src: Float32Array, srcWidth: number, srcHeight: number, width: number, height: number, factor: number): Float32Array {
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const fy = Math.min(srcHeight - 1, Math.max(0, (y + 0.5) / factor - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(srcHeight - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < width; x++) {
      const fx = Math.min(srcWidth - 1, Math.max(0, (x + 0.5) / factor - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(srcWidth - 1, x0 + 1)
      const tx = fx - x0
      const top = src[y0 * srcWidth + x0]! + (src[y0 * srcWidth + x1]! - src[y0 * srcWidth + x0]!) * tx
      const bottom = src[y1 * srcWidth + x0]! + (src[y1 * srcWidth + x1]! - src[y1 * srcWidth + x0]!) * tx
      out[y * width + x] = top + (bottom - top) * ty
    }
  }
  return out
}

/** 亮度（Rec.601） */
export function luminance(planes: Planes): Float32Array {
  const { r, g, b } = planes
  const out = new Float32Array(r.length)
  for (let i = 0; i < r.length; i++) out[i] = 0.299 * r[i]! + 0.587 * g[i]! + 0.114 * b[i]!
  return out
}

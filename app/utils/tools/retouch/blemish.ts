/**
 * 斑点检测与修补（纯函数）
 * 检测：在皮肤遮罩内找比周围明显更暗的小块（连通区域），按面积筛选。
 * 修补：归一化卷积——用遮罩外（健康皮肤）的像素按高斯加权填补遮罩内，再羽化融合。
 */
import { cropPlanes, downscale, feather, fillCircle, gaussianBlur, pastePlanes, upscale } from './raster'
import type { Planes } from './raster'

export interface Spot {
  /** 中心 */
  x: number
  y: number
  /** 等效半径（像素） */
  radius: number
  area: number
}

export interface DetectOptions {
  /** 比周围暗多少（0 ~ 255）才算斑点 */
  threshold: number
  /** 周围亮度的参考尺度（高斯 sigma），应明显大于斑点 */
  sigma: number
  /** 面积范围（像素） */
  minArea: number
  maxArea: number
  /** 皮肤遮罩值低于这个的位置不检测（避免眼角、发际线） */
  minSkin: number
}

/**
 * 在亮度图上检测暗斑。
 * 返回的斑点按面积从小到大排序。
 */
export function detectSpots(lum: Float32Array, skin: Float32Array, width: number, height: number, options: DetectOptions): Spot[] {
  // 周围亮度是大尺度的平滑量，半径较大时在缩小的图上计算
  const factor = options.sigma >= 16 ? 4 : options.sigma >= 8 ? 2 : 1
  let base: Float32Array
  if (factor > 1) {
    const small = downscale(lum, width, height, factor)
    base = upscale(gaussianBlur(small.data, small.width, small.height, options.sigma / factor), small.width, small.height, width, height, factor)
  }
  else {
    base = gaussianBlur(lum, width, height, options.sigma)
  }
  const candidate = new Uint8Array(lum.length)
  for (let i = 0; i < lum.length; i++) {
    if (skin[i]! >= options.minSkin && base[i]! - lum[i]! > options.threshold) candidate[i] = 1
  }

  // 4 邻接连通区域（迭代栈，避免递归过深）
  const visited = new Uint8Array(lum.length)
  const stack: number[] = []
  const spots: Spot[] = []
  for (let start = 0; start < candidate.length; start++) {
    if (!candidate[start] || visited[start]) continue
    let area = 0
    let sumX = 0
    let sumY = 0
    let minX = width
    let maxX = 0
    let minY = height
    let maxY = 0
    let touchesEdge = false
    stack.push(start)
    visited[start] = 1
    while (stack.length) {
      const i = stack.pop()!
      const x = i % width
      const y = (i - x) / width
      area++
      sumX += x
      sumY += y
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true
      const neighbors = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]
      for (const nb of neighbors) {
        if (nb >= 0 && candidate[nb] && !visited[nb]) {
          visited[nb] = 1
          stack.push(nb)
        }
      }
    }
    if (touchesEdge || area < options.minArea || area > options.maxArea) continue
    // 太细长的通常是发丝或皱纹，不当作斑点
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    if (Math.max(w, h) > Math.min(w, h) * 4) continue
    spots.push({ x: sumX / area + 0.5, y: sumY / area + 0.5, radius: Math.sqrt(area / Math.PI), area })
  }
  return spots.sort((a, b) => a.area - b.area)
}

/**
 * 修补遮罩内的区域（直接修改 planes）。
 *
 * 用遮罩外的像素做归一化卷积得到填充色，再按羽化后的遮罩混合，边缘自然过渡。
 * 尺度从 sigma 开始逐级加倍，直到遮罩最里面也能取到足够的周围像素：
 * 大块涂抹时，中间部分用大尺度的颜色，靠近边缘用小尺度的颜色。
 * 只用一个尺度时，离边缘超过约 3 × sigma 的地方取不到参考像素，会留下没修补的条带。
 *
 * texture（0 ~ 1）：叠回原图细纹理的比例，大块修补后仍保留毛孔质感，不会糊成一片。
 * 细纹理的幅度有上限：毛孔起伏很小会保留，斑点、痘印对比强，超出部分被去掉。
 */
export function healMask(planes: Planes, mask: Float32Array, sigma: number, texture = 0): void {
  const { width, height } = planes
  const outside = new Float32Array(mask.length)
  let inside = 0
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]! > 0.01) inside++
    else outside[i] = 1
  }
  if (!inside || inside === mask.length) return
  const soft = feather(mask, width, height, Math.max(1, sigma * 0.35))

  // 由细到粗求各尺度的权重，直到遮罩内处处有足够的参考像素
  const MIN_WEIGHT = 0.2
  const sigmas: number[] = []
  const weights: Float32Array[] = []
  const limit = Math.max(width, height)
  for (let s = sigma; ; s *= 2) {
    const weight = gaussianBlur(outside, width, height, s)
    sigmas.push(s)
    weights.push(weight)
    let enough = true
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]! > 0.01 && weight[i]! < MIN_WEIGHT) {
        enough = false
        break
      }
    }
    if (enough || s * 2 > limit) break
  }

  const detailSigma = Math.min(4, Math.max(1, sigma * 0.15))
  const DETAIL_LIMIT = 12
  for (const channel of [planes.r, planes.g, planes.b]) {
    const masked = new Float32Array(channel.length)
    for (let i = 0; i < channel.length; i++) masked[i] = channel[i]! * outside[i]!
    // 由粗到细合成填充色：每一级在权重足够的地方覆盖上一级
    let fill: Float32Array | null = null
    for (let k = sigmas.length - 1; k >= 0; k--) {
      const blurred = gaussianBlur(masked, width, height, sigmas[k]!)
      const weight = weights[k]!
      if (!fill) {
        fill = new Float32Array(channel.length)
        for (let i = 0; i < fill.length; i++) fill[i] = weight[i]! > 1e-6 ? blurred[i]! / weight[i]! : channel[i]!
        continue
      }
      for (let i = 0; i < fill.length; i++) {
        const w = weight[i]!
        if (w <= 1e-6) continue
        const alpha = Math.min(1, w / MIN_WEIGHT)
        fill[i] = fill[i]! + (blurred[i]! / w - fill[i]!) * alpha
      }
    }
    const detail = texture > 0 ? gaussianBlur(channel, width, height, detailSigma) : null
    for (let i = 0; i < channel.length; i++) {
      const m = Math.min(1, Math.max(soft[i]!, mask[i]!))
      if (m <= 0.001) continue
      const fine = detail ? Math.max(-DETAIL_LIMIT, Math.min(DETAIL_LIMIT, channel[i]! - detail[i]!)) : 0
      const target = fill![i]! + fine * texture
      channel[i] = channel[i]! + (target - channel[i]!) * m
    }
  }
}

/**
 * 逐个修补斑点：每个斑点只在自己附近的小窗口内计算（比整块区域做一次修补快得多）。
 * 直接修改 planes。
 */
export function healSpots(planes: Planes, spots: Spot[], sigma: number, grow = 1.6): void {
  for (const s of spots) {
    const r = Math.max(1.5, s.radius * grow + 1)
    const margin = r + sigma * 4
    const x0 = Math.max(0, Math.floor(s.x - margin))
    const y0 = Math.max(0, Math.floor(s.y - margin))
    const x1 = Math.min(planes.width, Math.ceil(s.x + margin))
    const y1 = Math.min(planes.height, Math.ceil(s.y + margin))
    const rect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
    if (rect.width < 3 || rect.height < 3) continue
    const part = cropPlanes(planes, rect)
    const mask = new Float32Array(rect.width * rect.height)
    fillCircle(mask, rect.width, rect.height, s.x - x0, s.y - y0, r, 1, 'max', 0.6)
    healMask(part, mask, sigma)
    pastePlanes(planes, rect, part)
  }
}

/** 把检测到的斑点画成修补遮罩（稍微放大，盖住斑点边缘的过渡色） */
export function spotsToMask(spots: Spot[], width: number, height: number, grow = 1.6): Float32Array {
  const mask = new Float32Array(width * height)
  for (const s of spots) fillCircle(mask, width, height, s.x, s.y, Math.max(1.5, s.radius * grow + 1), 1, 'max', 0.6)
  return mask
}

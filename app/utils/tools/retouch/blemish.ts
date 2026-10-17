/**
 * 斑点检测与修补（纯函数）
 * 检测：在皮肤遮罩内找比周围明显更暗的小块（连通区域），按面积筛选。
 * 修补：归一化卷积——用遮罩外（健康皮肤）的像素按高斯加权填补遮罩内，再羽化融合。
 */
import { feather, fillCircle, gaussianBlur } from './raster'
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
  const base = gaussianBlur(lum, width, height, options.sigma)
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
 * 先用遮罩外的像素做归一化卷积得到填充色，再按羽化后的遮罩混合，边缘自然过渡。
 */
export function healMask(planes: Planes, mask: Float32Array, sigma: number): void {
  const { width, height } = planes
  const outside = new Float32Array(mask.length)
  for (let i = 0; i < mask.length; i++) outside[i] = mask[i]! > 0.01 ? 0 : 1
  const weight = gaussianBlur(outside, width, height, sigma)
  const soft = feather(mask, width, height, Math.max(1, sigma * 0.35))
  for (const channel of [planes.r, planes.g, planes.b]) {
    const masked = new Float32Array(channel.length)
    for (let i = 0; i < channel.length; i++) masked[i] = channel[i]! * outside[i]!
    const blurred = gaussianBlur(masked, width, height, sigma)
    for (let i = 0; i < channel.length; i++) {
      const m = Math.min(1, Math.max(soft[i]!, mask[i]!))
      if (m <= 0.001) continue
      const w = weight[i]!
      if (w < 1e-3) continue // 周围没有可参考的像素
      const fill = blurred[i]! / w
      channel[i] = channel[i]! + (fill - channel[i]!) * m
    }
  }
}

/** 把检测到的斑点画成修补遮罩（稍微放大，盖住斑点边缘的过渡色） */
export function spotsToMask(spots: Spot[], width: number, height: number, grow = 1.6): Float32Array {
  const mask = new Float32Array(width * height)
  for (const s of spots) fillCircle(mask, width, height, s.x, s.y, Math.max(1.5, s.radius * grow + 1), 1, 'max', 0.6)
  return mask
}

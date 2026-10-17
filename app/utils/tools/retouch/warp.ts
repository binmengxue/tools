/**
 * 局部变形（液化「向前推」）：瘦脸、去双下巴、推拉画笔都用它（纯函数）。
 *
 * 每个控制点把半径 radius 内的内容沿 (dx, dy) 推动，衰减函数为 (1 - (d/r)²)²：
 * 中心推动最多、到边缘平滑降为 0，半径外完全不动。
 * 实现为反向映射：输出像素 p 从原图的 p - 位移 处取色（双线性插值）。
 */
import type { Rect } from './raster'
import type { Point } from './regions'

export interface WarpControl {
  x: number
  y: number
  /** 推动方向与距离（像素） */
  dx: number
  dy: number
  radius: number
}

/** 衰减：中心为 1，半径处为 0 */
export function falloff(distance: number, radius: number): number {
  if (distance >= radius) return 0
  const t = 1 - (distance / radius) ** 2
  return t * t
}

/** 所有控制点影响范围的外接矩形（裁剪到图片内，取整） */
export function controlsBounds(controls: WarpControl[], width: number, height: number): Rect | null {
  if (!controls.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const c of controls) {
    x0 = Math.min(x0, c.x - c.radius)
    y0 = Math.min(y0, c.y - c.radius)
    x1 = Math.max(x1, c.x + c.radius)
    y1 = Math.max(y1, c.y + c.radius)
  }
  const x = Math.max(0, Math.floor(x0))
  const y = Math.max(0, Math.floor(y0))
  const w = Math.min(width, Math.ceil(x1)) - x
  const h = Math.min(height, Math.ceil(y1)) - y
  return w > 0 && h > 0 ? { x, y, width: w, height: h } : null
}

/**
 * 某一点的位移（多个控制点重叠时按权重归一化，避免叠加过头；位移长度限制在半径的 40% 以内，防止折叠）。
 */
export function displacementAt(x: number, y: number, controls: WarpControl[]): Point {
  let sx = 0
  let sy = 0
  let total = 0
  for (const c of controls) {
    const w = falloff(Math.hypot(x - c.x, y - c.y), c.radius)
    if (w <= 0) continue
    const limit = c.radius * 0.4
    const len = Math.hypot(c.dx, c.dy)
    const scale = len > limit ? limit / len : 1
    sx += c.dx * scale * w
    sy += c.dy * scale * w
    total += w
  }
  if (total > 1) {
    sx /= total
    sy /= total
  }
  return { x: sx, y: sy }
}

/** 双线性插值取色（坐标越界时夹到边缘） */
function sample(src: Uint8ClampedArray, width: number, height: number, x: number, y: number, out: Float32Array) {
  const fx = Math.min(width - 1, Math.max(0, x))
  const fy = Math.min(height - 1, Math.max(0, y))
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0
  const i00 = (y0 * width + x0) * 4
  const i10 = (y0 * width + x1) * 4
  const i01 = (y1 * width + x0) * 4
  const i11 = (y1 * width + x1) * 4
  for (let c = 0; c < 4; c++) {
    const top = src[i00 + c]! + (src[i10 + c]! - src[i00 + c]!) * tx
    const bottom = src[i01 + c]! + (src[i11 + c]! - src[i01 + c]!) * tx
    out[c] = top + (bottom - top) * ty
  }
}

/**
 * 按控制点变形，返回新的 RGBA 数据（只重新计算受影响的矩形区域，其余直接复制）。
 */
export function applyWarp(src: Uint8ClampedArray, width: number, height: number, controls: WarpControl[]): Uint8ClampedArray {
  const out = src.slice()
  const rect = controlsBounds(controls, width, height)
  if (!rect) return out
  const px = new Float32Array(4)
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const d = displacementAt(x + 0.5, y + 0.5, controls)
      if (d.x === 0 && d.y === 0) continue
      // 反向映射：此处的内容来自「往回推」的位置
      sample(src, width, height, x - d.x, y - d.y, px)
      const i = (y * width + x) * 4
      out[i] = px[0]!
      out[i + 1] = px[1]!
      out[i + 2] = px[2]!
      out[i + 3] = px[3]!
    }
  }
  return out
}

/** 下颌线上两侧对称的关键点（从颧骨往下到下巴），用于瘦脸 */
export const JAW_RIGHT = [93, 132, 58, 172, 136, 150, 149, 176, 148]
export const JAW_LEFT = [323, 361, 288, 397, 365, 379, 378, 400, 377]

/**
 * 瘦脸：两侧下颌线向脸部中轴水平收拢。
 * 越靠下颌角收得越多，到下巴附近逐渐减弱，保持脸型自然。
 */
export function slimFaceControls(points: Point[], faceWidth: number, amount: number): WarpControl[] {
  if (amount <= 0) return []
  const chin = points[152]!
  const top = points[10]!
  const centerX = (chin.x + top.x) / 2
  const controls: WarpControl[] = []
  const weights = [0.35, 0.6, 0.85, 1, 1, 0.9, 0.7, 0.45, 0.25]
  for (const jaw of [JAW_RIGHT, JAW_LEFT]) {
    jaw.forEach((index, k) => {
      const p = points[index]!
      const toCenter = centerX - p.x
      controls.push({
        x: p.x,
        y: p.y,
        dx: toCenter * 0.09 * amount * weights[k]!,
        dy: 0,
        radius: faceWidth * 0.2,
      })
    })
  }
  return controls
}

/**
 * 去双下巴：下巴下方的软组织向上、向内收紧。
 * 控制点放在下巴尖和两侧下颌下方。
 */
export function chinControls(points: Point[], faceWidth: number, amount: number): WarpControl[] {
  if (amount <= 0) return []
  const chin = points[152]!
  const below = faceWidth * 0.13
  const lift = faceWidth * 0.07 * amount
  const controls: WarpControl[] = [{ x: chin.x, y: chin.y + below, dx: 0, dy: -lift, radius: faceWidth * 0.2 }]
  for (const index of [148, 377]) {
    const p = points[index]!
    controls.push({
      x: p.x,
      y: p.y + below * 0.9,
      dx: (chin.x - p.x) * 0.15 * amount,
      dy: -lift * 0.8,
      radius: faceWidth * 0.16,
    })
  }
  return controls
}

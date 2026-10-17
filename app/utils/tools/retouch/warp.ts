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
  /**
   * 推动方向「背后」的影响范围（可选，默认等于 radius）。
   * 推动时前方被压缩、背后被拉伸；把背后的范围设大，拉伸被分散到更大的区域，就不会出现拉丝、拖影。
   */
  backRadius?: number
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
    const r = Math.max(c.radius, c.backRadius ?? c.radius)
    x0 = Math.min(x0, c.x - r)
    y0 = Math.min(y0, c.y - r)
    x1 = Math.max(x1, c.x + r)
    y1 = Math.max(y1, c.y + r)
  }
  const x = Math.max(0, Math.floor(x0))
  const y = Math.max(0, Math.floor(y0))
  const w = Math.min(width, Math.ceil(x1)) - x
  const h = Math.min(height, Math.ceil(y1)) - y
  return w > 0 && h > 0 ? { x, y, width: w, height: h } : null
}

/**
 * 控制点对某一点的影响权重。
 * 推动方向的前方按圆形半径 radius 衰减；背后按椭圆衰减（沿推动方向的半径为 backRadius），两侧在交界处连续。
 */
export function weightAt(x: number, y: number, c: WarpControl): number {
  const vx = x - c.x
  const vy = y - c.y
  const back = c.backRadius
  const len = Math.hypot(c.dx, c.dy)
  if (!back || back === c.radius || len === 0) return falloff(Math.hypot(vx, vy), c.radius)
  const ux = c.dx / len
  const uy = c.dy / len
  const along = vx * ux + vy * uy
  if (along >= 0) return falloff(Math.hypot(vx, vy), c.radius)
  const perp = -vx * uy + vy * ux
  const t2 = (along / back) ** 2 + (perp / c.radius) ** 2
  if (t2 >= 1) return 0
  const t = 1 - t2
  return t * t
}

/**
 * 某一点的位移（多个控制点重叠时按权重归一化，避免叠加过头；位移长度限制在半径的 40% 以内，防止折叠）。
 */
export function displacementAt(x: number, y: number, controls: WarpControl[]): Point {
  let sx = 0
  let sy = 0
  let total = 0
  for (const c of controls) {
    const w = weightAt(x, y, c)
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
  // 位移场很平滑：先在步长 GRID 的网格上计算，再双线性插值，计算量约为逐像素的 1/16
  const GRID = 4
  const gw = Math.ceil(rect.width / GRID) + 2
  const gh = Math.ceil(rect.height / GRID) + 2
  const gx = new Float32Array(gw * gh)
  const gy = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const d = displacementAt(rect.x + i * GRID + 0.5, rect.y + j * GRID + 0.5, controls)
      gx[j * gw + i] = d.x
      gy[j * gw + i] = d.y
    }
  }
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    const fy = (y - rect.y) / GRID
    const j0 = Math.floor(fy)
    const ty = fy - j0
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const fx = (x - rect.x) / GRID
      const i0 = Math.floor(fx)
      const tx = fx - i0
      const a = j0 * gw + i0
      const b = a + gw
      const dx = (gx[a]! * (1 - tx) + gx[a + 1]! * tx) * (1 - ty) + (gx[b]! * (1 - tx) + gx[b + 1]! * tx) * ty
      const dy = (gy[a]! * (1 - tx) + gy[a + 1]! * tx) * (1 - ty) + (gy[b]! * (1 - tx) + gy[b + 1]! * tx) * ty
      const d = { x: dx, y: dy }
      if (Math.abs(d.x) < 1e-3 && Math.abs(d.y) < 1e-3) continue
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

/**
 * 依次应用一串控制点（每个控制点单独一次变形，后一次作用在前一次的结果上），原地修改。
 * 用于推拉画笔：拖动路径上的每一小步都在上一步的基础上继续推。
 * 每步只复制受影响的小块区域，避免反复复制整张图。
 */
export function applyWarpSequence(rgba: Uint8ClampedArray, width: number, height: number, controls: WarpControl[]): void {
  const px = new Float32Array(4)
  for (const c of controls) {
    const rect = controlsBounds([c], width, height)
    if (!rect) continue
    // 取样可能落在影响范围外最多 0.4 × 半径处，快照要多留一圈
    const margin = Math.ceil(c.radius * 0.4) + 2
    const sx0 = Math.max(0, rect.x - margin)
    const sy0 = Math.max(0, rect.y - margin)
    const sw = Math.min(width, rect.x + rect.width + margin) - sx0
    const sh = Math.min(height, rect.y + rect.height + margin) - sy0
    const snapshot = new Uint8ClampedArray(sw * sh * 4)
    for (let y = 0; y < sh; y++) {
      const from = ((sy0 + y) * width + sx0) * 4
      snapshot.set(rgba.subarray(from, from + sw * 4), y * sw * 4)
    }
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const d = displacementAt(x + 0.5, y + 0.5, [c])
        if (d.x === 0 && d.y === 0) continue
        sample(snapshot, sw, sh, x - d.x - sx0, y - d.y - sy0, px)
        const i = (y * width + x) * 4
        rgba[i] = px[0]!
        rgba[i + 1] = px[1]!
        rgba[i + 2] = px[2]!
        rgba[i + 3] = px[3]!
      }
    }
  }
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
        // 背后是背景、头发：拉伸分散开
        backRadius: faceWidth * 0.32,
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
  // 以鼻尖为中心，下颌线上每个点的「向外」方向（大致朝下、朝外）
  const center = points[1]!
  const controls: WarpControl[] = []
  LOWER_JAW.forEach((index, k) => {
    const p = points[index]!
    const vx = p.x - center.x
    const vy = p.y - center.y
    const len = Math.hypot(vx, vy) || 1
    const nx = vx / len
    const ny = vy / len
    const weight = LOWER_JAW_WEIGHTS[k]!
    const push = faceWidth * 0.06 * amount * weight
    // 控制点放在下颌线外侧（下巴下方的软组织处），把它往下颌线方向收
    controls.push({
      x: p.x + nx * faceWidth * 0.07,
      y: p.y + ny * faceWidth * 0.07,
      dx: -nx * push,
      dy: -ny * push,
      radius: faceWidth * 0.12,
      // 背后是脖子：拉伸分散到更长的距离，发丝、颈纹不会被拉成长条
      backRadius: faceWidth * 0.32,
    })
  })
  return controls
}

/** 下颌线下缘：从右侧下颌角经下巴尖到左侧下颌角 */
export const LOWER_JAW = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397]
/** 越靠近下巴尖收得越多（双下巴主要在下巴正下方） */
const LOWER_JAW_WEIGHTS = [0.25, 0.45, 0.65, 0.85, 1, 1, 1, 1, 1, 0.85, 0.65, 0.45, 0.25]

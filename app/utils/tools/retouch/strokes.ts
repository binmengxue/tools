/**
 * 画笔笔画：转换为遮罩（修复、消除、磨皮、保护）或推拉控制点（液化），纯函数。
 */
import { expandRect, fillCircle } from './raster'
import type { Rect } from './raster'
import type { Point } from './regions'
import type { WarpControl } from './warp'

export interface Stroke {
  points: Point[]
  radius: number
}

/** 笔画的外接矩形（含半径），裁剪到图片内 */
export function strokeBounds(stroke: Stroke, width: number, height: number, margin = 0): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of stroke.points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return expandRect(
    { x: minX - stroke.radius, y: minY - stroke.radius, width: maxX - minX + stroke.radius * 2, height: maxY - minY + stroke.radius * 2 },
    margin,
    width,
    height,
  )
}

/** 沿路径按间距插值出的圆心（间距为半径的 1/4，保证笔画连续） */
export function strokeDabs(stroke: Stroke): Point[] {
  const { points, radius } = stroke
  if (!points.length) return []
  const spacing = Math.max(0.5, radius / 4)
  const dabs: Point[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.floor(dist / spacing)
    for (let k = 1; k <= steps; k++) {
      const t = (k * spacing) / dist
      dabs.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
    if (dist % spacing > 1e-6 || steps === 0) dabs.push(b)
  }
  return dabs
}

/**
 * 在局部区域 rect 上画出笔画遮罩（0 ~ 1）。
 * hardness 越小边缘越柔和。
 */
export function strokeMask(stroke: Stroke, rect: Rect, hardness = 0.7): Float32Array {
  const mask = new Float32Array(rect.width * rect.height)
  for (const d of strokeDabs(stroke)) {
    fillCircle(mask, rect.width, rect.height, d.x - rect.x, d.y - rect.y, stroke.radius, 1, 'max', hardness)
  }
  return mask
}

/**
 * 推拉画笔：把拖动路径拆成一连串小步推动（每步不超过半径的 15%，避免撕裂）。
 * strength 为推动比例（0 ~ 1）。
 */
export function pushControls(stroke: Stroke, strength = 0.8): WarpControl[] {
  const { points, radius } = stroke
  const maxStep = Math.max(0.5, radius * 0.15)
  const controls: WarpControl[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    if (dist < 1e-6) continue
    const steps = Math.max(1, Math.ceil(dist / maxStep))
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      controls.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        dx: ((b.x - a.x) / steps) * strength,
        dy: ((b.y - a.y) / steps) * strength,
        radius,
      })
    }
  }
  return controls
}

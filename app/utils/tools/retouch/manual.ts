/**
 * 手动画笔操作（纯函数）
 * - 修复 / 消除：落笔时计算一次，结果保存为「补丁」（矩形区域的像素），撤销、重做、调滑杆时直接贴回，不重算
 * - 磨皮画笔 / 保护：记录笔画，渲染时生成遮罩
 * - 推拉：记录一串控制点，渲染时按顺序变形
 * - 收下巴：松手时根据涂抹位置算出提拉参数，渲染时淡化褶皱并提拉
 */
import { healMask } from './blemish'
import { jawFrame, liftFromStroke, locateOnJaw } from './chin'
import type { ChinLift } from './chin'
import { smoothSkin } from './filters'
import { inpaint } from './inpaint'
import { expandRect, extractPlanes, writePlanes } from './raster'
import type { Rect } from './raster'
import type { Point } from './regions'
import { pushControls, strokeBounds, strokeMask } from './strokes'
import type { Stroke } from './strokes'
import type { WarpControl } from './warp'

export type ManualTool = 'heal' | 'erase' | 'smooth' | 'protect' | 'push' | 'chin'

export type ManualOp
  = | { kind: 'patch', strokeId: number, rect: Rect, rgba: Uint8ClampedArray }
    | { kind: 'mask', strokeId: number, tool: 'smooth' | 'protect', stroke: Stroke }
    | { kind: 'push', strokeId: number, controls: WarpControl[] }
    | { kind: 'chin', strokeId: number, face: number, lift: ChinLift }

/** 取出图片中一个矩形区域的 RGBA */
export function cropRgba(rgba: Uint8ClampedArray, width: number, rect: Rect): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4)
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * width + rect.x) * 4
    out.set(rgba.subarray(from, from + rect.width * 4), y * rect.width * 4)
  }
  return out
}

/** 把矩形区域的 RGBA 贴回图片（原地修改） */
export function pasteRgba(rgba: Uint8ClampedArray, width: number, rect: Rect, patch: Uint8ClampedArray): void {
  for (let y = 0; y < rect.height; y++) {
    rgba.set(patch.subarray(y * rect.width * 4, (y + 1) * rect.width * 4), ((rect.y + y) * width + rect.x) * 4)
  }
}

/** 修复画笔：用笔画周围的皮肤颜色填补笔画区域，保留原来的细纹理（毛孔），大块涂抹也不会糊成一片 */
export function healPatch(base: Uint8ClampedArray, width: number, height: number, stroke: Stroke): { rect: Rect, rgba: Uint8ClampedArray } {
  const rect = strokeBounds(stroke, width, height, stroke.radius * 3)
  const planes = extractPlanes(base, width, rect)
  healMask(planes, strokeMask(stroke, rect, 0.6), Math.max(2, stroke.radius * 0.8), 0.9)
  // 局部区域：透明度取原图，RGB 取修补结果
  const rgba = cropRgba(base, width, rect)
  for (let i = 0; i < rect.width * rect.height; i++) {
    rgba[i * 4] = planes.r[i]!
    rgba[i * 4 + 1] = planes.g[i]!
    rgba[i * 4 + 2] = planes.b[i]!
  }
  return { rect, rgba }
}

/**
 * 消除画笔：在笔画周围一圈的范围内找相似纹理（PatchMatch）填补笔画区域。
 * 搜索范围外扩到笔画大小的 1.2 倍（至少 48 像素）。
 */
export function erasePatch(base: Uint8ClampedArray, width: number, height: number, stroke: Stroke, seed = 1): { rect: Rect, rgba: Uint8ClampedArray } {
  const inner = strokeBounds(stroke, width, height)
  const margin = Math.max(48, Math.max(inner.width, inner.height) * 1.2)
  const rect = expandRect(inner, margin, width, height)
  const soft = strokeMask(stroke, rect, 1)
  const hole = new Uint8Array(soft.length)
  // 稍微放大，盖住物体边缘的过渡色
  const grown = strokeMask({ points: stroke.points, radius: stroke.radius + 2 }, rect, 1)
  for (let i = 0; i < hole.length; i++) hole[i] = grown[i]! > 0.5 ? 1 : 0
  const region = cropRgba(base, width, rect)
  return { rect, rgba: inpaint(region, rect.width, rect.height, hole, { seed }) }
}

/** 推拉画笔的控制点 */
export function pushOp(strokeId: number, stroke: Stroke): ManualOp {
  return { kind: 'push', strokeId, controls: pushControls(stroke, 1) }
}

/**
 * 收下巴画笔：选下颌线离笔画最近的那张脸，按涂抹的范围生成提拉参数。
 * 没有人脸，或笔画完全在脸内侧时返回 null。
 */
export function chinOp(strokeId: number, stroke: Stroke, faces: { points: Point[], faceWidth: number }[]): ManualOp | null {
  if (!stroke.points.length || !faces.length) return null
  const cx = stroke.points.reduce((sum, p) => sum + p.x, 0) / stroke.points.length
  const cy = stroke.points.reduce((sum, p) => sum + p.y, 0) / stroke.points.length
  let face = -1
  let best = Infinity
  faces.forEach((f, i) => {
    const frame = jawFrame(f.points)
    const pos = locateOnJaw(cx, cy, frame)
    // 不在下颌线的角度范围内（如额头、背景）时不选这张脸
    const d = pos.t < 0 ? Infinity : Math.abs(pos.signed)
    if (d < best) {
      best = d
      face = i
    }
  })
  const f = faces[face]
  if (!f) return null
  const lift = liftFromStroke(stroke.points, stroke.radius, jawFrame(f.points), f.faceWidth)
  return lift ? { kind: 'chin', strokeId, face, lift } : null
}

/** 依次贴上所有补丁（原地修改） */
export function applyPatches(rgba: Uint8ClampedArray, width: number, ops: ManualOp[]): void {
  for (const op of ops) if (op.kind === 'patch') pasteRgba(rgba, width, op.rect, op.rgba)
}

/**
 * 磨皮画笔与保护画笔（原地修改 out）：
 * - 磨皮画笔：在笔画区域额外磨皮（脖子、手臂等自动识别不到的地方）
 * - 保护：笔画区域恢复为未磨皮的样子（reference 为贴完补丁、未做自动处理的图）
 */
export function applyMaskOps(out: Uint8ClampedArray, reference: Uint8ClampedArray, width: number, height: number, ops: ManualOp[]): void {
  const radius = Math.min(20, Math.max(2, Math.round(Math.min(width, height) * 0.006)))
  for (const op of ops) {
    if (op.kind !== 'mask') continue
    const rect = strokeBounds(op.stroke, width, height, radius * 2)
    if (!rect.width || !rect.height) continue
    const mask = strokeMask(op.stroke, rect, 0.4)
    if (op.tool === 'smooth') {
      const planes = extractPlanes(out, width, rect)
      // 用户主动涂抹的区域，磨得比自动磨皮更明显
      smoothSkin(planes, mask, { amount: 0.85, radius, eps: 50 * 50, texture: 0.2 })
      writePlanes(out, width, rect, planes)
    }
    else {
      for (let y = 0; y < rect.height; y++) {
        for (let x = 0; x < rect.width; x++) {
          const m = mask[y * rect.width + x]!
          if (m <= 0) continue
          const i = ((rect.y + y) * width + rect.x + x) * 4
          for (let c = 0; c < 3; c++) out[i + c] = out[i + c]! + (reference[i + c]! - out[i + c]!) * m
        }
      }
    }
  }
}

/** 所有推拉操作的控制点（按顺序） */
export function pushSequence(ops: ManualOp[]): WarpControl[] {
  return ops.flatMap(op => (op.kind === 'push' ? op.controls : []))
}

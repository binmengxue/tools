/**
 * 磨皮、去皱、肤色等滤镜（纯函数）
 */
import { boxBlur, gaussianBlur } from './raster'
import type { Planes } from './raster'

/**
 * 自引导的引导滤波（He et al.）：保边平滑，速度与半径无关。
 * eps 越大越平滑（数值与像素值同一量纲的平方，像素取值 0 ~ 255）。
 */
export function guidedFilter(src: Float32Array, width: number, height: number, radius: number, eps: number): Float32Array {
  const n = src.length
  const sq = new Float32Array(n)
  for (let i = 0; i < n; i++) sq[i] = src[i]! * src[i]!
  const mean = boxBlur(src, width, height, radius)
  const meanSq = boxBlur(sq, width, height, radius)
  const a = new Float32Array(n)
  const b = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const m = mean[i]!
    const variance = Math.max(0, meanSq[i]! - m * m)
    const ai = variance / (variance + eps)
    a[i] = ai
    b[i] = m - ai * m
  }
  const meanA = boxBlur(a, width, height, radius)
  const meanB = boxBlur(b, width, height, radius)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = meanA[i]! * src[i]! + meanB[i]!
  return out
}

/**
 * 肤色概率（YCbCr 空间），返回 0 ~ 1。
 * 落在典型肤色范围内为 1，范围外按距离线性衰减，避免硬边。
 */
export function skinProbability(r: number, g: number, b: number): number {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  const soft = 12
  const score = (v: number, lo: number, hi: number) => (v < lo ? 1 - (lo - v) / soft : v > hi ? 1 - (v - hi) / soft : 1)
  return Math.max(0, Math.min(score(cr, 133, 175), score(cb, 75, 130)))
}

/** 整块区域的肤色概率图 */
export function skinMap(planes: Planes): Float32Array {
  const out = new Float32Array(planes.r.length)
  for (let i = 0; i < out.length; i++) out[i] = skinProbability(planes.r[i]!, planes.g[i]!, planes.b[i]!)
  return out
}

export interface SmoothOptions {
  /** 力度 0 ~ 1 */
  amount: number
  /** 保边平滑的窗口半径（像素），按脸大小设置 */
  radius: number
  /** 平滑程度：越大越平滑 */
  eps: number
  /** 保留的细节纹理比例 0 ~ 1，避免「塑料脸」 */
  texture: number
}

/**
 * 在遮罩范围内磨皮：引导滤波去掉肤色不均 + 叠回部分细纹理，再按遮罩与力度混合。
 * 直接修改 planes。
 */
export function smoothSkin(planes: Planes, mask: Float32Array, options: SmoothOptions): void {
  const { width, height } = planes
  const { amount, radius, eps, texture } = options
  if (amount <= 0) return
  for (const channel of [planes.r, planes.g, planes.b]) {
    const smooth = guidedFilter(channel, width, height, radius, eps)
    const fine = gaussianBlur(channel, width, height, 1)
    for (let i = 0; i < channel.length; i++) {
      const m = mask[i]! * amount
      if (m <= 0) continue
      // 细纹理 = 原图 - 轻微模糊；叠回到平滑结果上
      const detail = channel[i]! - fine[i]!
      const target = smooth[i]! + detail * texture
      channel[i] = channel[i]! + (target - channel[i]!) * m
    }
  }
}

/**
 * 提亮比周围暗的细线（皱纹、眼袋阴影）：只提亮、不压暗，范围由遮罩控制。
 * 直接修改 planes。
 */
export function liftShadows(planes: Planes, mask: Float32Array, amount: number, sigma: number): void {
  if (amount <= 0) return
  const { width, height } = planes
  for (const channel of [planes.r, planes.g, planes.b]) {
    const base = gaussianBlur(channel, width, height, sigma)
    for (let i = 0; i < channel.length; i++) {
      const m = mask[i]! * amount
      if (m <= 0) continue
      const lack = base[i]! - channel[i]!
      if (lack > 0) channel[i] = channel[i]! + lack * m
    }
  }
}

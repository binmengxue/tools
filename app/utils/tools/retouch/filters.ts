/**
 * 磨皮、去皱、肤色等滤镜（纯函数）
 * 为了速度：每个滤镜只处理遮罩的外接矩形；大半径的计算在缩小的图上进行。
 */
import { boxBlur, cropMask, cropPlanes, downscale, expandRect, gaussianBlur, maskBounds, pastePlanes, upscale } from './raster'
import type { Planes, Rect } from './raster'

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
 * 快速引导滤波（He & Sun 2015）：在缩小 factor 倍的图上求系数 a、b，再放大回原尺寸作用在原图上。
 * 结果与 guidedFilter 非常接近，耗时约为 1/factor²。
 */
export function fastGuidedFilter(src: Float32Array, width: number, height: number, radius: number, eps: number, factor: number): Float32Array {
  if (factor <= 1) return guidedFilter(src, width, height, radius, eps)
  const small = downscale(src, width, height, factor)
  const { width: w, height: h, data } = small
  const r = Math.max(1, Math.round(radius / factor))
  const n = data.length
  const sq = new Float32Array(n)
  for (let i = 0; i < n; i++) sq[i] = data[i]! * data[i]!
  const mean = boxBlur(data, w, h, r)
  const meanSq = boxBlur(sq, w, h, r)
  const a = new Float32Array(n)
  const b = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const m = mean[i]!
    const variance = Math.max(0, meanSq[i]! - m * m)
    const ai = variance / (variance + eps)
    a[i] = ai
    b[i] = m - ai * m
  }
  const meanA = upscale(boxBlur(a, w, h, r), w, h, width, height, factor)
  const meanB = upscale(boxBlur(b, w, h, r), w, h, width, height, factor)
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) out[i] = meanA[i]! * src[i]! + meanB[i]!
  return out
}

/** 按半径选择缩小倍数：半径越大越可以缩小计算 */
function factorFor(radius: number): number {
  return radius >= 12 ? 4 : radius >= 6 ? 2 : 1
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
 * 只在遮罩外接矩形（外扩 margin）内处理：返回该矩形，以及裁出的子图和子遮罩。
 * 遮罩为空时返回 null。
 */
function cropToMask(planes: Planes, mask: Float32Array, margin: number): { rect: Rect, part: Planes, partMask: Float32Array } | null {
  const bounds = maskBounds(mask, planes.width, planes.height)
  if (!bounds) return null
  const rect = expandRect(bounds, margin, planes.width, planes.height)
  return { rect, part: cropPlanes(planes, rect), partMask: cropMask(mask, planes.width, rect) }
}

/**
 * 在遮罩范围内磨皮：引导滤波去掉肤色不均 + 叠回部分细纹理，再按遮罩与力度混合。
 * 直接修改 planes。
 */
export function smoothSkin(planes: Planes, mask: Float32Array, options: SmoothOptions): void {
  const { amount, radius, eps, texture } = options
  if (amount <= 0) return
  const crop = cropToMask(planes, mask, radius * 2)
  if (!crop) return
  const { rect, part, partMask } = crop
  const { width, height } = part
  const factor = factorFor(radius)
  for (const channel of [part.r, part.g, part.b]) {
    const smooth = fastGuidedFilter(channel, width, height, radius, eps, factor)
    // 细纹理 = 原图 - 3×3 平均
    const fine = boxBlur(channel, width, height, 1)
    for (let i = 0; i < channel.length; i++) {
      const m = partMask[i]! * amount
      if (m <= 0) continue
      const detail = channel[i]! - fine[i]!
      const target = smooth[i]! + detail * texture
      channel[i] = channel[i]! + (target - channel[i]!) * m
    }
  }
  pastePlanes(planes, rect, part)
}

/**
 * 提亮比周围暗的部分（皱纹、眼袋、黑眼圈、下巴阴影）：只提亮、不压暗，范围由遮罩控制。
 * sigma 决定「周围」的尺度：小 sigma 只提亮细纹，大 sigma 能提亮成片的阴影。
 * 直接修改 planes。
 */
export function liftShadows(planes: Planes, mask: Float32Array, amount: number, sigma: number): void {
  if (amount <= 0) return
  const crop = cropToMask(planes, mask, sigma * 3)
  if (!crop) return
  const { rect, part, partMask } = crop
  const { width, height } = part
  // 大尺度的参考亮度在缩小的图上计算
  const factor = sigma >= 16 ? 4 : sigma >= 8 ? 2 : 1
  for (const channel of [part.r, part.g, part.b]) {
    let base: Float32Array
    if (factor > 1) {
      const small = downscale(channel, width, height, factor)
      base = upscale(gaussianBlur(small.data, small.width, small.height, sigma / factor), small.width, small.height, width, height, factor)
    }
    else {
      base = gaussianBlur(channel, width, height, sigma)
    }
    for (let i = 0; i < channel.length; i++) {
      const m = partMask[i]! * amount
      if (m <= 0) continue
      const lack = base[i]! - channel[i]!
      if (lack > 0) channel[i] = channel[i]! + lack * m
    }
  }
  pastePlanes(planes, rect, part)
}

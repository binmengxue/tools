/**
 * 去双下巴（纯函数）：以下颌线为锚点的提拉变形 + 下巴下方褶皱淡化。
 *
 * 普通的「向前推」控制点会把下巴和双下巴一起平移，两者之间并没有被压缩。
 * 这里改为按「到下颌线的距离 s」定义位移：下颌线上和脸内部不动，下颌线下方的内容朝下颌线收拢，
 * 峰值处把原图 [0, peak + shift] 的内容压进 [0, peak]，双下巴就被收进下颌阴影里；
 * 再往下（脖子）在较长的距离内逐渐恢复，拉伸被分散开。
 */
import { skinMap } from './filters'
import { expandRect, gaussianBlur } from './raster'
import type { Rect } from './raster'
import type { Point } from './regions'
import { LOWER_JAW } from './warp'

/**
 * 下颌线（像素坐标），从右侧下颌角经下巴尖到左侧下颌角，与 LOWER_JAW 一一对应。
 * 用以鼻尖为中心的极坐标描述：每个方向上下颌线到中心的距离按角度插值。
 * 这样「到下颌线的距离」和「沿下颌线的位置」处处连续；
 * 若用到折线最近点的距离，关键点的小凹折会在远处造成跳变，把领口等撕成锯齿。
 */
export interface JawFrame {
  line: Point[]
  /** 中心（鼻尖） */
  center: Point
  /** 各顶点相对中心的角度（正下方为 0，图片左侧为负），严格递增 */
  angles: number[]
  /** 各顶点到中心的距离 */
  radii: number[]
}

/** 一次提拉的参数（像素） */
export interface ChinLift {
  /** 下颌线各顶点的力度权重（0 ~ 1，与 LOWER_JAW 一一对应） */
  weights: number[]
  /** 位移最大处到下颌线的距离 */
  peak: number
  /** 位移降为 0 处到下颌线的距离 */
  reach: number
  /** 最大位移 */
  shift: number
}

/** 某一点相对下颌线的位置 */
export interface JawPosition {
  /** 沿中心射线方向到下颌线的距离；在脸内侧时为 0 */
  s: number
  /** 带符号的距离：脸内侧为负 */
  signed: number
  /** 沿下颌线的位置：顶点序号（含小数）；不在下颌线的角度范围内时为 -1 */
  t: number
  /** 指向中心（朝下颌线收）的单位向量 */
  ux: number
  uy: number
}

/** 自动去双下巴时，下颌线各处的力度：下巴正下方最强，到两侧下颌角降为 0（两端为 0，下颌线外侧的背景不受影响） */
export const AUTO_CHIN_WEIGHTS = [0, 0.3, 0.6, 0.85, 1, 1, 1, 1, 1, 0.85, 0.6, 0.3, 0]

/** 由关键点像素坐标得到下颌线（两次 [1,2,1] 平滑，去掉关键点抖动），以鼻尖为中心 */
export function jawFrame(points: Point[]): JawFrame {
  let line = LOWER_JAW.map(i => ({ x: points[i]!.x, y: points[i]!.y }))
  for (let pass = 0; pass < 2; pass++) {
    line = line.map((p, k) => {
      if (k === 0 || k === line.length - 1) return p
      const a = line[k - 1]!
      const b = line[k + 1]!
      return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 }
    })
  }
  const center = { x: points[1]!.x, y: points[1]!.y }
  const angles: number[] = []
  const radii: number[] = []
  line.forEach((p, k) => {
    const angle = Math.atan2(p.x - center.x, p.y - center.y)
    // 保证角度递增（关键点异常时也不会出现重叠）
    angles.push(k > 0 ? Math.max(angle, angles[k - 1]! + 1e-4) : angle)
    radii.push(Math.hypot(p.x - center.x, p.y - center.y))
  })
  return { line, center, angles, radii }
}

/** 求一点相对下颌线的位置 */
export function locateOnJaw(x: number, y: number, frame: JawFrame): JawPosition {
  const { center, angles, radii } = frame
  const vx = x - center.x
  const vy = y - center.y
  const r = Math.hypot(vx, vy)
  if (r < 1e-6) return { s: 0, signed: -radii[0]!, t: -1, ux: 0, uy: 0 }
  const angle = Math.atan2(vx, vy)
  const last = angles.length - 1
  let t = -1
  let radius: number
  if (angle <= angles[0]!) radius = radii[0]!
  else if (angle >= angles[last]!) radius = radii[last]!
  else {
    let k = 0
    while (k < last - 1 && angle > angles[k + 1]!) k++
    const u = (angle - angles[k]!) / (angles[k + 1]! - angles[k]!)
    t = k + u
    radius = radii[k]! + (radii[k + 1]! - radii[k]!) * u
  }
  const signed = r - radius
  return { s: Math.max(0, signed), signed, t, ux: -vx / r, uy: -vy / r }
}

/** 按顶点序号（含小数）对权重线性插值 */
function weightAt(weights: number[], t: number): number {
  if (t < 0) return 0
  const k = Math.min(weights.length - 2, Math.max(0, Math.floor(t)))
  const u = Math.min(1, Math.max(0, t - k))
  return weights[k]! + (weights[k + 1]! - weights[k]!) * u
}

/**
 * 位移大小随距离的变化：0 处为 0 且斜率为 0（下颌线处不出折痕），smoothstep 升到 peak 处的 shift，
 * 再按 (1 - u²)² 在 reach 处降为 0。
 */
export function liftProfile(s: number, lift: Pick<ChinLift, 'peak' | 'reach' | 'shift'>): number {
  if (s <= 0 || s >= lift.reach) return 0
  if (s < lift.peak) {
    const u = s / lift.peak
    return lift.shift * u * u * (3 - 2 * u)
  }
  const u = (s - lift.peak) / (lift.reach - lift.peak)
  const v = 1 - u * u
  return lift.shift * v * v
}

/**
 * 由峰值位置、作用距离和最大位移得到提拉参数。
 * 最大位移不超过 (reach - peak) 的一半，保证脖子一侧的拉伸不会折叠。
 */
export function makeLift(weights: number[], peak: number, reach: number, shift: number): ChinLift {
  return { weights, peak, reach, shift: Math.max(0, Math.min(0.5 * (reach - peak), shift)) }
}

/**
 * 自动去双下巴的提拉参数（amount 0 ~ 1）。
 * 峰值离下颌线很近、位移较大：双下巴和褶皱通常在下颌线下方 0.05 ~ 0.15 倍脸宽处，
 * 力度为 1 时原图 [0, 0.155] 倍脸宽的内容被压进 [0, 0.035]，与下颌阴影合为一条轮廓线。
 */
export function autoChinLift(faceWidth: number, amount: number): ChinLift {
  return makeLift(AUTO_CHIN_WEIGHTS, faceWidth * 0.035, faceWidth * 0.42, faceWidth * 0.12 * amount)
}

/**
 * 某一点的位移（与 warp.ts 的约定一致：输出像素从「该点 - 位移」处取色）。
 * 位移朝向下颌线：下颌线下方的像素取更下方的内容，双下巴被收进下颌线。
 */
export function chinLiftAt(x: number, y: number, frame: JawFrame, lift: ChinLift): Point {
  const pos = locateOnJaw(x, y, frame)
  if (pos.s <= 0 || pos.s >= lift.reach || pos.t < 0) return { x: 0, y: 0 }
  const g = liftProfile(pos.s, lift) * weightAt(lift.weights, pos.t)
  return { x: pos.ux * g, y: pos.uy * g }
}

/** 提拉的影响范围（下颌线外扩 reach，裁剪到图片内） */
export function chinLiftBounds(frame: JawFrame, lift: ChinLift, width: number, height: number): Rect | null {
  if (lift.shift <= 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of frame.line) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  const rect = expandRect({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, lift.reach, width, height)
  return rect.width > 0 && rect.height > 0 ? rect : null
}

const smoothstep = (a: number, b: number, v: number) => {
  const u = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/**
 * 淡化下巴下方的褶皱与阴影（原地修改 rgba，在提拉变形之前、原图坐标下执行）。
 *
 * - 作用范围：下颌线下方的带状区域（紧贴下颌的阴影保留，轮廓依然清晰），乘以下颌线各处的权重
 * - 只用皮肤做参考：用肤色概率加权的归一化卷积求局部肤色，头发、衣服、背景几乎不参与
 * - 只叠加平滑的提亮量，不替换像素：发丝、颈纹的相对明暗不变，不会被抹掉
 * - 参考亮度只取下颌线下方的皮肤，避免以更亮的脸部为目标提出一块亮楔形
 */
export function softenUnderChin(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  frame: JawFrame,
  lift: ChinLift,
  faceWidth: number,
  amount: number,
): void {
  if (amount <= 0) return
  // 带状遮罩：从紧贴下颌的阴影下方开始，覆盖会被压进下颌线的那段（peak + shift）再多一点
  const bandStart = faceWidth * 0.012
  const bandFull = faceWidth * 0.035
  const bandEnd = lift.peak + lift.shift + faceWidth * 0.03
  const bandZero = bandEnd + faceWidth * 0.08
  // 处理范围：带状区域，再留出参考亮度的模糊半径
  const rect = chinLiftBounds(frame, { ...lift, reach: bandZero + faceWidth * 0.1 }, width, height)
  if (!rect) return

  // 提亮量是大尺度的平滑量，全部在缩小的图上计算：直接从 RGBA 按块求平均
  const factor = 4
  const sw = Math.ceil(rect.width / factor)
  const sh = Math.ceil(rect.height / factor)
  const n = sw * sh
  const sr = new Float32Array(n)
  const sg = new Float32Array(n)
  const sb = new Float32Array(n)
  const count = new Float32Array(n)
  for (let y = 0; y < rect.height; y++) {
    const row = ((y / factor) | 0) * sw
    let i = ((rect.y + y) * width + rect.x) * 4
    for (let x = 0; x < rect.width; x++, i += 4) {
      const j = row + ((x / factor) | 0)
      sr[j] = sr[j]! + rgba[i]!
      sg[j] = sg[j]! + rgba[i + 1]!
      sb[j] = sb[j]! + rgba[i + 2]!
      count[j] = count[j]! + 1
    }
  }
  for (let j = 0; j < n; j++) {
    sr[j] = sr[j]! / count[j]!
    sg[j] = sg[j]! / count[j]!
    sb[j] = sb[j]! / count[j]!
  }

  // 带状遮罩与「下颌线下方」的范围
  const band = new Float32Array(n)
  const below = new Float32Array(n)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const pos = locateOnJaw(rect.x + (x + 0.5) * factor, rect.y + (y + 0.5) * factor, frame)
      if (pos.s <= 0) continue
      const i = y * sw + x
      below[i] = smoothstep(0, faceWidth * 0.03, pos.s)
      const ramp = Math.min(smoothstep(bandStart, bandFull, pos.s), 1 - smoothstep(bandEnd, bandZero, pos.s))
      band[i] = ramp * weightAt(lift.weights, pos.t)
    }
  }

  // 肤色权重
  const skin = skinMap({ width: sw, height: sh, r: sr, g: sg, b: sb })
  const refWeight = new Float32Array(n)
  for (let i = 0; i < n; i++) refWeight[i] = skin[i]! * below[i]!
  const sigmaMid = Math.max(1, (faceWidth * 0.025) / factor)
  const sigmaRef = Math.max(1, (faceWidth * 0.09) / factor)
  const midSum = gaussianBlur(skin, sw, sh, sigmaMid)
  const refSum = gaussianBlur(refWeight, sw, sh, sigmaRef)
  const cap = 40

  const offsets = [new Float32Array(n), new Float32Array(n), new Float32Array(n)]
  const active = new Uint8Array(n)
  for (const [c, channel] of [sr, sg, sb].entries()) {
    const weighted = new Float32Array(n)
    const weightedRef = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      weighted[i] = channel[i]! * skin[i]!
      weightedRef[i] = channel[i]! * refWeight[i]!
    }
    const mid = gaussianBlur(weighted, sw, sh, sigmaMid)
    const ref = gaussianBlur(weightedRef, sw, sh, sigmaRef)
    const offset = offsets[c]!
    for (let i = 0; i < n; i++) {
      const m = band[i]!
      if (m <= 0 || midSum[i]! < 0.05 || refSum[i]! < 0.05) continue
      // 周围皮肤太少（多为头发、衣服）时减弱
      const confidence = Math.min(1, midSum[i]! / 0.4)
      const lack = ref[i]! / refSum[i]! - mid[i]! / midSum[i]!
      if (lack > 0) {
        offset[i] = Math.min(cap, lack) * m * amount * confidence
        if (offset[i]! > 0.05) active[i] = 1
      }
    }
  }

  // 双线性放大并叠加到原图：只处理附近有提亮量的像素
  for (let y = 0; y < rect.height; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / factor - 0.5))
    const y0 = fy | 0
    const y1 = Math.min(sh - 1, y0 + 1)
    const ty = fy - y0
    let i = ((rect.y + y) * width + rect.x) * 4
    for (let x = 0; x < rect.width; x++, i += 4) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / factor - 0.5))
      const x0 = fx | 0
      const x1 = Math.min(sw - 1, x0 + 1)
      const a = y0 * sw + x0
      const b = y0 * sw + x1
      const c = y1 * sw + x0
      const d = y1 * sw + x1
      if (!active[a] && !active[b] && !active[c] && !active[d]) continue
      const tx = fx - x0
      for (let k = 0; k < 3; k++) {
        const o = offsets[k]!
        const top = o[a]! + (o[b]! - o[a]!) * tx
        const bottom = o[c]! + (o[d]! - o[c]!) * tx
        rgba[i + k] = rgba[i + k]! + top + (bottom - top) * ty
      }
    }
  }
}

/**
 * 「收下巴」画笔：根据涂抹的位置生成提拉参数。
 * 涂到的下颌线范围决定各处力度；涂到的最远距离（双下巴连同褶皱的范围）决定收多少。
 * 笔画完全在脸内侧时返回 null。
 */
export function liftFromStroke(points: Point[], radius: number, frame: JawFrame, faceWidth: number, amount = 0.6): ChinLift | null {
  const weights = new Array<number>(LOWER_JAW.length).fill(0)
  let sMax = 0
  let any = false
  const segment = averageSegment(frame)
  const spread = radius / segment + 1
  for (const p of points) {
    const pos = locateOnJaw(p.x, p.y, frame)
    if (pos.t < 0) continue
    // 圆圈越过下颌线也算涂到了下颌线下方；圆圈边缘通常比双下巴的范围更远，只算一部分
    const reachOut = pos.signed + radius * 0.6
    if (reachOut <= 0) continue
    any = true
    sMax = Math.max(sMax, reachOut)
    for (let k = 0; k < weights.length; k++) {
      weights[k] = Math.max(weights[k]!, Math.max(0, 1 - Math.abs(k - pos.t) / spread))
    }
  }
  if (!any) return null
  // 两端为 0：下颌角外侧多为背景、头发
  weights[0] = 0
  weights[weights.length - 1] = 0
  const smoothed = weights.map((v, k) => (k === 0 || k === weights.length - 1 ? 0 : (weights[k - 1]! + 2 * v + weights[k + 1]!) / 4))
  const max = Math.max(...smoothed)
  if (max <= 0) return null
  const normalized = smoothed.map(v => v / max)
  const extent = Math.min(faceWidth * 0.25, sMax)
  const peak = Math.min(faceWidth * 0.06, Math.max(faceWidth * 0.02, extent * 0.25))
  const shift = extent * amount
  return makeLift(normalized, peak, peak + Math.max(faceWidth * 0.3, shift * 2.2), shift)
}

function averageSegment(frame: JawFrame): number {
  let total = 0
  for (let k = 0; k + 1 < frame.line.length; k++) {
    total += Math.hypot(frame.line[k + 1]!.x - frame.line[k]!.x, frame.line[k + 1]!.y - frame.line[k]!.y)
  }
  return Math.max(1, total / (frame.line.length - 1))
}

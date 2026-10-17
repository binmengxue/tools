/**
 * 人像美颜处理流程（纯函数，在 Web Worker 中运行）
 * - prepareFace：每张照片识别后执行一次，计算每张脸的处理区域、皮肤遮罩、去皱遮罩
 * - retouchFace：每次调整滑杆时执行，只处理人脸附近的局部区域
 */
import { detectSpots, healSpots } from './blemish'
import { skinMap, liftShadows, smoothSkin } from './filters'
import {
  expandRect,
  extractPlanes,
  feather,
  fillCircle,
  fillPolygon,
  gaussianBlur,
  luminance,
  writePlanes,
} from './raster'
import type { Planes, Rect } from './raster'
import {
  boundsOf,
  crowsFeet,
  EXCLUDED_REGIONS,
  FACE_OVAL,
  faceWidth,
  LEFT_UNDER_EYE,
  nasolabialBand,
  RIGHT_UNDER_EYE,
  toPolygon,
  WRINKLE_REGIONS,
} from './regions'
import type { Point } from './regions'
import { applyMaskOps, pushSequence } from './manual'
import type { ManualOp } from './manual'
import { applyWarp, applyWarpSequence, chinControls, slimFaceControls } from './warp'
import type { WarpControl } from './warp'

/** 各项力度，0 ~ 100 */
export interface RetouchParams {
  smooth: number
  blemish: number
  wrinkle: number
  slim: number
  chin: number
}

export const ZERO_PARAMS: RetouchParams = { smooth: 0, blemish: 0, wrinkle: 0, slim: 0, chin: 0 }

/** 「一键美颜」：自然、不过度的默认组合 */
export const BEAUTY_PRESET: RetouchParams = { smooth: 45, blemish: 60, wrinkle: 50, slim: 25, chin: 30 }

export interface FacePrep {
  /** 处理区域（图片坐标） */
  rect: Rect
  /** 皮肤遮罩（处理区域大小） */
  skin: Float32Array
  /** 去皱遮罩（处理区域大小） */
  wrinkle: Float32Array
  /** 眼下（眼袋、黑眼圈）遮罩（处理区域大小） */
  underEye: Float32Array
  /** 祛斑检测范围：皮肤遮罩，并远离眼、眉、唇，避免把睫毛、眉毛当成斑点 */
  blemishZone: Float32Array
  /** 下巴下方阴影区域（处理区域大小），去双下巴时提亮 */
  chin: Float32Array
  /** 脸宽（像素），各种半径以它为尺度 */
  faceWidth: number
  /** 关键点像素坐标 */
  points: Point[]
}

/** 关键点归一化坐标 → 像素坐标 */
export function toPixels(landmarks: Point[], width: number, height: number): Point[] {
  return landmarks.map(p => ({ x: p.x * width, y: p.y * height }))
}

/**
 * 计算一张脸的处理区域与遮罩。
 * landmarks 为归一化坐标（0 ~ 1）。
 */
export function prepareFace(rgba: Uint8ClampedArray, width: number, height: number, landmarks: Point[]): FacePrep {
  const fw = faceWidth(landmarks, width, height)
  const oval = toPolygon(landmarks, FACE_OVAL, width, height)
  // 往下多留一些：去双下巴需要下巴下方的区域
  const b = boundsOf(oval)
  const rect = expandRect({ x: b.x, y: b.y, width: b.width, height: b.height + fw * 0.25 }, fw * 0.12, width, height)
  const offset = { x: rect.x, y: rect.y }
  const w = rect.width
  const h = rect.height

  // 皮肤：脸部轮廓 - 眼睛 / 眉毛 / 嘴唇（这些区域略微放大后挖掉）
  const skin = new Float32Array(w * h)
  fillPolygon(skin, w, h, oval, 1, 'max', offset)
  const holes = new Float32Array(w * h)
  for (const region of EXCLUDED_REGIONS) fillPolygon(holes, w, h, toPolygon(landmarks, region, width, height), 1, 'max', offset)
  const grownHoles = gaussianBlur(holes, w, h, fw * 0.012)
  // 肤色细化：避开头发、眼镜框、背景
  const planes = extractPlanes(rgba, width, rect)
  const color = gaussianBlur(skinMap(planes), w, h, 2)
  for (let i = 0; i < skin.length; i++) {
    const notHole = 1 - Math.min(1, grownHoles[i]! * 2.5)
    skin[i] = skin[i]! * notHole * (0.35 + 0.65 * color[i]!)
  }
  const skinSoft = feather(skin, w, h, fw * 0.02)

  // 祛斑范围：在皮肤的基础上，把眼、眉、唇周围更大一圈也排除（睫毛、眉毛、唇纹都是「暗的小块」）
  const farHoles = gaussianBlur(holes, w, h, fw * 0.035)
  const blemishZone = new Float32Array(w * h)
  for (let i = 0; i < blemishZone.length; i++) blemishZone[i] = skin[i]! * (1 - Math.min(1, farHoles[i]! * 6))

  // 去皱区域：眼下、额头、法令纹、鱼尾纹
  const wrinkle = new Float32Array(w * h)
  for (const region of WRINKLE_REGIONS) fillPolygon(wrinkle, w, h, toPolygon(landmarks, region, width, height), 1, 'max', offset)
  for (const side of ['left', 'right'] as const) {
    fillPolygon(wrinkle, w, h, nasolabialBand(landmarks, side, width, height), 1, 'max', offset)
    const cf = crowsFeet(landmarks, side, width, height)
    fillCircle(wrinkle, w, h, cf.center.x - offset.x, cf.center.y - offset.y, cf.radius, 1, 'max', 0.4)
  }
  const wrinkleSoft = feather(wrinkle, w, h, fw * 0.03)
  for (let i = 0; i < wrinkleSoft.length; i++) wrinkleSoft[i] = wrinkleSoft[i]! * Math.min(1, skinSoft[i]! * 1.5)

  // 眼下：眼袋、黑眼圈（成片的阴影，单独用大尺度提亮）
  const underEye = new Float32Array(w * h)
  for (const region of [LEFT_UNDER_EYE, RIGHT_UNDER_EYE]) fillPolygon(underEye, w, h, toPolygon(landmarks, region, width, height), 1, 'max', offset)
  const underEyeSoft = feather(underEye, w, h, fw * 0.025)
  for (let i = 0; i < underEyeSoft.length; i++) underEyeSoft[i] = underEyeSoft[i]! * Math.min(1, skinSoft[i]! * 1.5)

  // 下巴下方：双下巴的褶皱阴影所在，椭圆区域 × 肤色
  const points = toPixels(landmarks, width, height)
  const chinPoint = points[152]!
  const chin = new Float32Array(w * h)
  const cx = chinPoint.x - offset.x
  const cy = chinPoint.y + fw * 0.1 - offset.y
  const rx = fw * 0.28
  const ry = fw * 0.12
  for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(h, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(w, Math.ceil(cx + rx)); x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
      if (d < 1) chin[y * w + x] = (1 - d) * color[y * w + x]!
    }
  }

  return { rect, skin: skinSoft, wrinkle: wrinkleSoft, underEye: underEyeSoft, blemishZone, chin, faceWidth: fw, points }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * 对一张脸做皮肤类处理（直接修改 planes，planes 为该脸处理区域的局部图像）。
 * 顺序：祛斑 → 去皱 → 下巴阴影 → 磨皮。返回修补的斑点数。
 */
export function retouchSkin(planes: Planes, prep: FacePrep, params: RetouchParams): number {
  const { width: w, height: h } = planes
  const fw = prep.faceWidth
  let spotCount = 0

  if (params.blemish > 0) {
    const s = params.blemish / 100
    // 毛孔也是「暗的小点」，但明显更小、更浅；面积下限和深度阈值都按脸的大小设置，只处理痘印、斑点、痣
    const spots = detectSpots(luminance(planes), prep.blemishZone, w, h, {
      threshold: 32 - 18 * s,
      sigma: Math.max(3, fw * 0.03),
      minArea: Math.max(4, Math.PI * (fw * 0.0045) ** 2),
      maxArea: Math.PI * (fw * 0.025) ** 2,
      minSkin: 0.6,
    })
    spotCount = spots.length
    if (spots.length) healSpots(planes, spots, Math.max(2, fw * 0.012))
  }

  if (params.wrinkle > 0) {
    const s = params.wrinkle / 100
    smoothSkin(planes, prep.wrinkle, { amount: s, radius: clamp(Math.round(fw * 0.025), 2, 30), eps: 40 * 40, texture: 0.15 })
    liftShadows(planes, prep.wrinkle, s * 0.7, Math.max(2, fw * 0.02))
    // 黑眼圈、眼袋：以大范围的周围亮度为参考提亮
    liftShadows(planes, prep.underEye, s * 0.9, Math.max(4, fw * 0.07))
  }

  if (params.chin > 0) {
    // 双下巴的褶皱阴影：只提亮不压暗
    liftShadows(planes, prep.chin, (params.chin / 100) * 0.6, Math.max(3, fw * 0.04))
  }

  if (params.smooth > 0) {
    const s = params.smooth / 100
    smoothSkin(planes, prep.skin, {
      amount: s,
      radius: clamp(Math.round(fw * 0.018), 2, 24),
      eps: (12 + 28 * s) ** 2,
      texture: 0.55 - 0.25 * s,
    })
  }

  return spotCount
}

/** 所有人脸的自动变形控制点（瘦脸 + 去双下巴） */
export function faceWarpControls(preps: FacePrep[], params: RetouchParams): WarpControl[] {
  return preps.flatMap(prep => [
    ...slimFaceControls(prep.points, prep.faceWidth, params.slim / 100),
    ...chinControls(prep.points, prep.faceWidth, params.chin / 100),
  ])
}

/**
 * 处理整张图片：
 * 1. 在 base（已贴好修复 / 消除补丁）的副本上逐张脸做皮肤处理
 * 2. 磨皮画笔、保护画笔
 * 3. 瘦脸、去双下巴的自动变形
 * 4. 推拉画笔（按顺序逐步变形）
 * 返回新的 RGBA 数据与修补的斑点总数。
 */
export function renderRetouch(
  base: Uint8ClampedArray,
  width: number,
  height: number,
  preps: FacePrep[],
  params: RetouchParams,
  manualOps: ManualOp[] = [],
): { rgba: Uint8ClampedArray, spots: number } {
  const skin = renderSkin(base, width, preps, params)
  return { rgba: finishRender(skin.rgba, base, width, height, preps, params, manualOps), spots: skin.spots }
}

/** 影响皮肤阶段结果的参数（瘦脸、去双下巴的变形不在其中，拖动它们时皮肤阶段可以复用缓存） */
export function skinKey(params: RetouchParams): string {
  return `${params.smooth}|${params.blemish}|${params.wrinkle}|${params.chin}`
}

/** 皮肤阶段：逐张脸祛斑、去皱、提亮下巴阴影、磨皮（返回新数组，不修改 base） */
export function renderSkin(base: Uint8ClampedArray, width: number, preps: FacePrep[], params: RetouchParams): { rgba: Uint8ClampedArray, spots: number } {
  const out = base.slice()
  let spots = 0
  for (const prep of preps) {
    if (prep.rect.width === 0 || prep.rect.height === 0) continue
    const planes = extractPlanes(out, width, prep.rect)
    spots += retouchSkin(planes, prep, params)
    writePlanes(out, width, prep.rect, planes)
  }
  return { rgba: out, spots }
}

/** 收尾阶段：磨皮 / 保护画笔、自动变形、推拉画笔（skin 为皮肤阶段结果，不会被修改） */
export function finishRender(
  skin: Uint8ClampedArray,
  base: Uint8ClampedArray,
  width: number,
  height: number,
  preps: FacePrep[],
  params: RetouchParams,
  manualOps: ManualOp[],
): Uint8ClampedArray {
  let out: Uint8ClampedArray = skin.slice()
  applyMaskOps(out, base, width, height, manualOps)
  const controls = faceWarpControls(preps, params)
  if (controls.length) out = applyWarp(out, width, height, controls)
  const pushes = pushSequence(manualOps)
  if (pushes.length) applyWarpSequence(out, width, height, pushes)
  return out
}

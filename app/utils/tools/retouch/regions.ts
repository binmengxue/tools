/**
 * 人脸区域（基于 MediaPipe Face Mesh 的 478 个关键点）
 * 索引按顺序首尾相连构成多边形；单测会与 MediaPipe 自带的连线数据交叉校验。
 * 「左 / 右」指被拍摄者自己的左右（在照片里左眼位于右侧）。
 */

export interface Point {
  x: number
  y: number
}

/** 脸部外轮廓（从额头顶部顺时针一圈） */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

export const LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
export const RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]

/** 嘴唇外轮廓 */
export const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]

/** 眉毛：下沿 + 上沿反向，围成一圈 */
export const LEFT_EYEBROW = [276, 283, 282, 295, 285, 336, 296, 334, 293, 300]
export const RIGHT_EYEBROW = [46, 53, 52, 65, 55, 107, 66, 105, 63, 70]

/** 眼睛下方：下眼睑 + 下方第三圈轮廓（反向），即眼袋、泪沟一带 */
export const LEFT_UNDER_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 465, 357, 350, 349, 348, 347, 346, 340, 372]
export const RIGHT_UNDER_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 245, 128, 121, 120, 119, 118, 117, 111, 143]

/** 额头：两条眉毛上沿 + 脸部轮廓顶部 */
export const FOREHEAD = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 284, 332, 297, 338, 10, 109, 67, 103, 54]

/** 鼻翼（左 / 右）、嘴角（左 / 右）、外眼角（左 / 右）、下巴尖、额头顶、两侧颧骨 */
export const KEY = {
  noseWingLeft: 294,
  noseWingRight: 64,
  mouthLeft: 291,
  mouthRight: 61,
  eyeOuterLeft: 263,
  eyeOuterRight: 33,
  chin: 152,
  foreheadTop: 10,
  cheekLeft: 454,
  cheekRight: 234,
  noseTip: 1,
} as const

/** 关键点序号 → 像素坐标的多边形 */
export function toPolygon(landmarks: Point[], indices: number[], width: number, height: number): Point[] {
  return indices.map((i) => {
    const p = landmarks[i]!
    return { x: p.x * width, y: p.y * height }
  })
}

/** 关键点的像素坐标 */
export function pointAt(landmarks: Point[], index: number, width: number, height: number): Point {
  const p = landmarks[index]!
  return { x: p.x * width, y: p.y * height }
}

/** 多边形外接矩形 */
export function boundsOf(points: Point[]): { x: number, y: number, width: number, height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** 脸宽（两侧颧骨之间的距离），用作各种半径的尺度 */
export function faceWidth(landmarks: Point[], width: number, height: number): number {
  const a = pointAt(landmarks, KEY.cheekLeft, width, height)
  const b = pointAt(landmarks, KEY.cheekRight, width, height)
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * 法令纹区域：从鼻翼到嘴角的一条带，向脸颊外侧偏移。
 * 法令纹没有对应的关键点，用几何方式构造四边形。
 */
export function nasolabialBand(landmarks: Point[], side: 'left' | 'right', width: number, height: number): Point[] {
  const wing = pointAt(landmarks, side === 'left' ? KEY.noseWingLeft : KEY.noseWingRight, width, height)
  const mouth = pointAt(landmarks, side === 'left' ? KEY.mouthLeft : KEY.mouthRight, width, height)
  const nose = pointAt(landmarks, KEY.noseTip, width, height)
  const fw = faceWidth(landmarks, width, height)
  // 外侧方向：远离鼻尖的水平方向
  const out = Math.sign(wing.x - nose.x) || (side === 'left' ? 1 : -1)
  const w = fw * 0.07
  return [
    { x: wing.x, y: wing.y - w * 0.3 },
    { x: wing.x + out * w * 1.4, y: wing.y },
    { x: mouth.x + out * w * 1.2, y: mouth.y + w * 0.6 },
    { x: mouth.x, y: mouth.y + w * 0.2 },
  ]
}

/** 外眼角鱼尾纹区域（圆）：圆心在外眼角向外偏移 */
export function crowsFeet(landmarks: Point[], side: 'left' | 'right', width: number, height: number): { center: Point, radius: number } {
  const corner = pointAt(landmarks, side === 'left' ? KEY.eyeOuterLeft : KEY.eyeOuterRight, width, height)
  const nose = pointAt(landmarks, KEY.noseTip, width, height)
  const fw = faceWidth(landmarks, width, height)
  const out = Math.sign(corner.x - nose.x) || (side === 'left' ? 1 : -1)
  return { center: { x: corner.x + out * fw * 0.06, y: corner.y }, radius: fw * 0.07 }
}

/** 一张脸上需要从皮肤中排除的区域：眼睛、眉毛、嘴唇 */
export const EXCLUDED_REGIONS = [LEFT_EYE, RIGHT_EYE, LEFT_EYEBROW, RIGHT_EYEBROW, LIPS_OUTER]

/** 用多边形关键点索引描述的去皱区域：眼下、额头 */
export const WRINKLE_REGIONS = [LEFT_UNDER_EYE, RIGHT_UNDER_EYE, FOREHEAD]

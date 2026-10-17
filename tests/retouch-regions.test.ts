import { readFileSync } from 'node:fs'
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { describe, expect, it } from 'vitest'
import { MEDIAPIPE_VERSION } from '../app/composables/useFaceLandmarker'
import {
  boundsOf,
  crowsFeet,
  FACE_OVAL,
  FOREHEAD,
  LEFT_EYE,
  LEFT_EYEBROW,
  LEFT_UNDER_EYE,
  LIPS_OUTER,
  nasolabialBand,
  RIGHT_EYE,
  RIGHT_EYEBROW,
  RIGHT_UNDER_EYE,
  toPolygon,
} from '../app/utils/tools/retouch/regions'
import type { Point } from '../app/utils/tools/retouch/regions'

type Connection = { start: number, end: number }

/** 连线集合（无向） */
function edgeSet(connections: Connection[]): Set<string> {
  const set = new Set<string>()
  for (const { start, end } of connections) {
    set.add(`${start}-${end}`)
    set.add(`${end}-${start}`)
  }
  return set
}

/** 闭合多边形的每条边都应是 MediaPipe 连线中的一条 */
function expectLoopMatches(loop: number[], connections: Connection[]) {
  const edges = edgeSet(connections)
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!
    const b = loop[(i + 1) % loop.length]!
    expect(edges.has(`${a}-${b}`), `${a}-${b}`).toBe(true)
  }
  expect(new Set(loop).size).toBe(loop.length)
}

describe('关键点区域与 MediaPipe 一致', () => {
  it('MediaPipe 版本号与依赖一致', () => {
    const pkg = JSON.parse(readFileSync('node_modules/@mediapipe/tasks-vision/package.json', 'utf8')) as { version: string }
    expect(MEDIAPIPE_VERSION).toBe(pkg.version)
  })

  it('脸部轮廓、眼睛、嘴唇外圈是完整闭环', () => {
    expectLoopMatches(FACE_OVAL, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL)
    expectLoopMatches(LEFT_EYE, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE)
    expectLoopMatches(RIGHT_EYE, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE)
    const lips = edgeSet(FaceLandmarker.FACE_LANDMARKS_LIPS)
    for (let i = 0; i < LIPS_OUTER.length; i++) {
      const a = LIPS_OUTER[i]!
      const b = LIPS_OUTER[(i + 1) % LIPS_OUTER.length]!
      expect(lips.has(`${a}-${b}`), `${a}-${b}`).toBe(true)
    }
  })

  it('眉毛由 MediaPipe 的两条眉毛连线组成', () => {
    const left = new Set(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW.flatMap(c => [c.start, c.end]))
    const right = new Set(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW.flatMap(c => [c.start, c.end]))
    expect(new Set(LEFT_EYEBROW)).toEqual(left)
    expect(new Set(RIGHT_EYEBROW)).toEqual(right)
  })

  it('所有区域的索引都在 0 ~ 477 之间', () => {
    for (const region of [FACE_OVAL, LEFT_EYE, RIGHT_EYE, LIPS_OUTER, LEFT_EYEBROW, RIGHT_EYEBROW, LEFT_UNDER_EYE, RIGHT_UNDER_EYE, FOREHEAD]) {
      for (const i of region) {
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(478)
      }
    }
  })
})

/** 构造一张假的「脸」：478 个点放在一个椭圆网格上，只用于检查几何函数 */
function fakeLandmarks(): Point[] {
  const points: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
  const set = (i: number, x: number, y: number) => (points[i] = { x, y })
  set(454, 0.7, 0.5) // 左颧骨（画面右侧）
  set(234, 0.3, 0.5) // 右颧骨
  set(1, 0.5, 0.52) // 鼻尖
  set(294, 0.55, 0.56) // 左鼻翼
  set(64, 0.45, 0.56)
  set(291, 0.58, 0.65) // 左嘴角
  set(61, 0.42, 0.65)
  set(263, 0.62, 0.42) // 左外眼角
  set(33, 0.38, 0.42)
  return points
}

describe('几何区域', () => {
  const lm = fakeLandmarks()

  it('toPolygon 转换为像素坐标', () => {
    expect(toPolygon(lm, [454, 234], 1000, 800)).toEqual([{ x: 700, y: 400 }, { x: 300, y: 400 }])
  })

  it('法令纹带位于鼻翼外侧，左右对称', () => {
    const left = nasolabialBand(lm, 'left', 1000, 1000)
    const right = nasolabialBand(lm, 'right', 1000, 1000)
    const lb = boundsOf(left)
    const rb = boundsOf(right)
    expect(lb.x).toBeGreaterThanOrEqual(549) // 不跨过鼻翼到鼻子一侧
    expect(rb.x + rb.width).toBeLessThanOrEqual(451)
    expect(lb.width).toBeCloseTo(rb.width, 6)
    expect(lb.y).toBeCloseTo(rb.y, 6)
  })

  it('鱼尾纹区域在外眼角外侧', () => {
    expect(crowsFeet(lm, 'left', 1000, 1000).center.x).toBeGreaterThan(620)
    expect(crowsFeet(lm, 'right', 1000, 1000).center.x).toBeLessThan(380)
  })
})

import { describe, expect, it } from 'vitest'
import type { Point } from '../app/utils/tools/retouch/regions'
import {
  applyWarp,
  chinControls,
  controlsBounds,
  displacementAt,
  falloff,
  JAW_LEFT,
  JAW_RIGHT,
  slimFaceControls,
} from '../app/utils/tools/retouch/warp'

describe('衰减与位移', () => {
  it('衰减：中心为 1，半径处与半径外为 0，单调递减', () => {
    expect(falloff(0, 10)).toBe(1)
    expect(falloff(10, 10)).toBe(0)
    expect(falloff(15, 10)).toBe(0)
    expect(falloff(3, 10)).toBeGreaterThan(falloff(6, 10))
  })

  it('控制点中心的位移等于推动量，半径外为 0', () => {
    const c = { x: 50, y: 50, dx: 5, dy: -3, radius: 30 }
    expect(displacementAt(50, 50, [c])).toEqual({ x: 5, y: -3 })
    expect(displacementAt(90, 50, [c])).toEqual({ x: 0, y: 0 })
  })

  it('位移不超过半径的 40%，防止画面折叠', () => {
    const d = displacementAt(50, 50, [{ x: 50, y: 50, dx: 100, dy: 0, radius: 20 }])
    expect(d.x).toBeCloseTo(8, 6)
  })

  it('重叠的控制点按权重归一化，不会叠加过头', () => {
    const c = { x: 50, y: 50, dx: 4, dy: 0, radius: 30 }
    expect(displacementAt(50, 50, [c, { ...c }, { ...c }]).x).toBeCloseTo(4, 6)
  })

  it('影响范围裁剪到图片内', () => {
    expect(controlsBounds([{ x: 5, y: 5, dx: 1, dy: 0, radius: 10 }], 100, 100)).toEqual({ x: 0, y: 0, width: 15, height: 15 })
    expect(controlsBounds([], 100, 100)).toBeNull()
  })
})

describe('applyWarp', () => {
  /** 白底上一条竖直的黑线 */
  function lineImage(width: number, height: number, lineX: number) {
    const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let y = 0; y < height; y++) {
      const i = (y * width + lineX) * 4
      rgba[i] = 0
      rgba[i + 1] = 0
      rgba[i + 2] = 0
    }
    return rgba
  }

  it('把黑线向右推，中心处黑线出现在新位置，远处不变', () => {
    const w = 80
    const h = 80
    const src = lineImage(w, h, 40)
    const out = applyWarp(src, w, h, [{ x: 40.5, y: 40.5, dx: 4, dy: 0, radius: 25 }])
    const red = (x: number, y: number) => out[(y * w + x) * 4]!
    expect(red(44, 40)).toBeLessThan(60) // 线被推到 x≈44
    expect(red(40, 40)).toBeGreaterThan(200) // 原位置变白
    expect(red(40, 5)).toBe(0) // 影响范围外的线不动
  })

  it('没有控制点时原样返回副本', () => {
    const src = lineImage(10, 10, 5)
    const out = applyWarp(src, 10, 10, [])
    expect(out).not.toBe(src)
    expect(Array.from(out)).toEqual(Array.from(src))
  })
})

/** 合成一张左右对称的脸的关键点（像素坐标） */
function symmetricFace(): Point[] {
  const points: Point[] = Array.from({ length: 478 }, () => ({ x: 500, y: 500 }))
  points[10] = { x: 500, y: 200 }
  points[152] = { x: 500, y: 800 }
  JAW_RIGHT.forEach((index, k) => (points[index] = { x: 300 + k * 18, y: 450 + k * 40 }))
  JAW_LEFT.forEach((index, k) => (points[index] = { x: 700 - k * 18, y: 450 + k * 40 }))
  return points
}

describe('瘦脸与去双下巴', () => {
  const face = symmetricFace()

  it('力度为 0 时没有控制点', () => {
    expect(slimFaceControls(face, 400, 0)).toEqual([])
    expect(chinControls(face, 400, 0)).toEqual([])
  })

  it('瘦脸：两侧下颌线向中间收，左右对称', () => {
    const controls = slimFaceControls(face, 400, 1)
    const right = controls.slice(0, JAW_RIGHT.length)
    const left = controls.slice(JAW_RIGHT.length)
    for (let k = 0; k < right.length; k++) {
      expect(right[k]!.dx).toBeGreaterThan(0)
      expect(left[k]!.dx).toBeLessThan(0)
      expect(right[k]!.dx).toBeCloseTo(-left[k]!.dx, 6)
      expect(right[k]!.dy).toBe(0)
    }
  })

  it('瘦脸后的位移场左右对称', () => {
    const controls = slimFaceControls(face, 400, 0.8)
    const a = displacementAt(380, 600, controls)
    const b = displacementAt(620, 600, controls)
    expect(a.x).toBeCloseTo(-b.x, 6)
    expect(a.y).toBeCloseTo(b.y, 6)
  })

  it('去双下巴：下巴下方向上推', () => {
    const controls = chinControls(face, 400, 1)
    expect(controls[0]!.y).toBeGreaterThan(800)
    expect(controls.every(c => c.dy < 0)).toBe(true)
    expect(displacementAt(500, 852, controls).y).toBeLessThan(0)
  })
})

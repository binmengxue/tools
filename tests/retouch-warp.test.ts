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
  LOWER_JAW,
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
    // 线被推到 x≈44（网格插值会带来亚像素偏差，取这一行最暗的位置判断）
    let darkest = 0
    for (let x = 0; x < w; x++) if (red(x, 40) < red(darkest, 40)) darkest = x
    expect(Math.abs(darkest - 44)).toBeLessThanOrEqual(1)
    expect(red(darkest, 40)).toBeLessThan(128)
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

  it('去双下巴：控制点在下颌线外侧，向下颌线方向收（向上），左右对称', () => {
    const controls = chinControls(face, 400, 1)
    expect(controls).toHaveLength(LOWER_JAW.length)
    // 下巴尖（152）对应的控制点在下巴下方，向上推
    const chin = controls[LOWER_JAW.indexOf(152)]!
    expect(chin.y).toBeGreaterThan(800)
    expect(chin.dy).toBeLessThan(0)
    expect(controls.every(c => c.dy < 0)).toBe(true)
    // 下巴正下方的位移向上
    expect(displacementAt(500, 830, controls).y).toBeLessThan(-5)
    // 左右对称
    const a = displacementAt(440, 820, controls)
    const b = displacementAt(560, 820, controls)
    expect(a.x).toBeCloseTo(-b.x, 6)
    expect(a.y).toBeCloseTo(b.y, 6)
  })
})

describe('背后加长的影响范围（分散拉伸）', () => {
  const c = { x: 100, y: 100, dx: 0, dy: -20, radius: 40, backRadius: 120 }

  it('推动方向前方仍按 radius 衰减，背后影响得更远', async () => {
    const { weightAt } = await import('../app/utils/tools/retouch/warp')
    expect(weightAt(100, 60, c)).toBe(0) // 前方 40 处为 0
    expect(weightAt(100, 150, c)).toBeGreaterThan(0) // 背后 50 处仍有影响
    expect(weightAt(100, 220, c)).toBe(0) // 背后 120 处为 0
    expect(weightAt(150, 100, c)).toBe(0) // 侧面仍按 radius
  })

  it('前后交界处连续', async () => {
    const { weightAt } = await import('../app/utils/tools/retouch/warp')
    expect(weightAt(120, 100.001, c)).toBeCloseTo(weightAt(120, 99.999, c), 4)
  })

  it('背后的拉伸被分散：沿推动方向的位移变化率明显变小', () => {
    const withBack = [c]
    const without = [{ ...c, backRadius: undefined }]
    const maxStretch = (controls: typeof withBack) => {
      let worst = 0
      // 位移从中心的 -20 逐渐回到 0，相邻两行的差值就是局部拉伸量
      for (let y = 101; y < 230; y++) worst = Math.max(worst, displacementAt(100, y + 1, controls).y - displacementAt(100, y, controls).y)
      return worst
    }
    expect(maxStretch(withBack)).toBeLessThan(maxStretch(without) * 0.5)
  })

  it('影响范围包含背后的距离', () => {
    expect(controlsBounds([c], 1000, 1000)).toEqual({ x: 0, y: 0, width: 220, height: 220 })
  })
})

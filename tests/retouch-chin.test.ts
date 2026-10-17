import { describe, expect, it } from 'vitest'
import {
  AUTO_CHIN_WEIGHTS,
  autoChinLift,
  chinLiftAt,
  jawFrame,
  liftFromStroke,
  liftProfile,
  locateOnJaw,
  softenUnderChin,
} from '../app/utils/tools/retouch/chin'
import { finishRender, ZERO_PARAMS } from '../app/utils/tools/retouch/engine'
import type { FacePrep } from '../app/utils/tools/retouch/engine'
import { chinOp } from '../app/utils/tools/retouch/manual'
import type { Point } from '../app/utils/tools/retouch/regions'
import { LOWER_JAW } from '../app/utils/tools/retouch/warp'

const FW = 400

/** 合成关键点：下颌线是以 (500, 600) 为圆心、半径 200 的下半圆，下巴尖在 (500, 800) */
function face(): Point[] {
  const points: Point[] = Array.from({ length: 478 }, () => ({ x: 500, y: 500 }))
  points[10] = { x: 500, y: 250 }
  points[1] = { x: 500, y: 600 } // 鼻尖（这里取下颌圆弧的圆心）
  LOWER_JAW.forEach((index, k) => {
    const phi = (Math.PI * k) / (LOWER_JAW.length - 1)
    points[index] = { x: 500 - 200 * Math.cos(phi), y: 600 + 200 * Math.sin(phi) }
  })
  points[152] = { x: 500, y: 800 }
  return points
}

const frame = jawFrame(face())
const lift = autoChinLift(FW, 1)

describe('下颌线定位', () => {
  it('脸内侧距离为 0，外侧为到下颌线的距离', () => {
    expect(locateOnJaw(500, 700, frame).s).toBe(0)
    const below = locateOnJaw(500, 850, frame)
    expect(below.s).toBeGreaterThan(45)
    expect(below.s).toBeLessThan(62)
    expect(below.uy).toBeLessThan(-0.99) // 指向下颌线（向上）
    expect(below.t).toBeCloseTo(6, 1)
  })
})

describe('提拉位移场', () => {
  it('位移大小：下颌线处为 0，峰值为 shift，reach 外为 0', () => {
    expect(liftProfile(0, lift)).toBe(0)
    expect(liftProfile(lift.peak, lift)).toBeCloseTo(lift.shift, 6)
    expect(liftProfile(lift.reach, lift)).toBe(0)
    expect(lift.shift).toBeGreaterThan(0)
    expect(lift.shift).toBeLessThanOrEqual(0.5 * (lift.reach - lift.peak))
  })

  it('脸内部不动，下巴正下方朝下颌线（向上）收', () => {
    expect(chinLiftAt(500, 700, frame, lift)).toEqual({ x: 0, y: 0 })
    const d = chinLiftAt(500, 800 + lift.peak, frame, lift)
    expect(d.y).toBeLessThan(-lift.shift * 0.8)
    expect(Math.abs(d.x)).toBeLessThan(1e-6)
    expect(chinLiftAt(500, 800 + lift.reach + 20, frame, lift)).toEqual({ x: 0, y: 0 })
  })

  it('左右对称', () => {
    const a = chinLiftAt(440, 850, frame, lift)
    const b = chinLiftAt(560, 850, frame, lift)
    expect(a.x).toBeCloseTo(-b.x, 6)
    expect(a.y).toBeCloseTo(b.y, 6)
    expect(a.x).toBeGreaterThan(0) // 两侧斜向内收
  })

  it('两侧下颌角处权重为 0', () => {
    expect(AUTO_CHIN_WEIGHTS[0]).toBe(0)
    expect(chinLiftAt(250, 600, frame, lift)).toEqual({ x: 0, y: 0 })
  })

  it('沿法线的取样位置单调递增，不会折叠', () => {
    let prev = -Infinity
    for (let y = 780; y < 800 + lift.reach + 10; y += 0.5) {
      const sampled = y - chinLiftAt(500, y, frame, lift).y
      expect(sampled).toBeGreaterThan(prev)
      prev = sampled
    }
  })

  it('峰值以上的窄带显示的是原图更远处的内容（双下巴被压进下颌线）', () => {
    const y = 800 + lift.peak
    expect(y - chinLiftAt(500, y, frame, lift).y).toBeGreaterThan(800 + lift.peak * 1.8)
  })
})

describe('淡化下巴下方褶皱', () => {
  const W = 1000
  const H = 1000
  const SKIN = [220, 170, 140]
  const BAND = [165, 128, 105]
  const HAIR = [40, 35, 30]

  function scene() {
    const rgba = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        const color = y >= 830 && y < 850 && x > 380 && x < 620 ? BAND : SKIN
        rgba.set(color, i)
        rgba[i + 3] = 255
      }
    }
    // 一根竖直的发丝穿过暗带
    for (let y = 760; y < 940; y++) rgba.set(HAIR, (y * W + 540) * 4)
    return rgba
  }
  const red = (rgba: Uint8ClampedArray, x: number, y: number) => rgba[(y * W + x) * 4]!

  it('暗带与周围的差明显变小', () => {
    const src = scene()
    const out = src.slice()
    softenUnderChin(out, W, H, frame, lift, FW, 1)
    const before = red(src, 500, 900) - red(src, 500, 840)
    const after = red(out, 500, 900) - red(out, 500, 840)
    expect(after).toBeLessThan(before * 0.7)
  })

  it('发丝与相邻皮肤的对比基本不变', () => {
    const src = scene()
    const out = src.slice()
    softenUnderChin(out, W, H, frame, lift, FW, 1)
    const before = red(src, 548, 840) - red(src, 540, 840)
    const after = red(out, 548, 840) - red(out, 540, 840)
    expect(Math.abs(after - before)).toBeLessThan(8)
  })

  it('脸内部和远处不变', () => {
    const src = scene()
    const out = src.slice()
    softenUnderChin(out, W, H, frame, lift, FW, 1)
    expect(red(out, 500, 700)).toBe(red(src, 500, 700))
    expect(red(out, 20, 20)).toBe(red(src, 20, 20))
  })
})

describe('收下巴画笔', () => {
  it('只涂左半边时，右侧没有力度', () => {
    // 图片左侧（k 较小的一侧）的下颌线下方
    const points = [{ x: 330, y: 760 }, { x: 370, y: 800 }]
    const result = liftFromStroke(points, 30, frame, FW)!
    expect(result).not.toBeNull()
    expect(result.weights.slice(9).every(v => v === 0)).toBe(true)
    expect(Math.max(...result.weights.slice(1, 6))).toBe(1)
  })

  it('涂在脸内侧（离下颌线较远）时不产生操作', () => {
    expect(liftFromStroke([{ x: 500, y: 600 }], 20, frame, FW)).toBeNull()
    expect(chinOp(1, { points: [{ x: 500, y: 600 }], radius: 20 }, [{ points: face(), faceWidth: FW }])).toBeNull()
  })

  it('选下颌线离笔画最近的那张脸', () => {
    const other = face().map(p => ({ x: p.x + 2000, y: p.y }))
    const op = chinOp(1, { points: [{ x: 500, y: 840 }], radius: 30 }, [{ points: other, faceWidth: FW }, { points: face(), faceWidth: FW }])
    expect(op).toMatchObject({ kind: 'chin', face: 1 })
  })

  it('渲染：涂抹处被提拉，没有操作时不变', () => {
    const W = 1000
    const H = 1000
    const src = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4
        // 横向条纹：便于看出竖直方向的移动
        const v = Math.floor(y / 10) % 2 ? 230 : 120
        src.set([v, v * 0.78, v * 0.64, 255], i)
      }
    }
    const prep = { points: face(), faceWidth: FW } as FacePrep
    const op = chinOp(1, { points: [{ x: 480, y: 840 }, { x: 520, y: 840 }], radius: 40 }, [prep])!
    const plain = finishRender(src, src, W, H, [prep], ZERO_PARAMS, [])
    const lifted = finishRender(src, src, W, H, [prep], ZERO_PARAMS, [op])
    expect(Array.from(plain.subarray(0, 4000))).toEqual(Array.from(src.subarray(0, 4000)))
    let changed = 0
    for (let y = 810; y < 900; y++) if (lifted[(y * W + 500) * 4] !== src[(y * W + 500) * 4]) changed++
    expect(changed).toBeGreaterThan(20)
    // 脸内部不动
    expect(lifted[(700 * W + 500) * 4]).toBe(src[(700 * W + 500) * 4])
  })
})

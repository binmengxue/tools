import { describe, expect, it } from 'vitest'
import { detectSpots, healMask, spotsToMask } from '../app/utils/tools/retouch/blemish'
import { guidedFilter, liftShadows, skinProbability, smoothSkin } from '../app/utils/tools/retouch/filters'
import {
  boxBlur,
  expandRect,
  extractPlanes,
  feather,
  fillCircle,
  fillPolygon,
  gaussianBlur,
  writePlanes,
} from '../app/utils/tools/retouch/raster'
import type { Planes } from '../app/utils/tools/retouch/raster'

const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0)

/** 纯色局部图像 */
function solid(width: number, height: number, value: number): Planes {
  const make = () => new Float32Array(width * height).fill(value)
  return { width, height, r: make(), g: make(), b: make() }
}

describe('填充', () => {
  it('矩形多边形覆盖的像素数正确', () => {
    const mask = new Float32Array(10 * 10)
    fillPolygon(mask, 10, 10, [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 5 }, { x: 2, y: 5 }])
    expect(sum(mask)).toBe(4 * 3)
    expect(mask[2 * 10 + 2]).toBe(1)
    expect(mask[5 * 10 + 6]).toBe(0)
  })

  it('subtract 模式挖掉一块，不会小于 0', () => {
    const mask = new Float32Array(10 * 10).fill(1)
    fillPolygon(mask, 10, 10, [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 10 }], 1, 'subtract')
    fillPolygon(mask, 10, 10, [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 0, y: 10 }], 1, 'subtract')
    expect(sum(mask)).toBe(50)
    expect(Math.min(...mask)).toBe(0)
  })

  it('offset 用于局部坐标', () => {
    const mask = new Float32Array(4 * 4)
    fillPolygon(mask, 4, 4, [{ x: 100, y: 100 }, { x: 102, y: 100 }, { x: 102, y: 102 }, { x: 100, y: 102 }], 1, 'max', { x: 100, y: 100 })
    expect(sum(mask)).toBe(4)
  })

  it('超出边界的部分被裁掉', () => {
    const mask = new Float32Array(5 * 5)
    fillPolygon(mask, 5, 5, [{ x: -10, y: -10 }, { x: 20, y: -10 }, { x: 20, y: 20 }, { x: -10, y: 20 }])
    expect(sum(mask)).toBe(25)
  })

  it('圆形：硬边面积接近 πr²，软边中心为 1 且向外衰减', () => {
    const mask = new Float32Array(100 * 100)
    fillCircle(mask, 100, 100, 50, 50, 20)
    expect(sum(mask)).toBeGreaterThan(Math.PI * 400 * 0.97)
    expect(sum(mask)).toBeLessThan(Math.PI * 400 * 1.03)
    const soft = new Float32Array(100 * 100)
    fillCircle(soft, 100, 100, 50, 50, 20, 1, 'max', 0.5)
    expect(soft[50 * 100 + 50]).toBe(1)
    expect(soft[50 * 100 + 68]!).toBeLessThan(0.3)
  })
})

describe('模糊', () => {
  it('盒式模糊保持总量（内部）且常数不变', () => {
    const flat = new Float32Array(20 * 20).fill(7)
    expect(Math.max(...boxBlur(flat, 20, 20, 3).map(v => Math.abs(v - 7)))).toBeLessThan(1e-5)
  })

  it('单点模糊后扩散成对称的块', () => {
    const src = new Float32Array(21 * 21)
    src[10 * 21 + 10] = 49
    const out = boxBlur(src, 21, 21, 3)
    expect(out[10 * 21 + 10]).toBeCloseTo(1, 5)
    expect(out[10 * 21 + 13]).toBeCloseTo(1, 5)
    expect(out[10 * 21 + 14]).toBe(0)
    expect(sum(out)).toBeCloseTo(49, 3)
  })

  it('高斯模糊的方差接近 sigma²', () => {
    const n = 81
    const src = new Float32Array(n)
    src[40] = 1
    // 一维检查：把图像看成 81 × 1
    const out = gaussianBlur(src, n, 1, 4)
    let variance = 0
    for (let i = 0; i < n; i++) variance += out[i]! * (i - 40) ** 2
    expect(variance).toBeGreaterThan(14)
    expect(variance).toBeLessThan(22)
  })

  it('羽化后的遮罩仍在 0 ~ 1', () => {
    const mask = new Float32Array(30 * 30)
    fillCircle(mask, 30, 30, 15, 15, 8)
    const f = feather(mask, 30, 30, 3)
    expect(Math.min(...f)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...f)).toBeLessThanOrEqual(1 + 1e-6)
  })
})

describe('局部区域读写', () => {
  it('expandRect 外扩并裁剪', () => {
    expect(expandRect({ x: 5, y: 5, width: 10, height: 10 }, 10, 20, 30)).toEqual({ x: 0, y: 0, width: 20, height: 25 })
  })

  it('extractPlanes / writePlanes 往返一致，透明度不变', () => {
    const rgba = new Uint8ClampedArray(4 * 3 * 4)
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 7) % 256
    const rect = { x: 1, y: 1, width: 2, height: 2 }
    const planes = extractPlanes(rgba, 4, rect)
    const copy = rgba.slice()
    writePlanes(copy, 4, rect, planes)
    expect(Array.from(copy)).toEqual(Array.from(rgba))
  })
})

describe('滤镜', () => {
  it('引导滤波：平坦区域的噪声被抹平，强边缘保留', () => {
    const w = 40
    const h = 20
    const src = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) src[y * w + x] = (x < 20 ? 60 : 200) + ((x * 7 + y * 13) % 5) * 3 - 6
    }
    const out = guidedFilter(src, w, h, 3, 100)
    // 噪声变小
    const noise = (a: Float32Array) => {
      let s = 0
      for (let y = 2; y < h - 2; y++) for (let x = 3; x < 15; x++) s += Math.abs(a[y * w + x]! - a[y * w + x + 1]!)
      return s
    }
    expect(noise(out)).toBeLessThan(noise(src) * 0.5)
    // 边缘两侧仍差距明显
    expect(out[10 * w + 22]! - out[10 * w + 17]!).toBeGreaterThan(120)
  })

  it('肤色概率：典型肤色高，绿色、蓝色为 0', () => {
    expect(skinProbability(224, 172, 140)).toBe(1)
    expect(skinProbability(40, 180, 60)).toBe(0)
    expect(skinProbability(60, 90, 200)).toBe(0)
  })

  it('磨皮只影响遮罩内，力度为 0 时不变', () => {
    const p = solid(20, 20, 150)
    p.r[5 * 20 + 5] = 100
    p.r[15 * 20 + 15] = 100
    const mask = new Float32Array(400)
    fillPolygon(mask, 20, 20, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])
    const untouched = { ...p, r: p.r.slice(), g: p.g.slice(), b: p.b.slice() }
    smoothSkin(untouched, mask, { amount: 0, radius: 3, eps: 400, texture: 0 })
    expect(untouched.r[5 * 20 + 5]).toBe(100)
    smoothSkin(p, mask, { amount: 1, radius: 3, eps: 4000, texture: 0 })
    expect(p.r[5 * 20 + 5]!).toBeGreaterThan(130) // 遮罩内的暗点被平滑
    expect(p.r[15 * 20 + 15]).toBe(100) // 遮罩外不变
  })

  it('提亮暗线只提亮不压暗', () => {
    const p = solid(30, 30, 150)
    for (let x = 0; x < 30; x++) p.g[15 * 30 + x] = 110
    const before = p.g.slice()
    liftShadows(p, new Float32Array(900).fill(1), 1, 3)
    expect(p.g[15 * 30 + 15]!).toBeGreaterThan(130)
    for (let i = 0; i < 900; i++) expect(p.g[i]!).toBeGreaterThanOrEqual(before[i]! - 1e-4)
  })
})

describe('斑点', () => {
  /** 160 × 160 的皮肤色块，放几个大小不同的暗点 */
  function spotted() {
    const w = 160
    const lum = new Float32Array(w * w).fill(180)
    const dot = (cx: number, cy: number, r: number, depth: number) => {
      for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - cx, y - cy) <= r) lum[y * w + x] = 180 - depth
    }
    dot(40, 40, 2, 40) // 小斑点
    dot(110, 40, 4, 35) // 中等斑点
    dot(40, 110, 20, 40) // 太大（像阴影），应忽略
    dot(110, 110, 3, 5) // 太浅，应忽略
    for (let x = 60; x < 100; x++) lum[140 * w + x] = 130 // 细长的线（皱纹 / 发丝），应忽略
    return { w, lum, skin: new Float32Array(w * w).fill(1) }
  }

  const options = { threshold: 15, sigma: 8, minArea: 3, maxArea: 120, minSkin: 0.5 }

  it('找到大小合适且足够深的暗点', () => {
    const { w, lum, skin } = spotted()
    const spots = detectSpots(lum, skin, w, w, options)
    expect(spots).toHaveLength(2)
    const near = (x: number, y: number) => spots.some(s => Math.hypot(s.x - x, s.y - y) < 2)
    expect(near(40.5, 40.5)).toBe(true)
    expect(near(110.5, 40.5)).toBe(true)
  })

  it('皮肤遮罩外的斑点不检测', () => {
    const { w, lum } = spotted()
    expect(detectSpots(lum, new Float32Array(w * w), w, w, options)).toEqual([])
  })

  it('修补后斑点接近周围颜色，远处像素不变', () => {
    const w = 60
    const p = solid(w, w, 180)
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 30, y - 30) <= 3) p.r[y * w + x] = 120
    const mask = spotsToMask([{ x: 30.5, y: 30.5, radius: 3, area: 28 }], w, w)
    healMask(p, mask, 4)
    expect(Math.abs(p.r[30 * w + 30]! - 180)).toBeLessThan(6)
    expect(p.r[2 * w + 2]).toBe(180)
  })
})

describe('加速版本', () => {
  it('快速引导滤波与原版结果接近', async () => {
    const { fastGuidedFilter } = await import('../app/utils/tools/retouch/filters')
    const w = 120
    const h = 90
    const src = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) src[y * w + x] = 150 + 40 * Math.sin(x / 9) + ((x * 7 + y * 13) % 9) - 4
    const exact = guidedFilter(src, w, h, 8, 400)
    const fast = fastGuidedFilter(src, w, h, 8, 400, 2)
    let diff = 0
    for (let i = 0; i < src.length; i++) diff += Math.abs(exact[i]! - fast[i]!)
    expect(diff / src.length).toBeLessThan(2)
  })

  it('逐个修补斑点：斑点被修补，远处不变', async () => {
    const { healSpots } = await import('../app/utils/tools/retouch/blemish')
    const w = 80
    const p = solid(w, w, 180)
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 20, y - 20) <= 3 || Math.hypot(x - 60, y - 50) <= 3) p.r[y * w + x] = 110
    healSpots(p, [{ x: 20.5, y: 20.5, radius: 3, area: 28 }, { x: 60.5, y: 50.5, radius: 3, area: 28 }], 4)
    expect(Math.abs(p.r[20 * w + 20]! - 180)).toBeLessThan(8)
    expect(Math.abs(p.r[50 * w + 60]! - 180)).toBeLessThan(8)
    expect(p.r[78 * w + 2]).toBe(180)
  })
})

import { describe, expect, it } from 'vitest'
import { prepareFace, renderRetouch, ZERO_PARAMS } from '../app/utils/tools/retouch/engine'
import { FACE_OVAL, KEY } from '../app/utils/tools/retouch/regions'
import type { Point } from '../app/utils/tools/retouch/regions'

const W = 200
const H = 240

/** 合成一张「脸」：轮廓点在椭圆上，其余关键点集中在中心（眼、眉、唇退化成一个点，不挖洞） */
function fakeFace(): Point[] {
  const cx = 0.5
  const cy = 0.45
  const points: Point[] = Array.from({ length: 478 }, () => ({ x: cx, y: cy }))
  FACE_OVAL.forEach((index, k) => {
    const angle = -Math.PI / 2 + (k / FACE_OVAL.length) * Math.PI * 2
    points[index] = { x: cx + 0.25 * Math.cos(angle), y: cy + 0.28 * Math.sin(angle) }
  })
  points[KEY.cheekLeft] = { x: 0.75, y: cy }
  points[KEY.cheekRight] = { x: 0.25, y: cy }
  return points
}

/** 带噪声的肤色图片 */
function skinImage(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    const noise = ((i * 2654435761) >>> 0) % 21 - 10
    rgba[i * 4] = 220 + noise
    rgba[i * 4 + 1] = 170 + noise
    rgba[i * 4 + 2] = 140 + noise
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

/** 一块区域内相邻像素差的总和（衡量噪声 / 粗糙程度） */
function roughness(rgba: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number): number {
  let s = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) s += Math.abs(rgba[(y * W + x) * 4]! - rgba[(y * W + x + 1) * 4]!)
  }
  return s
}

describe('prepareFace', () => {
  it('处理区域在图片内，并包住整张脸', () => {
    const prep = prepareFace(skinImage(), W, H, fakeFace())
    expect(prep.rect.x).toBeGreaterThanOrEqual(0)
    expect(prep.rect.y).toBeGreaterThanOrEqual(0)
    expect(prep.rect.x + prep.rect.width).toBeLessThanOrEqual(W)
    expect(prep.rect.y + prep.rect.height).toBeLessThanOrEqual(H)
    expect(prep.faceWidth).toBeCloseTo(100, 0)
  })

  it('肤色图片：脸中心的皮肤遮罩接近 1，脸外为 0', () => {
    const prep = prepareFace(skinImage(), W, H, fakeFace())
    const at = (x: number, y: number) => prep.skin[(y - prep.rect.y) * prep.rect.width + (x - prep.rect.x)]!
    expect(at(100, 90)).toBeGreaterThan(0.9)
    expect(at(prep.rect.x + 1, prep.rect.y + 1)).toBeLessThan(0.05)
  })

  it('非肤色（绿色）图片：皮肤遮罩明显降低', () => {
    const green = skinImage()
    for (let i = 0; i < W * H; i++) {
      green[i * 4] = 40
      green[i * 4 + 1] = 180
      green[i * 4 + 2] = 60
    }
    const prep = prepareFace(green, W, H, fakeFace())
    const center = prep.skin[(90 - prep.rect.y) * prep.rect.width + (100 - prep.rect.x)]!
    expect(center).toBeLessThan(0.4)
  })
})

describe('renderRetouch', () => {
  it('参数全为 0 时与原图一致', () => {
    const base = skinImage()
    const prep = prepareFace(base, W, H, fakeFace())
    const { rgba, spots } = renderRetouch(base, W, H, [prep], ZERO_PARAMS)
    expect(Array.from(rgba)).toEqual(Array.from(base))
    expect(spots).toBe(0)
  })

  it('磨皮让脸部更平滑，脸外像素不变，原图数据不被修改', () => {
    const base = skinImage()
    const before = base.slice()
    const prep = prepareFace(base, W, H, fakeFace())
    const { rgba } = renderRetouch(base, W, H, [prep], { ...ZERO_PARAMS, smooth: 80 })
    expect(roughness(rgba, 80, 70, 120, 110)).toBeLessThan(roughness(base, 80, 70, 120, 110) * 0.6)
    expect(rgba[(2 * W + 2) * 4]).toBe(base[(2 * W + 2) * 4])
    expect(Array.from(base)).toEqual(Array.from(before))
  })

  it('祛斑会修补脸上的暗点', () => {
    const base = skinImage()
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // 脸宽 100 px 时斑点面积上限约 20 px²（半径 2.5），这里用半径 1.5 的小斑点
        if (Math.hypot(x - 100, y - 100) <= 1.5) {
          const i = (y * W + x) * 4
          base[i] = 150
          base[i + 1] = 100
          base[i + 2] = 80
        }
      }
    }
    const prep = prepareFace(base, W, H, fakeFace())
    const { rgba, spots } = renderRetouch(base, W, H, [prep], { ...ZERO_PARAMS, blemish: 80 })
    expect(spots).toBeGreaterThanOrEqual(1)
    expect(rgba[(100 * W + 100) * 4]!).toBeGreaterThan(200)
  })
})

describe('瘦脸与去双下巴', () => {
  it('瘦脸会改变脸部边缘附近的像素，远处不变', () => {
    // 白色背景上画一张肤色椭圆脸，瘦脸后边缘处的像素会变化
    const base = new Uint8ClampedArray(W * H * 4).fill(255)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (((x - 100) / 50) ** 2 + ((y - 108) / 67) ** 2 <= 1) {
          const i = (y * W + x) * 4
          base[i] = 220
          base[i + 1] = 170
          base[i + 2] = 140
        }
      }
    }
    const prep = prepareFace(base, W, H, fakeFace())
    const { rgba } = renderRetouch(base, W, H, [prep], { ...ZERO_PARAMS, slim: 100 })
    let changed = 0
    for (let i = 0; i < base.length; i += 4) if (rgba[i] !== base[i]) changed++
    expect(changed).toBeGreaterThan(50)
    expect(rgba[(2 * W + 2) * 4]).toBe(255)
  })
})

import { describe, expect, it } from 'vitest'
import { inpaint } from '../app/utils/tools/retouch/inpaint'

function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y)
      const i = (y * width + x) * 4
      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = 255
    }
  }
  return rgba
}

function holeRect(width: number, height: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const hole = new Uint8Array(width * height)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hole[y * width + x] = 1
  return hole
}

describe('inpaint 消除', () => {
  it('纯色背景上的杂物被背景色填平', () => {
    const w = 64
    const h = 64
    const src = image(w, h, (x, y) => (x >= 28 && x < 36 && y >= 28 && y < 36 ? [10, 10, 10] : [90, 160, 210]))
    const hole = holeRect(w, h, 26, 26, 38, 38)
    const out = inpaint(src, w, h, hole, { seed: 7 })
    for (let y = 26; y < 38; y++) {
      for (let x = 26; x < 38; x++) {
        const i = (y * w + x) * 4
        expect(Math.abs(out[i]! - 90)).toBeLessThan(2)
        expect(Math.abs(out[i + 2]! - 210)).toBeLessThan(2)
      }
    }
  })

  it('洞外的像素保持不变，透明度不变', () => {
    const w = 48
    const h = 48
    const src = image(w, h, (x, y) => [(x * 5) % 256, (y * 5) % 256, 128])
    const hole = holeRect(w, h, 18, 18, 30, 30)
    const out = inpaint(src, w, h, hole, { seed: 3 })
    for (let i = 0; i < w * h; i++) {
      if (hole[i]) continue
      for (let c = 0; c < 4; c++) expect(out[i * 4 + c]).toBe(src[i * 4 + c])
    }
    for (let i = 0; i < w * h; i++) expect(out[i * 4 + 3]).toBe(255)
  })

  it('竖条纹背景：填补结果延续条纹（各列的颜色与条纹一致）', () => {
    const w = 80
    const h = 80
    // 4 像素宽的黑白竖条纹
    const stripe = (x: number): [number, number, number] => (Math.floor(x / 4) % 2 ? [240, 240, 240] : [20, 20, 20])
    const src = image(w, h, x => stripe(x))
    const hole = holeRect(w, h, 32, 30, 48, 50)
    const out = inpaint(src, w, h, hole, { seed: 11 })
    let correct = 0
    let total = 0
    for (let y = 30; y < 50; y++) {
      for (let x = 32; x < 48; x++) {
        const v = out[(y * w + x) * 4]!
        const expected = stripe(x)[0]
        if (Math.abs(v - expected) < 60) correct++
        total++
      }
    }
    expect(correct / total).toBeGreaterThan(0.85)
  })

  it('同样的种子结果相同', () => {
    const w = 40
    const h = 40
    const src = image(w, h, (x, y) => [(x * 13 + y * 7) % 256, (x * 3) % 256, (y * 11) % 256])
    const hole = holeRect(w, h, 15, 15, 25, 25)
    expect(Array.from(inpaint(src, w, h, hole, { seed: 5 }))).toEqual(Array.from(inpaint(src, w, h, hole, { seed: 5 })))
  })

  it('没有洞或全是洞时原样返回', () => {
    const src = image(10, 10, () => [1, 2, 3])
    expect(Array.from(inpaint(src, 10, 10, new Uint8Array(100)))).toEqual(Array.from(src))
    expect(Array.from(inpaint(src, 10, 10, new Uint8Array(100).fill(1)))).toEqual(Array.from(src))
  })
})

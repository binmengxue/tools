import { describe, expect, it } from 'vitest'
import { active, canRedo, canUndo, createHistory, push, redo, replaceLast, undo } from '../app/utils/tools/retouch/history'
import { pushControls, strokeBounds, strokeDabs, strokeMask } from '../app/utils/tools/retouch/strokes'
import { applyWarp, applyWarpSequence } from '../app/utils/tools/retouch/warp'

describe('撤销 / 重做', () => {
  it('追加、撤销、重做', () => {
    let h = createHistory<string>()
    expect(canUndo(h)).toBe(false)
    h = push(h, 'a')
    h = push(h, 'b')
    expect(active(h)).toEqual(['a', 'b'])
    h = undo(h)
    expect(active(h)).toEqual(['a'])
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(active(h)).toEqual(['a', 'b'])
    expect(canRedo(h)).toBe(false)
  })

  it('撤销后再追加会丢弃被撤销的操作', () => {
    let h = createHistory<number>()
    h = push(push(push(h, 1), 2), 3)
    h = undo(undo(h))
    h = push(h, 9)
    expect(h.items).toEqual([1, 9])
    expect(canRedo(h)).toBe(false)
  })

  it('撤销到底、重做到头时不会越界', () => {
    let h = push(createHistory<number>(), 1)
    h = undo(undo(h))
    expect(h.index).toBe(0)
    h = redo(redo(redo(h)))
    expect(h.index).toBe(1)
  })

  it('replaceLast 更新最后一笔', () => {
    let h = push(createHistory<number>(), 1)
    h = replaceLast(h, 2)
    expect(active(h)).toEqual([2])
    expect(active(replaceLast(createHistory<number>(), 5))).toEqual([5])
  })
})

describe('笔画', () => {
  const stroke = { points: [{ x: 10, y: 10 }, { x: 50, y: 10 }], radius: 8 }

  it('外接矩形包含半径并裁剪到图片内', () => {
    expect(strokeBounds(stroke, 100, 100)).toEqual({ x: 2, y: 2, width: 56, height: 16 })
    expect(strokeBounds(stroke, 30, 30)).toEqual({ x: 2, y: 2, width: 28, height: 16 })
  })

  it('沿路径插值，相邻圆心不超过半径的 1/4', () => {
    const dabs = strokeDabs(stroke)
    expect(dabs[0]).toEqual({ x: 10, y: 10 })
    expect(dabs[dabs.length - 1]).toEqual({ x: 50, y: 10 })
    for (let i = 1; i < dabs.length; i++) expect(dabs[i]!.x - dabs[i - 1]!.x).toBeLessThanOrEqual(2 + 1e-9)
  })

  it('单点笔画也有一个圆', () => {
    expect(strokeDabs({ points: [{ x: 3, y: 4 }], radius: 5 })).toEqual([{ x: 3, y: 4 }])
  })

  it('遮罩覆盖笔画路径，路径外为 0', () => {
    // 外扩 5 像素，才能取到笔画半径（8）以外的像素
    const rect = strokeBounds(stroke, 100, 100, 5)
    const mask = strokeMask(stroke, rect)
    const at = (x: number, y: number) => mask[(y - rect.y) * rect.width + (x - rect.x)]!
    expect(at(30, 10)).toBe(1)
    expect(at(30, 2)).toBeGreaterThan(0) // 距离 7.5，在柔和边缘内
    expect(at(30, 0)).toBe(0) // 距离 9.5，在半径外
  })

  it('推拉：拆成小步，总推动量等于路径长度 × 力度', () => {
    const controls = pushControls({ points: [{ x: 0, y: 0 }, { x: 30, y: 0 }], radius: 20 }, 0.5)
    expect(controls.every(c => Math.hypot(c.dx, c.dy) <= 20 * 0.15 + 1e-9)).toBe(true)
    expect(controls.reduce((s, c) => s + c.dx, 0)).toBeCloseTo(15, 6)
  })
})

describe('连续推动', () => {
  it('单个控制点时与 applyWarp 结果几乎一致（applyWarp 用网格插值，误差很小）', () => {
    const w = 60
    const h = 60
    const src = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < src.length; i++) src[i] = (i * 37) % 256
    const control = { x: 30, y: 30, dx: 3, dy: -2, radius: 15 }
    const inPlace = src.slice()
    applyWarpSequence(inPlace, w, h, [control])
    const grid = applyWarp(src, w, h, [control])
    // 测试图是逐像素剧烈变化的伪随机纹理，插值误差会被放大；只要求整体接近
    let sumDiff = 0
    for (let i = 0; i < src.length; i++) sumDiff += Math.abs(inPlace[i]! - grid[i]!)
    expect(sumDiff / src.length).toBeLessThan(3)
  })

  it('多步推动后，内容沿路径移动', () => {
    const w = 80
    const h = 40
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255)
    for (let y = 0; y < h; y++) for (let x = 18; x < 22; x++) rgba[(y * w + x) * 4] = 0
    applyWarpSequence(rgba, w, h, pushControls({ points: [{ x: 20, y: 20 }, { x: 32, y: 20 }], radius: 18 }, 1))
    // 中间行的黑色向右移动了
    let darkest = 0
    let minValue = 256
    for (let x = 0; x < w; x++) {
      const v = rgba[(20 * w + x) * 4]!
      if (v < minValue) {
        minValue = v
        darkest = x
      }
    }
    expect(darkest).toBeGreaterThan(24)
  })
})

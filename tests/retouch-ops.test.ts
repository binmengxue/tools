import { describe, expect, it } from 'vitest'
import { renderRetouch, ZERO_PARAMS } from '../app/utils/tools/retouch/engine'
import { applyMaskOps, applyPatches, cropRgba, erasePatch, healPatch, pasteRgba, pushOp } from '../app/utils/tools/retouch/manual'
import type { ManualOp } from '../app/utils/tools/retouch/manual'

const W = 120
const H = 100

/** 浅色背景 + 中间一个深色小方块（要修复 / 消除的「杂物」） */
function scene(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const dark = x >= 56 && x < 64 && y >= 46 && y < 54
      rgba[i] = dark ? 30 : 200 + ((x + y) % 3)
      rgba[i + 1] = dark ? 30 : 180
      rgba[i + 2] = dark ? 30 : 160
      rgba[i + 3] = 255
    }
  }
  return rgba
}

const stroke = { points: [{ x: 58, y: 50 }, { x: 62, y: 50 }], radius: 7 }

describe('补丁', () => {
  it('cropRgba / pasteRgba 往返一致', () => {
    const src = scene()
    const rect = { x: 10, y: 20, width: 30, height: 15 }
    const copy = new Uint8ClampedArray(src.length)
    pasteRgba(copy, W, rect, cropRgba(src, W, rect))
    expect(Array.from(cropRgba(copy, W, rect))).toEqual(Array.from(cropRgba(src, W, rect)))
  })

  it('修复画笔：深色方块变成背景色', () => {
    const src = scene()
    const { rect, rgba } = healPatch(src, W, H, stroke)
    const out = src.slice()
    pasteRgba(out, W, rect, rgba)
    expect(out[(50 * W + 60) * 4]!).toBeGreaterThan(180)
  })

  it('消除画笔：深色方块被周围纹理填补，区域外不变', () => {
    const src = scene()
    const { rect, rgba } = erasePatch(src, W, H, stroke, 3)
    const out = src.slice()
    pasteRgba(out, W, rect, rgba)
    expect(out[(50 * W + 60) * 4]!).toBeGreaterThan(190)
    expect(out[(2 * W + 2) * 4]).toBe(src[(2 * W + 2) * 4])
  })

  it('applyPatches 按顺序贴补丁', () => {
    const src = scene()
    const first = { kind: 'patch', strokeId: 1, rect: { x: 0, y: 0, width: 2, height: 1 }, rgba: new Uint8ClampedArray(8).fill(1) } as const
    const second = { kind: 'patch', strokeId: 2, rect: { x: 1, y: 0, width: 1, height: 1 }, rgba: new Uint8ClampedArray(4).fill(9) } as const
    applyPatches(src, W, [first, second])
    expect(src[0]).toBe(1)
    expect(src[4]).toBe(9)
  })
})

describe('磨皮画笔与保护', () => {
  it('保护画笔：笔画处恢复为参考图', () => {
    const reference = scene()
    const out = new Uint8ClampedArray(reference.length).fill(0)
    const ops: ManualOp[] = [{ kind: 'mask', strokeId: 1, tool: 'protect', stroke: { points: [{ x: 20, y: 20 }], radius: 6 } }]
    applyMaskOps(out, reference, W, H, ops)
    expect(out[(20 * W + 20) * 4]).toBe(reference[(20 * W + 20) * 4])
    expect(out[(80 * W + 100) * 4]).toBe(0)
  })

  it('磨皮画笔：笔画处更平滑', () => {
    const src = scene()
    // 皮肤粗糙纹理：相邻像素相差约 30 个色阶
    for (let y = 10; y < 40; y++) for (let x = 10; x < 40; x++) src[(y * W + x) * 4] = (x * 31 + y * 17) % 2 ? 215 : 185
    const rough = (a: Uint8ClampedArray) => {
      let s = 0
      for (let x = 15; x < 35; x++) s += Math.abs(a[(25 * W + x) * 4]! - a[(25 * W + x + 1) * 4]!)
      return s
    }
    const out = src.slice()
    applyMaskOps(out, src, W, H, [{ kind: 'mask', strokeId: 1, tool: 'smooth', stroke: { points: [{ x: 25, y: 25 }], radius: 14 } }])
    expect(rough(out)).toBeLessThan(rough(src) * 0.6)
  })
})

describe('完整流程中的手动操作', () => {
  it('没有人脸也能应用推拉画笔', () => {
    const src = scene()
    const ops = [pushOp(1, { points: [{ x: 60, y: 50 }, { x: 70, y: 50 }], radius: 15 })]
    const { rgba } = renderRetouch(src, W, H, [], ZERO_PARAMS, ops)
    expect(rgba[(50 * W + 66) * 4]!).toBeLessThan(120) // 深色方块被推到右边
    expect(rgba[(2 * W + 2) * 4]).toBe(src[(2 * W + 2) * 4])
  })
})

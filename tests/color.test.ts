import { describe, expect, it } from 'vitest'
import {
  contrastBetween,
  formatColor,
  harmonies,
  hslToRgb,
  isLight,
  parseColor,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  shades,
  toHex,
  wcagLevel,
} from '../app/utils/tools/color'
import type { ParseColorResult, Rgba } from '../app/utils/tools/color'

function ok(result: ParseColorResult): Rgba {
  if (!result.ok) throw new Error(`期望成功，实际失败：${result.error}`)
  return result.color
}

function fail(result: ParseColorResult): string {
  if (result.ok) throw new Error('期望失败，实际成功')
  return result.error
}

const PRIMARY = { r: 91, g: 79, b: 224, a: 1 }

describe('parseColor', () => {
  it('HEX：6 位、3 位、省略 #、大小写', () => {
    expect(ok(parseColor('#5b4fe0'))).toEqual(PRIMARY)
    expect(ok(parseColor('5B4FE0'))).toEqual(PRIMARY)
    expect(ok(parseColor('#fff'))).toEqual({ r: 255, g: 255, b: 255, a: 1 })
  })

  it('HEX 带透明度：8 位与 4 位', () => {
    expect(ok(parseColor('#5b4fe080')).a).toBe(0.502)
    expect(ok(parseColor('#0008')).a).toBe(0.533)
  })

  it('rgb()：逗号、空格、斜杠透明度、百分比', () => {
    expect(ok(parseColor('rgb(91, 79, 224)'))).toEqual(PRIMARY)
    expect(ok(parseColor('rgb(91 79 224)'))).toEqual(PRIMARY)
    expect(ok(parseColor('rgba(91, 79, 224, 0.5)')).a).toBe(0.5)
    expect(ok(parseColor('rgb(91 79 224 / 50%)')).a).toBe(0.5)
    expect(ok(parseColor('rgb(100%, 0%, 50%)'))).toEqual({ r: 255, g: 0, b: 128, a: 1 })
  })

  it('hsl()：带或不带百分号、deg、透明度', () => {
    expect(ok(parseColor('hsl(0, 100%, 50%)'))).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok(parseColor('hsl(120deg 100 25)'))).toEqual({ r: 0, g: 128, b: 0, a: 1 })
    expect(ok(parseColor('hsla(240, 100%, 50%, .25)'))).toEqual({ r: 0, g: 0, b: 255, a: 0.25 })
    expect(ok(parseColor('hsl(480, 100%, 50%)'))).toEqual({ r: 0, g: 255, b: 0, a: 1 })
  })

  it('非法输入', () => {
    expect(fail(parseColor(''))).toBe('请输入颜色')
    expect(fail(parseColor('#12345'))).toContain('无法识别')
    expect(fail(parseColor('red'))).toContain('无法识别')
    expect(fail(parseColor('rgb(256, 0, 0)'))).toContain('0 ~ 255')
    expect(fail(parseColor('rgb(1, 2)'))).toContain('3 个数值')
    expect(fail(parseColor('rgba(1, 2, 3, 2)'))).toContain('透明度')
    expect(fail(parseColor('hsl(10, 120%, 50%)'))).toContain('0% ~ 100%')
  })
})

describe('格式互转', () => {
  it('HEX 输出', () => {
    expect(toHex(PRIMARY)).toBe('#5b4fe0')
    expect(toHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080')
  })

  it('RGB ↔ HSL 往返一致', () => {
    for (const hex of ['#5b4fe0', '#000000', '#ffffff', '#808080', '#ff8800', '#123456']) {
      const rgb = ok(parseColor(hex))
      expect(toHex(hslToRgb(rgbToHsl(rgb)))).toBe(hex)
    }
  })

  it('灰色的色相与饱和度为 0', () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 })).toMatchObject({ h: 0, s: 0 })
  })

  it('HSV 与 CMYK', () => {
    const hsv = rgbToHsv({ r: 255, g: 0, b: 0 })
    expect([hsv.h, hsv.s, hsv.v]).toEqual([0, 100, 100])
    expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 })
    expect(rgbToCmyk({ r: 255, g: 0, b: 0 })).toEqual({ c: 0, m: 100, y: 100, k: 0 })
  })

  it('formatColor 文本', () => {
    expect(formatColor(PRIMARY)).toEqual({
      hex: '#5B4FE0',
      rgb: 'rgb(91, 79, 224)',
      hsl: 'hsl(245, 70%, 59%)',
      hsv: 'hsv(245, 65%, 88%)',
      cmyk: 'cmyk(59%, 65%, 0%, 12%)',
    })
    expect(formatColor({ ...PRIMARY, a: 0.5 }).rgb).toBe('rgba(91, 79, 224, 0.5)')
    expect(formatColor({ ...PRIMARY, a: 0.5 }).hsl).toBe('hsla(245, 70%, 59%, 0.5)')
  })
})

describe('对比度', () => {
  it('黑白为 21，同色为 1', () => {
    expect(contrastBetween({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 5)
    expect(contrastBetween(PRIMARY, PRIMARY)).toBe(1)
  })

  it('WCAG 等级', () => {
    expect(wcagLevel(21)).toEqual({ normal: 'AAA', large: 'AAA' })
    expect(wcagLevel(5)).toEqual({ normal: 'AA', large: 'AAA' })
    expect(wcagLevel(3.5)).toEqual({ normal: '不达标', large: 'AA' })
    expect(wcagLevel(2)).toEqual({ normal: '不达标', large: '不达标' })
  })

  it('isLight', () => {
    expect(isLight({ r: 255, g: 255, b: 0 })).toBe(true)
    expect(isLight({ r: 20, g: 20, b: 80 })).toBe(false)
  })
})

describe('色阶与配色', () => {
  it('10 级深浅，越来越深', () => {
    const list = shades(PRIMARY)
    expect(list.map(s => s.label)).toEqual(['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'])
    const lightness = list.map(s => rgbToHsl(ok(parseColor(s.hex))).l)
    for (let i = 1; i < lightness.length; i++) expect(lightness[i]!).toBeLessThan(lightness[i - 1]!)
  })

  it('互补色相差 180°', () => {
    const [self, comp] = harmonies({ r: 255, g: 0, b: 0 })[0]!.colors
    expect(self).toBe('#ff0000')
    expect(comp).toBe('#00ffff')
  })
})

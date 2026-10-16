import { describe, expect, it } from 'vitest'
import { checkValue, convert, convertAll, formatNumber, parseNumber, UNIT_CATEGORIES } from '../app/utils/tools/units'
import type { ParseResult } from '../app/utils/tools/units'

function value<T>(result: ParseResult<T>): T {
  if (!result.ok) throw new Error(`期望成功，实际失败：${result.error}`)
  return result.value
}

describe('单位表', () => {
  it('每个类别的单位 id 唯一，默认单位存在', () => {
    for (const category of UNIT_CATEGORIES) {
      const ids = category.units.map(u => u.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toContain(category.defaultUnit)
    }
  })

  it('任意两个单位往返换算后不变', () => {
    for (const category of UNIT_CATEGORIES) {
      for (const a of category.units) {
        for (const b of category.units) {
          const back = convert(convert(123.456, a.id, b.id, category.id), b.id, a.id, category.id)
          expect(back).toBeCloseTo(123.456, 8)
        }
      }
    }
  })
})

describe('常用换算', () => {
  it('长度', () => {
    expect(convert(1, 'km', 'm', 'length')).toBe(1000)
    expect(convert(1, 'in', 'cm', 'length')).toBeCloseTo(2.54, 12)
    expect(convert(1, 'mi', 'km', 'length')).toBeCloseTo(1.609344, 12)
  })

  it('市制单位', () => {
    expect(convert(1, 'chi', 'm', 'length')).toBeCloseTo(1 / 3, 12)
    expect(convert(1, 'zhang', 'chi', 'length')).toBeCloseTo(10, 12)
    expect(convert(1, 'li', 'm', 'length')).toBe(500)
    expect(convert(1, 'jin', 'kg', 'mass')).toBe(0.5)
    expect(convert(1, 'jin', 'liang', 'mass')).toBeCloseTo(10, 12)
    expect(convert(1, 'mu', 'm2', 'area')).toBeCloseTo(666.6667, 4)
    expect(convert(15, 'mu', 'ha', 'area')).toBeCloseTo(1, 12)
  })

  it('温度', () => {
    expect(convert(-40, 'c', 'f', 'temperature')).toBeCloseTo(-40, 12)
    expect(convert(0, 'c', 'k', 'temperature')).toBeCloseTo(273.15, 12)
    expect(convert(100, 'c', 'f', 'temperature')).toBeCloseTo(212, 12)
    expect(convert(98.6, 'f', 'c', 'temperature')).toBeCloseTo(37, 12)
  })

  it('速度与数据', () => {
    expect(convert(36, 'kmh', 'ms', 'speed')).toBeCloseTo(10, 12)
    expect(convert(1, 'gb', 'mb', 'data')).toBe(1024)
    expect(convert(1, 'b', 'bit', 'data')).toBe(8)
  })

  it('100 兆宽带约等于 11.92 MB/s', () => {
    expect(convert(100, 'mbps', 'mbs', 'rate')).toBeCloseTo(11.920929, 5)
  })

  it('convertAll 包含所有单位，输入单位保持原值', () => {
    const all = convertAll(2, 'm', 'length')
    expect(all).toHaveLength(UNIT_CATEGORIES[0]!.units.length)
    expect(all.find(r => r.unit.id === 'm')!.value).toBe(2)
    expect(all.find(r => r.unit.id === 'cm')!.value).toBeCloseTo(200, 10)
  })
})

describe('输入与输出', () => {
  it('parseNumber', () => {
    expect(value(parseNumber('12.5'))).toBe(12.5)
    expect(value(parseNumber('-40'))).toBe(-40)
    expect(value(parseNumber('1,000'))).toBe(1000)
    expect(value(parseNumber('1.5e3'))).toBe(1500)
    expect(value(parseNumber('.5'))).toBe(0.5)
    expect(parseNumber('').ok).toBe(false)
    expect(parseNumber('abc').ok).toBe(false)
    expect(parseNumber('1e999').ok).toBe(false)
  })

  it('formatNumber 消除浮点误差', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(1 / 3)).toBe('0.333333333333')
    expect(formatNumber(0)).toBe('0')
  })

  it('formatNumber 千分位与科学计数法', () => {
    expect(formatNumber(1234567.5)).toBe('1,234,567.5')
    expect(formatNumber(1234567.5, false)).toBe('1234567.5')
    expect(formatNumber(1e-9)).toBe('1e-9')
    expect(formatNumber(2.5e20)).toBe('2.5e+20')
    expect(formatNumber(-1234.5)).toBe('-1,234.5')
  })

  it('温度不能低于绝对零度', () => {
    expect(checkValue(-300, 'c', 'temperature')).toContain('绝对零度')
    expect(checkValue(-1, 'k', 'temperature')).toContain('绝对零度')
    expect(checkValue(-459.67, 'f', 'temperature')).toBeNull()
    expect(checkValue(-300, 'm', 'length')).toBeNull()
  })
})

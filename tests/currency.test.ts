import { describe, expect, it } from 'vitest'
import fallback from '../server/data/rates-fallback.json'
import {
  convert,
  currencyName,
  formatMoney,
  formatRate,
  fractionDigits,
  isValidRates,
  parseAmount,
  parseApiResponse,
  rateOf,
  sortCurrencies,
} from '../app/utils/tools/currency'
import type { ParseResult, RatesData } from '../app/utils/tools/currency'

const RATES: RatesData = {
  base: 'USD',
  updatedAt: 1_792_108_951,
  rates: { USD: 1, CNY: 7, EUR: 0.9, JPY: 150, KRW: 1400, HKD: 7.8 },
}

function value<T>(result: ParseResult<T>): T {
  if (!result.ok) throw new Error(`期望成功，实际失败：${result.error}`)
  return result.value
}

function error<T>(result: ParseResult<T>): string {
  if (result.ok) throw new Error('期望失败，实际成功')
  return result.error
}

describe('换算', () => {
  it('1 美元换人民币', () => {
    expect(convert(1, 'USD', 'CNY', RATES)).toBe(7)
  })

  it('同币种为 1', () => {
    expect(rateOf('CNY', 'CNY', RATES)).toBe(1)
  })

  it('交叉汇率：人民币换日元', () => {
    expect(rateOf('CNY', 'JPY', RATES)).toBeCloseTo(150 / 7, 10)
    expect(convert(700, 'CNY', 'JPY', RATES)).toBeCloseTo(15000, 8)
  })

  it('正反汇率互为倒数', () => {
    expect(rateOf('EUR', 'CNY', RATES)! * rateOf('CNY', 'EUR', RATES)!).toBeCloseTo(1, 12)
  })

  it('币种不存在时返回 null', () => {
    expect(rateOf('USD', 'XYZ', RATES)).toBeNull()
    expect(convert(1, 'XYZ', 'CNY', RATES)).toBeNull()
  })
})

describe('parseAmount', () => {
  it('整数、小数、千分位、空格', () => {
    expect(value(parseAmount('1'))).toBe(1)
    expect(value(parseAmount('12.5'))).toBe(12.5)
    expect(value(parseAmount('1,234,567.89'))).toBe(1234567.89)
    expect(value(parseAmount(' 1 000 '))).toBe(1000)
    expect(value(parseAmount('.5'))).toBe(0.5)
  })

  it('万与亿', () => {
    expect(value(parseAmount('2.5万'))).toBe(25000)
    expect(value(parseAmount('3亿'))).toBe(300000000)
  })

  it('非法输入', () => {
    expect(error(parseAmount(''))).toBe('请输入金额')
    expect(error(parseAmount('-5'))).toBe('金额不能是负数')
    expect(error(parseAmount('abc'))).toContain('只能是数字')
    expect(error(parseAmount('1e5'))).toContain('只能是数字')
    expect(error(parseAmount('99999999亿'))).toBe('金额过大')
  })
})

describe('格式化', () => {
  it('币种小数位', () => {
    expect(fractionDigits('CNY')).toBe(2)
    expect(fractionDigits('JPY')).toBe(0)
    expect(fractionDigits('KRW')).toBe(0)
    expect(fractionDigits('IDR')).toBe(0)
    expect(fractionDigits('KWD')).toBe(3)
  })

  it('金额带千分位并按币种保留小数', () => {
    expect(formatMoney(1234567.891, 'CNY')).toBe('1,234,567.89')
    expect(formatMoney(1234567.891, 'JPY')).toBe('1,234,568')
    expect(formatMoney(0, 'USD')).toBe('0.00')
  })

  it('很小的金额不会显示成 0', () => {
    const v = convert(1, 'KRW', 'USD', RATES)!
    // 1 / 1400 ≈ 0.000714285…，保留 4 位有效数字
    expect(formatMoney(v, 'USD')).toBe('0.0007143')
  })

  it('汇率展示', () => {
    expect(formatRate(7)).toBe('7.0000')
    expect(formatRate(1 / 7)).toBe('0.1429')
    expect(formatRate(1 / 1400)).toBe('0.0007143')
  })

  it('中文名', () => {
    expect(currencyName('USD')).toBe('美元')
    expect(currencyName('CNY')).toBe('人民币')
    expect(currencyName('JPY')).toBe('日元')
  })
})

describe('排序与数据校验', () => {
  it('常用币种在前，其余按代码排序', () => {
    expect(sortCurrencies(['ZAR', 'USD', 'AED', 'CNY', 'BRL'])).toEqual(['CNY', 'USD', 'AED', 'BRL', 'ZAR'])
  })

  it('校验汇率数据', () => {
    expect(isValidRates(RATES)).toBe(true)
    expect(isValidRates({ ...RATES, rates: { USD: 1, CNY: -1 } })).toBe(false)
    expect(isValidRates({ ...RATES, rates: { CNY: 7 } })).toBe(false) // 缺少基准货币
    expect(isValidRates(null)).toBe(false)
  })

  it('解析接口响应', () => {
    const json = { result: 'success', base_code: 'USD', time_last_update_unix: 1, rates: { USD: 1, CNY: 7 } }
    expect(parseApiResponse(json)).toEqual({ base: 'USD', updatedAt: 1, rates: { USD: 1, CNY: 7 } })
    expect(parseApiResponse({ ...json, result: 'error' })).toBeNull()
    expect(parseApiResponse('oops')).toBeNull()
  })

  it('仓库里的兜底快照是有效数据，且包含常用币种', () => {
    expect(isValidRates(fallback)).toBe(true)
    for (const code of ['CNY', 'USD', 'EUR', 'JPY', 'HKD']) expect(fallback.rates).toHaveProperty(code)
  })
})

describe('补充的中文名', () => {
  it('浏览器没有中文名的币种', () => {
    expect(currencyName('CNH')).toBe('离岸人民币')
    expect(currencyName('XXX1')).toBe('XXX1')
  })
})

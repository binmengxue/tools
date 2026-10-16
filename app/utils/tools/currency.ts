/**
 * 货币转换（纯函数，配 Vitest 单测）
 * 汇率以 USD 为基准；构建时的快照（/rates.json）与浏览器实时请求都用这里的函数校验与换算。
 */

/** 免费汇率接口（ExchangeRate-API Open Access，无需 Key，每日更新） */
export const RATES_API = 'https://open.er-api.com/v6/latest/USD'
export const RATES_SOURCE = { name: 'ExchangeRate-API', url: 'https://www.exchangerate-api.com' }

export interface RatesData {
  /** 基准货币，固定为 USD */
  base: string
  /** 汇率更新时间（Unix 秒） */
  updatedAt: number
  /** 1 基准货币 = rates[code] 该货币 */
  rates: Record<string, number>
}

export type ParseResult<T>
  = | { ok: true, value: T }
    | { ok: false, error: string }

/** 常用币种，按这个顺序排在最前面 */
export const COMMON_CURRENCIES = [
  'CNY', 'USD', 'EUR', 'JPY', 'HKD', 'GBP', 'KRW', 'TWD', 'MOP', 'AUD', 'CAD', 'SGD',
  'CHF', 'THB', 'MYR', 'NZD', 'RUB', 'INR', 'VND', 'PHP', 'IDR', 'AED', 'SAR',
]

/** 速查表的金额 */
export const QUICK_AMOUNTS = [1, 10, 100, 1000, 10000]

/** 金额上限，避免超出浮点精度 */
const MAX_AMOUNT = 1e15

function isRatesRecord(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object') return false
  const entries = Object.entries(value)
  return entries.length > 0 && entries.every(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && rate > 0 && Number.isFinite(rate))
}

/** 校验汇率数据（快照或页面载荷） */
export function isValidRates(data: unknown): data is RatesData {
  if (!data || typeof data !== 'object') return false
  const d = data as Partial<RatesData>
  return typeof d.base === 'string' && typeof d.updatedAt === 'number' && isRatesRecord(d.rates) && d.rates[d.base] === 1
}

/** 把 open.er-api.com 的响应转换为 RatesData，格式不对时返回 null */
export function parseApiResponse(json: unknown): RatesData | null {
  if (!json || typeof json !== 'object') return null
  const j = json as { result?: unknown, base_code?: unknown, time_last_update_unix?: unknown, rates?: unknown }
  if (j.result !== 'success' || typeof j.base_code !== 'string' || typeof j.time_last_update_unix !== 'number') return null
  const data: RatesData = { base: j.base_code, updatedAt: j.time_last_update_unix, rates: j.rates as Record<string, number> }
  return isValidRates(data) ? data : null
}

/** 1 单位 from 可以换多少 to；币种不存在时返回 null */
export function rateOf(from: string, to: string, data: RatesData): number | null {
  const a = data.rates[from]
  const b = data.rates[to]
  if (!a || !b) return null
  return from === to ? 1 : b / a
}

/** 换算金额 */
export function convert(amount: number, from: string, to: string, data: RatesData): number | null {
  const rate = rateOf(from, to, data)
  return rate === null ? null : amount * rate
}

/**
 * 解析金额输入：支持千分位逗号、空格，以及「万」「亿」，如 1,000、2.5万、3亿。
 */
export function parseAmount(input: string): ParseResult<number> {
  const text = input.trim().replace(/[,，\s]/g, '')
  if (!text) return { ok: false, error: '请输入金额' }
  const match = /^(\d+(?:\.\d+)?|\.\d+)(万|亿)?$/.exec(text)
  if (!match) {
    if (text.startsWith('-')) return { ok: false, error: '金额不能是负数' }
    return { ok: false, error: '金额只能是数字，可以带小数点、千分位逗号或「万」「亿」' }
  }
  const unit = match[2] === '万' ? 1e4 : match[2] === '亿' ? 1e8 : 1
  const value = Number(match[1]) * unit
  if (value > MAX_AMOUNT) return { ok: false, error: '金额过大' }
  return { ok: true, value }
}

const digitsCache = new Map<string, number>()

/** 币种的标准小数位，如人民币 2 位、日元 0 位 */
export function fractionDigits(code: string): number {
  let digits = digitsCache.get(code)
  if (digits === undefined) {
    try {
      digits = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
    }
    catch {
      digits = 2
    }
    digitsCache.set(code, digits)
  }
  return digits
}

/** 按币种小数位格式化金额（带千分位，不带货币符号）；金额很小时多保留几位，避免显示成 0 */
export function formatMoney(value: number, code: string): string {
  let digits = fractionDigits(code)
  if (value !== 0 && Math.abs(value) < 10 ** -digits) {
    // 例如 1 韩元 ≈ 0.0007 美元：保留 4 位有效数字
    digits = Math.min(10, Math.ceil(-Math.log10(Math.abs(value))) + 3)
  }
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

/** 汇率的展示：≥ 1 时保留 4 位小数，< 1 时保留 4 位有效数字 */
export function formatRate(rate: number): string {
  if (rate >= 1) return rate.toFixed(4)
  return Number(rate.toPrecision(4)).toString()
}

const nameFormatter = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames('zh-CN', { type: 'currency' })
  : null

/** 浏览器没有中文名的币种（多为非 ISO 标准或较新的代码） */
const EXTRA_NAMES: Record<string, string> = {
  CNH: '离岸人民币',
  CLF: '智利发展单位',
  FOK: '法罗群岛克朗',
  GGP: '根西岛镑',
  IMP: '马恩岛镑',
  JEP: '泽西岛镑',
  KID: '基里巴斯元',
  SLE: '塞拉利昂新利昂',
  TVD: '图瓦卢元',
  XCG: '加勒比盾',
  ZWG: '津巴布韦金',
}

/** 货币中文名，如 USD → 美元；没有中文名时返回代码本身 */
export function currencyName(code: string): string {
  if (EXTRA_NAMES[code]) return EXTRA_NAMES[code]
  try {
    const name = nameFormatter?.of(code)
    return name && name !== code ? name : code
  }
  catch {
    return code
  }
}

/** 常用币种在前（按 COMMON_CURRENCIES 的顺序），其余按代码排序 */
export function sortCurrencies(codes: string[]): string[] {
  const common = COMMON_CURRENCIES.filter(c => codes.includes(c))
  const others = codes.filter(c => !COMMON_CURRENCIES.includes(c)).sort()
  return [...common, ...others]
}

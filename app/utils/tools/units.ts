/**
 * 单位换算（纯函数，配 Vitest 单测）
 * 每个类别选一个基准单位，其他单位用「1 单位 = factor 基准单位」换算；温度不是线性比例，单独用换算函数。
 */

export type UnitCategoryId = 'length' | 'area' | 'volume' | 'mass' | 'temperature' | 'speed' | 'data' | 'rate'

export interface UnitDef {
  id: string
  /** 中文名 */
  name: string
  /** 符号 */
  symbol: string
  /** 1 该单位 = factor 基准单位（温度不用） */
  factor?: number
  /** 换算到基准单位（温度用） */
  toBase?: (v: number) => number
  /** 从基准单位换算回来（温度用） */
  fromBase?: (v: number) => number
}

export interface UnitCategory {
  id: UnitCategoryId
  name: string
  icon: string
  /** 切换到该类别时默认选中的单位 */
  defaultUnit: string
  units: UnitDef[]
}

export type ParseResult<T>
  = | { ok: true, value: T }
    | { ok: false, error: string }

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    name: '长度',
    icon: 'lucide:ruler',
    defaultUnit: 'm',
    // 基准：米
    units: [
      { id: 'km', name: '公里', symbol: 'km', factor: 1000 },
      { id: 'm', name: '米', symbol: 'm', factor: 1 },
      { id: 'dm', name: '分米', symbol: 'dm', factor: 0.1 },
      { id: 'cm', name: '厘米', symbol: 'cm', factor: 0.01 },
      { id: 'mm', name: '毫米', symbol: 'mm', factor: 0.001 },
      { id: 'um', name: '微米', symbol: 'μm', factor: 1e-6 },
      { id: 'li', name: '里（市制）', symbol: '里', factor: 500 },
      { id: 'zhang', name: '丈（市制）', symbol: '丈', factor: 10 / 3 },
      { id: 'chi', name: '尺（市制）', symbol: '尺', factor: 1 / 3 },
      { id: 'cun', name: '寸（市制）', symbol: '寸', factor: 1 / 30 },
      { id: 'mi', name: '英里', symbol: 'mi', factor: 1609.344 },
      { id: 'yd', name: '码', symbol: 'yd', factor: 0.9144 },
      { id: 'ft', name: '英尺', symbol: 'ft', factor: 0.3048 },
      { id: 'in', name: '英寸', symbol: 'in', factor: 0.0254 },
      { id: 'nmi', name: '海里', symbol: 'nmi', factor: 1852 },
    ],
  },
  {
    id: 'area',
    name: '面积',
    icon: 'lucide:square',
    defaultUnit: 'm2',
    // 基准：平方米
    units: [
      { id: 'km2', name: '平方公里', symbol: 'km²', factor: 1e6 },
      { id: 'ha', name: '公顷', symbol: 'ha', factor: 1e4 },
      { id: 'mu', name: '亩', symbol: '亩', factor: 10000 / 15 },
      { id: 'm2', name: '平方米', symbol: 'm²', factor: 1 },
      { id: 'dm2', name: '平方分米', symbol: 'dm²', factor: 0.01 },
      { id: 'cm2', name: '平方厘米', symbol: 'cm²', factor: 1e-4 },
      { id: 'acre', name: '英亩', symbol: 'acre', factor: 4046.8564224 },
      { id: 'ft2', name: '平方英尺', symbol: 'ft²', factor: 0.09290304 },
    ],
  },
  {
    id: 'volume',
    name: '体积',
    icon: 'lucide:cylinder',
    defaultUnit: 'l',
    // 基准：升
    units: [
      { id: 'm3', name: '立方米', symbol: 'm³', factor: 1000 },
      { id: 'l', name: '升', symbol: 'L', factor: 1 },
      { id: 'ml', name: '毫升', symbol: 'mL', factor: 0.001 },
      { id: 'gal_us', name: '美制加仑', symbol: 'gal (US)', factor: 3.785411784 },
      { id: 'gal_uk', name: '英制加仑', symbol: 'gal (UK)', factor: 4.54609 },
      { id: 'floz_us', name: '美制液量盎司', symbol: 'fl oz', factor: 0.0295735295625 },
    ],
  },
  {
    id: 'mass',
    name: '重量',
    icon: 'lucide:weight',
    defaultUnit: 'kg',
    // 基准：千克
    units: [
      { id: 't', name: '吨', symbol: 't', factor: 1000 },
      { id: 'kg', name: '千克（公斤）', symbol: 'kg', factor: 1 },
      { id: 'jin', name: '斤（市斤）', symbol: '斤', factor: 0.5 },
      { id: 'liang', name: '两', symbol: '两', factor: 0.05 },
      { id: 'g', name: '克', symbol: 'g', factor: 0.001 },
      { id: 'mg', name: '毫克', symbol: 'mg', factor: 1e-6 },
      { id: 'lb', name: '磅', symbol: 'lb', factor: 0.45359237 },
      { id: 'oz', name: '盎司', symbol: 'oz', factor: 0.028349523125 },
      { id: 'ct', name: '克拉', symbol: 'ct', factor: 0.0002 },
    ],
  },
  {
    id: 'temperature',
    name: '温度',
    icon: 'lucide:thermometer',
    defaultUnit: 'c',
    // 基准：摄氏度
    units: [
      { id: 'c', name: '摄氏度', symbol: '℃', toBase: v => v, fromBase: v => v },
      { id: 'f', name: '华氏度', symbol: '℉', toBase: v => ((v - 32) * 5) / 9, fromBase: v => (v * 9) / 5 + 32 },
      { id: 'k', name: '开尔文', symbol: 'K', toBase: v => v - 273.15, fromBase: v => v + 273.15 },
    ],
  },
  {
    id: 'speed',
    name: '速度',
    icon: 'lucide:gauge',
    defaultUnit: 'kmh',
    // 基准：米 / 秒
    units: [
      { id: 'ms', name: '米 / 秒', symbol: 'm/s', factor: 1 },
      { id: 'kmh', name: '公里 / 小时', symbol: 'km/h', factor: 1 / 3.6 },
      { id: 'mph', name: '英里 / 小时', symbol: 'mph', factor: 0.44704 },
      { id: 'kn', name: '节', symbol: 'kn', factor: 1852 / 3600 },
    ],
  },
  {
    id: 'data',
    name: '数据大小',
    icon: 'lucide:hard-drive',
    defaultUnit: 'mb',
    // 基准：字节，按 1024 进制（操作系统里常见的算法）
    units: [
      { id: 'bit', name: '比特', symbol: 'bit', factor: 1 / 8 },
      { id: 'b', name: '字节', symbol: 'B', factor: 1 },
      { id: 'kb', name: '千字节', symbol: 'KB', factor: 1024 },
      { id: 'mb', name: '兆字节', symbol: 'MB', factor: 1024 ** 2 },
      { id: 'gb', name: '吉字节', symbol: 'GB', factor: 1024 ** 3 },
      { id: 'tb', name: '太字节', symbol: 'TB', factor: 1024 ** 4 },
    ],
  },
  {
    id: 'rate',
    name: '网速',
    icon: 'lucide:wifi',
    defaultUnit: 'mbps',
    // 基准：比特 / 秒。运营商宽带用 bps（1000 进制），下载软件显示的是 B/s（1024 进制）
    units: [
      { id: 'kbps', name: '千比特 / 秒', symbol: 'Kbps', factor: 1000 },
      { id: 'mbps', name: '兆比特 / 秒（宽带「兆」）', symbol: 'Mbps', factor: 1e6 },
      { id: 'gbps', name: '吉比特 / 秒', symbol: 'Gbps', factor: 1e9 },
      { id: 'kbs', name: '千字节 / 秒', symbol: 'KB/s', factor: 8 * 1024 },
      { id: 'mbs', name: '兆字节 / 秒', symbol: 'MB/s', factor: 8 * 1024 ** 2 },
    ],
  },
]

/** 绝对零度（摄氏度） */
const ABSOLUTE_ZERO = -273.15

export function getUnitCategory(id: UnitCategoryId): UnitCategory {
  return UNIT_CATEGORIES.find(c => c.id === id)!
}

function findUnit(category: UnitCategory, unitId: string): UnitDef {
  const unit = category.units.find(u => u.id === unitId)
  if (!unit) throw new Error(`未知单位：${unitId}`)
  return unit
}

function toBase(value: number, unit: UnitDef): number {
  return unit.toBase ? unit.toBase(value) : value * unit.factor!
}

function fromBase(value: number, unit: UnitDef): number {
  return unit.fromBase ? unit.fromBase(value) : value / unit.factor!
}

/** 单位换算 */
export function convert(value: number, fromId: string, toId: string, categoryId: UnitCategoryId): number {
  const category = getUnitCategory(categoryId)
  if (fromId === toId) return value
  return fromBase(toBase(value, findUnit(category, fromId)), findUnit(category, toId))
}

/** 换算成该类别的所有单位 */
export function convertAll(value: number, fromId: string, categoryId: UnitCategoryId): { unit: UnitDef, value: number }[] {
  const category = getUnitCategory(categoryId)
  const base = toBase(value, findUnit(category, fromId))
  return category.units.map(unit => ({ unit, value: unit.id === fromId ? value : fromBase(base, unit) }))
}

/** 校验数值在该单位下是否有意义（目前只检查温度不能低于绝对零度） */
export function checkValue(value: number, unitId: string, categoryId: UnitCategoryId): string | null {
  if (categoryId !== 'temperature') return null
  const celsius = toBase(value, findUnit(getUnitCategory('temperature'), unitId))
  return celsius < ABSOLUTE_ZERO - 1e-9 ? '温度不能低于绝对零度（-273.15 ℃ / -459.67 ℉ / 0 K）' : null
}

/** 解析输入的数值：支持负数、小数、千分位逗号和科学计数法（如 1.5e3） */
export function parseNumber(input: string): ParseResult<number> {
  const text = input.trim().replace(/[,，\s]/g, '')
  if (!text) return { ok: false, error: '请输入数值' }
  if (!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(text)) return { ok: false, error: '请输入有效的数字，例如 12.5、-40、1.5e3' }
  const value = Number(text)
  if (!Number.isFinite(value)) return { ok: false, error: '数值超出范围' }
  return { ok: true, value }
}

/**
 * 格式化换算结果：保留 12 位有效数字（消除 0.1 + 0.2 这类浮点误差），
 * 很大或很小的数用科学计数法；grouping 为 true 时加千分位。
 */
export function formatNumber(value: number, grouping = true): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const rounded = Number(value.toPrecision(12))
  const abs = Math.abs(rounded)
  if (abs >= 1e15 || abs < 1e-6) {
    const [mantissa, exponent] = rounded.toExponential(6).split('e')
    return `${Number(mantissa)}e${exponent}`
  }
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 12, useGrouping: grouping })
}

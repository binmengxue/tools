/**
 * 时间戳转换（纯函数，配 Vitest 单测）
 * 只用原生 Date / Intl，时区都通过参数传入，便于在固定时区下测试。
 */

export type TimestampUnit = 's' | 'ms'

export type ParseResult<T>
  = | { ok: true, value: T }
    | { ok: false, error: string }

/** Date 能表示的最大毫秒数（±1 亿天） */
const MAX_MS = 8.64e15

/** 秒级时间戳的上限：超过这个数值按毫秒处理（1e11 秒约为公元 5138 年） */
const SECONDS_LIMIT = 1e11

/** 毫秒级时间戳的上限：再大通常是微秒或纳秒 */
const MILLIS_LIMIT = 1e14

/** 根据数值大小判断单位 */
export function detectUnit(value: number): TimestampUnit {
  return Math.abs(value) >= SECONDS_LIMIT ? 'ms' : 's'
}

/**
 * 解析时间戳输入，返回毫秒数和实际使用的单位。
 * unit 为 auto 时按数值大小自动识别秒 / 毫秒。
 */
export function parseTimestamp(input: string, unit: TimestampUnit | 'auto' = 'auto'): ParseResult<{ ms: number, unit: TimestampUnit }> {
  const text = input.trim()
  if (!text) return { ok: false, error: '请输入时间戳' }
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return { ok: false, error: '时间戳只能包含数字（可以带负号或小数）' }
  const value = Number(text)
  if (unit === 'auto' && Math.abs(value) >= MILLIS_LIMIT) {
    return { ok: false, error: '数值过大，可能是微秒或纳秒时间戳；目前支持秒和毫秒，请去掉末尾的 3 位或 6 位数字后再试' }
  }
  const actual = unit === 'auto' ? detectUnit(value) : unit
  const ms = Math.round(actual === 's' ? value * 1000 : value)
  if (Math.abs(ms) > MAX_MS) return { ok: false, error: '超出可表示的时间范围' }
  return { ok: true, value: { ms, unit: actual } }
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

/** 某一时刻在指定时区的年月日时分秒 */
function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts: Record<string, number> = {}
  for (const part of partsFormatter(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  // 公元前的年份在 en-US 中带 era，这里只处理常见范围
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
    second: parts.second!,
  }
}

/** 指定时区在某一时刻相对 UTC 的偏移（毫秒），如东八区为 +8 小时 */
export function timeZoneOffset(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000))
}

/** 偏移量格式化为 UTC+08:00 */
export function formatOffset(offsetMs: number): string {
  const minutes = Math.round(offsetMs / 60000)
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `UTC${sign}${hh}:${mm}`
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export interface ZonedDateInfo {
  /** YYYY-MM-DD HH:mm:ss（毫秒不为 0 时带 .SSS） */
  dateTime: string
  /** 星期几 */
  weekday: string
  /** 如 UTC+08:00 */
  offset: string
  /** ISO 8601，带时区偏移，如 2023-11-15T06:13:20+08:00 */
  iso: string
}

/** 把某一时刻格式化为指定时区的日期时间 */
export function formatInZone(ms: number, timeZone: string): ZonedDateInfo {
  const p = zonedParts(ms, timeZone)
  const millis = ((ms % 1000) + 1000) % 1000
  const offsetMs = timeZoneOffset(ms, timeZone)
  const date = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
  const time = `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${millis ? `.${pad(millis, 3)}` : ''}`
  const offset = formatOffset(offsetMs)
  const isoOffset = offsetMs === 0 ? 'Z' : offset.slice(3)
  const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()]!
  return { dateTime: `${date} ${time}`, weekday, offset, iso: `${date}T${time}${isoOffset}` }
}

const DATE_TIME_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
const HAS_ZONE_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i

/**
 * 解析日期时间文本为毫秒时间戳。
 * - 带时区的 ISO 8601（如 2023-11-14T22:13:20Z、…+08:00）按其自带时区解析
 * - 其余按 timeZone 指定时区的当地时间解析，支持 2023-11-15 06:13:20、2023/11/15 06:13、2023-11-15
 */
export function parseDateTime(input: string, timeZone: string): ParseResult<number> {
  const text = input.trim()
  const formatError = '日期格式不正确，示例：2026-10-16 08:30:00'
  if (!text) return { ok: false, error: '请输入日期时间' }

  if (text.includes('T') && HAS_ZONE_RE.test(text)) {
    const ms = Date.parse(text)
    return Number.isNaN(ms) ? { ok: false, error: formatError } : { ok: true, value: ms }
  }

  const match = DATE_TIME_RE.exec(text)
  if (!match) return { ok: false, error: formatError }
  const [year, month, day, hour = 0, minute = 0, second = 0] = match.slice(1, 7).map(v => (v === undefined ? undefined : Number(v))) as number[]
  const millis = match[7] ? Number(match[7].padEnd(3, '0')) : 0
  if (month! < 1 || month! > 12) return { ok: false, error: '月份应在 1 ~ 12 之间' }
  if (hour > 23 || minute > 59 || second > 59) return { ok: false, error: '时间超出范围（时 0 ~ 23，分秒 0 ~ 59）' }
  const asUtc = Date.UTC(year!, month! - 1, day!, hour, minute, second, millis)
  const check = new Date(asUtc)
  if (check.getUTCMonth() !== month! - 1 || check.getUTCDate() !== day) {
    return { ok: false, error: `${year} 年 ${month} 月没有 ${day} 日` }
  }

  // 当地时间 → UTC：先按当前偏移换算，再用换算后时刻的偏移校正一次（处理夏令时切换）
  let ms = asUtc - timeZoneOffset(asUtc, timeZone)
  ms = asUtc - timeZoneOffset(ms, timeZone)
  return { ok: true, value: ms }
}

/** 相对现在的描述，如「3 天前」「2 小时后」 */
export function formatRelative(ms: number, now: number): string {
  const diff = ms - now
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600 * 1000],
    ['month', 30 * 24 * 3600 * 1000],
    ['day', 24 * 3600 * 1000],
    ['hour', 3600 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000],
  ]
  for (const [unit, size] of units) {
    if (abs >= size || unit === 'second') return rtf.format(Math.round(diff / size), unit)
  }
  return ''
}

/** 浏览器所在时区，如 Asia/Shanghai */
export function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

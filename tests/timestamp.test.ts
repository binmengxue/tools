import { describe, expect, it } from 'vitest'
import {
  detectUnit,
  formatInZone,
  formatOffset,
  formatRelative,
  parseDateTime,
  parseTimestamp,
  timeZoneOffset,
} from '../app/utils/tools/timestamp'
import type { ParseResult } from '../app/utils/tools/timestamp'

function value<T>(result: ParseResult<T>): T {
  if (!result.ok) throw new Error(`期望成功，实际失败：${result.error}`)
  return result.value
}

function error<T>(result: ParseResult<T>): string {
  if (result.ok) throw new Error('期望失败，实际成功')
  return result.error
}

// 2023-11-14T22:13:20Z
const T = 1_700_000_000_000

describe('parseTimestamp', () => {
  it('10 位自动识别为秒', () => {
    expect(value(parseTimestamp('1700000000'))).toEqual({ ms: T, unit: 's' })
  })

  it('13 位自动识别为毫秒', () => {
    expect(value(parseTimestamp('1700000000000'))).toEqual({ ms: T, unit: 'ms' })
  })

  it('手动指定单位', () => {
    expect(value(parseTimestamp('1700000000', 'ms')).ms).toBe(1_700_000_000)
    expect(value(parseTimestamp('1700000000000', 's')).ms).toBe(1_700_000_000_000_000)
  })

  it('支持小数秒和负数', () => {
    expect(value(parseTimestamp('1700000000.5')).ms).toBe(T + 500)
    expect(value(parseTimestamp('-1')).ms).toBe(-1000)
  })

  it('非法输入', () => {
    expect(error(parseTimestamp(''))).toBe('请输入时间戳')
    expect(error(parseTimestamp('abc'))).toContain('只能包含数字')
    expect(error(parseTimestamp('1e10'))).toContain('只能包含数字')
    expect(error(parseTimestamp('1700000000000000'))).toContain('微秒或纳秒')
    expect(error(parseTimestamp('9999999999999', 's'))).toBe('超出可表示的时间范围')
  })

  it('detectUnit', () => {
    expect(detectUnit(1_700_000_000)).toBe('s')
    expect(detectUnit(T)).toBe('ms')
  })
})

describe('formatInZone', () => {
  it('北京时间', () => {
    expect(formatInZone(T, 'Asia/Shanghai')).toEqual({
      dateTime: '2023-11-15 06:13:20',
      weekday: '星期三',
      offset: 'UTC+08:00',
      iso: '2023-11-15T06:13:20+08:00',
    })
  })

  it('UTC 时间用 Z 结尾', () => {
    const info = formatInZone(T, 'UTC')
    expect(info.dateTime).toBe('2023-11-14 22:13:20')
    expect(info.offset).toBe('UTC+00:00')
    expect(info.iso).toBe('2023-11-14T22:13:20Z')
  })

  it('纽约冬令时为 UTC-05:00，夏令时为 UTC-04:00', () => {
    expect(formatInZone(T, 'America/New_York').offset).toBe('UTC-05:00')
    expect(formatInZone(Date.UTC(2024, 6, 1, 12), 'America/New_York').offset).toBe('UTC-04:00')
  })

  it('毫秒不为 0 时显示毫秒', () => {
    expect(formatInZone(T + 5, 'UTC').dateTime).toBe('2023-11-14 22:13:20.005')
  })

  it('1970 年以前的时间', () => {
    expect(formatInZone(-1000, 'UTC').dateTime).toBe('1969-12-31 23:59:59')
  })
})

describe('parseDateTime', () => {
  it('按指定时区解析当地时间', () => {
    expect(value(parseDateTime('2023-11-15 06:13:20', 'Asia/Shanghai'))).toBe(T)
    expect(value(parseDateTime('2023-11-14 22:13:20', 'UTC'))).toBe(T)
  })

  it('支持斜杠、省略秒、只有日期', () => {
    expect(value(parseDateTime('2023/11/15 06:13', 'Asia/Shanghai'))).toBe(T - 20_000)
    expect(value(parseDateTime('2023-11-15', 'Asia/Shanghai'))).toBe(Date.UTC(2023, 10, 14, 16))
  })

  it('支持毫秒与 T 分隔', () => {
    expect(value(parseDateTime('2023-11-14T22:13:20.5', 'UTC'))).toBe(T + 500)
  })

  it('夏令时期间按正确的偏移换算', () => {
    expect(value(parseDateTime('2024-07-01 12:00:00', 'America/New_York'))).toBe(Date.UTC(2024, 6, 1, 16))
    expect(value(parseDateTime('2024-01-01 12:00:00', 'America/New_York'))).toBe(Date.UTC(2024, 0, 1, 17))
  })

  it('自带时区的 ISO 8601 忽略所选时区', () => {
    expect(value(parseDateTime('2023-11-14T22:13:20Z', 'Asia/Tokyo'))).toBe(T)
    expect(value(parseDateTime('2023-11-15T06:13:20+08:00', 'UTC'))).toBe(T)
  })

  it('非法日期', () => {
    expect(error(parseDateTime('', 'UTC'))).toBe('请输入日期时间')
    expect(error(parseDateTime('hello', 'UTC'))).toContain('格式不正确')
    expect(error(parseDateTime('2023-13-01', 'UTC'))).toContain('月份')
    expect(error(parseDateTime('2023-02-30 10:00:00', 'UTC'))).toBe('2023 年 2 月没有 30 日')
    expect(error(parseDateTime('2023-02-01 24:00:00', 'UTC'))).toContain('时间超出范围')
  })

  it('与 formatInZone 互为逆运算', () => {
    const info = formatInZone(T + 123, 'Asia/Tokyo')
    expect(value(parseDateTime(info.dateTime, 'Asia/Tokyo'))).toBe(T + 123)
  })
})

describe('时区偏移与相对时间', () => {
  it('timeZoneOffset', () => {
    expect(timeZoneOffset(T, 'Asia/Shanghai')).toBe(8 * 3600 * 1000)
    expect(timeZoneOffset(T + 999, 'UTC')).toBe(0)
  })

  it('formatOffset', () => {
    expect(formatOffset(0)).toBe('UTC+00:00')
    expect(formatOffset(5.5 * 3600 * 1000)).toBe('UTC+05:30')
    expect(formatOffset(-4 * 3600 * 1000)).toBe('UTC-04:00')
  })

  it('formatRelative', () => {
    const now = T
    expect(formatRelative(now - 3 * 86400_000, now)).toMatch(/3\s?天前/)
    expect(formatRelative(now + 2 * 3600_000, now)).toMatch(/2\s?小时后/)
  })
})

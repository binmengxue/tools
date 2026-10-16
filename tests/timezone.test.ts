import { describe, expect, it } from 'vitest'
import {
  allTimeZones,
  canonicalZone,
  COMMON_TIME_ZONES,
  dayLabel,
  diffLabel,
  isDaytime,
  isValidTimeZone,
  searchZones,
  zoneClock,
  zoneLabel,
} from '../app/utils/tools/timezone'

const HOUR = 3_600_000

// 2023-11-14T22:13:20Z：北京 11-15 06:13，纽约 11-14 17:13（冬令时）
const T = 1_700_000_000_000

describe('时区名', () => {
  it('有效性', () => {
    expect(isValidTimeZone('Asia/Shanghai')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Base')).toBe(false)
  })

  it('新旧写法规范化后相同', () => {
    expect(canonicalZone('Asia/Calcutta')).toBe(canonicalZone('Asia/Kolkata'))
  })

  it('中文名：常用城市、旧写法、未收录的时区', () => {
    expect(zoneLabel('Asia/Shanghai')).toBe('北京 / 上海')
    expect(zoneLabel('Asia/Calcutta')).toBe('新德里 / 孟买')
    expect(zoneLabel('Asia/Kathmandu')).toBe('Kathmandu')
    expect(zoneLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires')
  })

  it('全部时区：常用城市在前且不重复', () => {
    const zones = allTimeZones()
    expect(zones.slice(0, COMMON_TIME_ZONES.length)).toEqual(COMMON_TIME_ZONES)
    const keys = zones.map(z => canonicalZone(z.value))
    expect(new Set(keys).size).toBe(keys.length)
    expect(zones.length).toBeGreaterThan(300)
  })
})

describe('searchZones', () => {
  it('按中文名搜索', () => {
    expect(searchZones('东京').map(z => z.value)).toEqual(['Asia/Tokyo'])
  })

  it('按 IANA 名搜索，大小写与空格不敏感', () => {
    expect(searchZones('new york').map(z => z.value)).toContain('America/New_York')
    expect(searchZones('KATHMANDU').length).toBeGreaterThan(0)
  })

  it('空搜索返回前若干个，找不到返回空', () => {
    expect(searchZones('', undefined, 5)).toHaveLength(5)
    expect(searchZones('不存在的城市')).toEqual([])
  })
})

describe('diffLabel 时差文案', () => {
  it('相同、快、慢', () => {
    expect(diffLabel(8 * HOUR, 8 * HOUR)).toBe('与本地时间相同')
    expect(diffLabel(9 * HOUR, 8 * HOUR)).toBe('比本地快 1 小时')
    expect(diffLabel(-5 * HOUR, 8 * HOUR)).toBe('比本地慢 13 小时')
  })

  it('半小时与 45 分钟时区', () => {
    expect(diffLabel(5.5 * HOUR, 8 * HOUR)).toBe('比本地慢 2 小时 30 分钟')
    expect(diffLabel(5.75 * HOUR, 5 * HOUR)).toBe('比本地快 45 分钟')
  })

  it('自定义基准名称', () => {
    expect(diffLabel(9 * HOUR, 8 * HOUR, '北京')).toBe('比北京快 1 小时')
  })
})

describe('日期与昼夜', () => {
  it('跨日期', () => {
    expect(dayLabel(T, 'Asia/Shanghai', 'America/New_York')).toBe('明天')
    expect(dayLabel(T, 'America/New_York', 'Asia/Shanghai')).toBe('昨天')
    expect(dayLabel(T, 'Asia/Tokyo', 'Asia/Shanghai')).toBe('')
  })

  it('昼夜', () => {
    expect(isDaytime(T, 'Asia/Shanghai')).toBe(true) // 06:13
    expect(isDaytime(T, 'Asia/Tokyo')).toBe(true) // 07:13
    expect(isDaytime(T, 'Europe/London')).toBe(false) // 22:13
  })
})

describe('zoneClock', () => {
  it('北京相对纽约', () => {
    expect(zoneClock(T, 'Asia/Shanghai', 'America/New_York')).toEqual({
      zone: 'Asia/Shanghai',
      label: '北京 / 上海',
      time: '06:13',
      seconds: '20',
      date: '2023-11-15',
      weekday: '星期三',
      offset: 'UTC+08:00',
      diff: '比本地快 13 小时',
      day: '明天',
      daytime: true,
    })
  })

  it('印度为 UTC+05:30', () => {
    const clock = zoneClock(T, 'Asia/Kolkata', 'Asia/Shanghai', '北京')
    expect(clock.offset).toBe('UTC+05:30')
    expect(clock.time).toBe('03:43')
    expect(clock.diff).toBe('比北京慢 2 小时 30 分钟')
  })

  it('夏令时：纽约夏天与北京差 12 小时，冬天差 13 小时', () => {
    const summer = Date.UTC(2024, 6, 1, 12)
    expect(zoneClock(summer, 'America/New_York', 'Asia/Shanghai', '北京').diff).toBe('比北京慢 12 小时')
    expect(zoneClock(T, 'America/New_York', 'Asia/Shanghai', '北京').diff).toBe('比北京慢 13 小时')
  })
})

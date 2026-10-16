/**
 * 时区转换（纯函数，配 Vitest 单测）
 * 时间计算复用 timestamp.ts；这里负责常用城市表、搜索、时差文案等。
 */
import { formatInZone, timeZoneOffset } from './timestamp'

export interface ZoneInfo {
  /** IANA 时区名，如 Asia/Shanghai */
  value: string
  /** 中文城市名 */
  label: string
}

/** 常用城市时区（时间戳工具与时区工具共用） */
export const COMMON_TIME_ZONES: ZoneInfo[] = [
  { value: 'Asia/Shanghai', label: '北京 / 上海' },
  { value: 'Asia/Hong_Kong', label: '香港' },
  { value: 'Asia/Macau', label: '澳门' },
  { value: 'Asia/Taipei', label: '台北' },
  { value: 'Asia/Tokyo', label: '东京' },
  { value: 'Asia/Seoul', label: '首尔' },
  { value: 'Asia/Singapore', label: '新加坡' },
  { value: 'Asia/Kuala_Lumpur', label: '吉隆坡' },
  { value: 'Asia/Bangkok', label: '曼谷' },
  { value: 'Asia/Ho_Chi_Minh', label: '胡志明市' },
  { value: 'Asia/Jakarta', label: '雅加达' },
  { value: 'Asia/Manila', label: '马尼拉' },
  { value: 'Asia/Kolkata', label: '新德里 / 孟买' },
  { value: 'Asia/Dubai', label: '迪拜' },
  { value: 'Europe/Moscow', label: '莫斯科' },
  { value: 'Europe/Istanbul', label: '伊斯坦布尔' },
  { value: 'Europe/London', label: '伦敦' },
  { value: 'Europe/Paris', label: '巴黎' },
  { value: 'Europe/Berlin', label: '柏林' },
  { value: 'Europe/Madrid', label: '马德里' },
  { value: 'Europe/Rome', label: '罗马' },
  { value: 'Europe/Amsterdam', label: '阿姆斯特丹' },
  { value: 'Africa/Cairo', label: '开罗' },
  { value: 'Africa/Johannesburg', label: '约翰内斯堡' },
  { value: 'America/New_York', label: '纽约' },
  { value: 'America/Chicago', label: '芝加哥' },
  { value: 'America/Denver', label: '丹佛' },
  { value: 'America/Los_Angeles', label: '洛杉矶 / 旧金山' },
  { value: 'America/Toronto', label: '多伦多' },
  { value: 'America/Vancouver', label: '温哥华' },
  { value: 'America/Mexico_City', label: '墨西哥城' },
  { value: 'America/Sao_Paulo', label: '圣保罗' },
  { value: 'Australia/Sydney', label: '悉尼' },
  { value: 'Australia/Melbourne', label: '墨尔本' },
  { value: 'Pacific/Auckland', label: '奥克兰' },
  { value: 'Pacific/Honolulu', label: '檀香山' },
  { value: 'UTC', label: 'UTC 协调世界时' },
]

/** 时区工具的默认城市（本地时区会自动加在最前面） */
export const DEFAULT_ZONES = ['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles']

/** 时区名是否有效 */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  }
  catch {
    return false
  }
}

const canonicalCache = new Map<string, string>()

/**
 * 规范化时区名。同一个时区可能有新旧两种写法（如 Asia/Kolkata 与 Asia/Calcutta），
 * 由浏览器解析后比较，才能正确去重和找到中文名。
 */
export function canonicalZone(zone: string): string {
  let canonical = canonicalCache.get(zone)
  if (!canonical) {
    try {
      canonical = new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone
    }
    catch {
      canonical = zone
    }
    canonicalCache.set(zone, canonical)
  }
  return canonical
}

/** 时区的中文名；不在常用表里时用 IANA 名的最后一段，如 Asia/Kathmandu → Kathmandu */
export function zoneLabel(zone: string): string {
  const key = canonicalZone(zone)
  const common = COMMON_TIME_ZONES.find(z => z.value === zone || canonicalZone(z.value) === key)
  if (common) return common.label
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ')
}

/**
 * 已改名城市的旧写法 → 新写法。
 * 浏览器的时区列表有时仍是旧名（如 Asia/Katmandu），换成新名后展示和搜索都更符合习惯。
 */
const MODERN_NAMES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Dacca': 'Asia/Dhaka',
  'Asia/Thimbu': 'Asia/Thimphu',
  'Asia/Ulan_Bator': 'Asia/Ulaanbaatar',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Godthab': 'America/Nuuk',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Enderbury': 'Pacific/Kanton',
}

/** 优先使用新写法（浏览器能识别时） */
function modernName(zone: string): string {
  const modern = MODERN_NAMES[zone]
  return modern && isValidTimeZone(modern) ? modern : zone
}

/** 全部可选时区：常用城市在前，其余按名称排序，重复的写法只保留一个 */
export function allTimeZones(): ZoneInfo[] {
  const supported: string[] = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone').map(modernName)
    : []
  const seen = new Set(COMMON_TIME_ZONES.map(z => canonicalZone(z.value)))
  const others: ZoneInfo[] = []
  for (const zone of supported) {
    const key = canonicalZone(zone)
    if (seen.has(key)) continue
    seen.add(key)
    others.push({ value: zone, label: zoneLabel(zone) })
  }
  others.sort((a, b) => a.value.localeCompare(b.value))
  return [...COMMON_TIME_ZONES, ...others]
}

/** 按中文城市名或 IANA 名搜索时区 */
export function searchZones(query: string, zones: ZoneInfo[] = allTimeZones(), limit = 20): ZoneInfo[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '_')
  if (!q) return zones.slice(0, limit)
  return zones
    .filter(z => z.label.toLowerCase().includes(q.replace(/_/g, ' ')) || z.value.toLowerCase().includes(q))
    .slice(0, limit)
}

/** 时长文案，如 13 小时、5 小时 30 分钟 */
function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `${h} 小时`
  return h === 0 ? `${m} 分钟` : `${h} 小时 ${m} 分钟`
}

/** 目标时区相对基准时区的时差文案，如「比本地快 1 小时」「比本地慢 13 小时」 */
export function diffLabel(targetOffsetMs: number, baseOffsetMs: number, baseName = '本地'): string {
  const minutes = Math.round((targetOffsetMs - baseOffsetMs) / 60000)
  if (minutes === 0) return `与${baseName}时间相同`
  return `比${baseName}${minutes > 0 ? '快' : '慢'} ${durationLabel(Math.abs(minutes))}`
}

/** 是否白天（6:00 ~ 18:00） */
export function isDaytime(ms: number, zone: string): boolean {
  const hour = Number(formatInZone(ms, zone).dateTime.slice(11, 13))
  return hour >= 6 && hour < 18
}

/** 目标时区的日期相对基准时区是「昨天」「明天」还是同一天（返回空字符串） */
export function dayLabel(ms: number, zone: string, baseZone: string): string {
  const day = (z: string) => {
    const d = formatInZone(ms, z).dateTime.slice(0, 10)
    return Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  }
  const diff = Math.round((day(zone) - day(baseZone)) / 86_400_000)
  if (diff === 0) return ''
  if (diff === 1) return '明天'
  if (diff === -1) return '昨天'
  return diff > 0 ? `${diff} 天后` : `${-diff} 天前`
}

export interface ZoneClock {
  zone: string
  label: string
  /** HH:mm */
  time: string
  /** 秒，两位 */
  seconds: string
  /** YYYY-MM-DD */
  date: string
  weekday: string
  offset: string
  diff: string
  day: string
  daytime: boolean
}

/** 某一时刻在目标时区的显示信息，时差与日期都相对 baseZone */
export function zoneClock(ms: number, zone: string, baseZone: string, baseName = '本地'): ZoneClock {
  const info = formatInZone(ms, zone)
  return {
    zone,
    label: zoneLabel(zone),
    time: info.dateTime.slice(11, 16),
    seconds: info.dateTime.slice(17, 19),
    date: info.dateTime.slice(0, 10),
    weekday: info.weekday,
    offset: info.offset,
    diff: diffLabel(timeZoneOffset(ms, zone), timeZoneOffset(ms, baseZone), baseName),
    day: dayLabel(ms, zone, baseZone),
    daytime: isDaytime(ms, zone),
  }
}

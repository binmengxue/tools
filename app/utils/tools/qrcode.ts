/**
 * 二维码生成的表单校验（纯函数，配 Vitest 单测）
 * 真正的绘制交给 qrcode 库，在页面里按需动态加载。
 */

export type ErrorLevel = 'L' | 'M' | 'Q' | 'H'

/** 各容错级别的说明（括号内为可恢复的损坏比例） */
export const ERROR_LEVELS: { value: ErrorLevel, label: string, desc: string }[] = [
  { value: 'L', label: '低', desc: '约 7%，内容最多' },
  { value: 'M', label: '中', desc: '约 15%，推荐' },
  { value: 'Q', label: '较高', desc: '约 25%' },
  { value: 'H', label: '高', desc: '约 30%，适合加 Logo 或印刷' },
]

/** 最大版本（40）二维码在字节模式下的容量（字节） */
export const MAX_BYTES: Record<ErrorLevel, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 }

/** 超过这个字节数时提示二维码会很密 */
export const DENSE_BYTES = 300

export interface QrValidation {
  /** 能否生成 */
  ok: boolean
  /** 阻止生成的错误 */
  error: string | null
  /** 不阻止生成的提醒 */
  warnings: string[]
  /** 内容的 UTF-8 字节数 */
  bytes: number
  /** 当前容错级别下的最大字节数 */
  maxBytes: number
}

/** UTF-8 字节数（一个汉字通常占 3 字节） */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

const SCHEME_RE = /^[a-z][a-z\d+.-]*:\/\//i
const DOMAIN_LIKE_RE = /^(?:www\.)?[a-z\d-]+(?:\.[a-z\d-]+)*\.[a-z]{2,}(?:[:/?#]\S*)?$/i

/** 检查网址格式，返回提醒；不像网址的普通文字返回 null */
export function checkUrl(text: string): string | null {
  const value = text.trim()
  if (/\s/.test(value)) return null
  if (SCHEME_RE.test(value)) {
    try {
      const url = new URL(value)
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname.includes('.') && url.hostname !== 'localhost') {
        return '网址里的域名看起来不完整，请检查是否漏了后缀（如 .com）'
      }
      return null
    }
    catch {
      return '网址格式可能有误，请检查后再生成'
    }
  }
  if (DOMAIN_LIKE_RE.test(value)) {
    return '看起来是网址，建议加上 https:// 开头，扫码后才能直接打开'
  }
  return null
}

/** 解析 #RRGGBB 颜色 */
function parseHex(hex: string): [number, number, number] | null {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!match) return null
  return [Number.parseInt(match[1]!, 16), Number.parseInt(match[2]!, 16), Number.parseInt(match[3]!, 16)]
}

/** 相对亮度（WCAG 定义） */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** 两种颜色的对比度（1 ~ 21），颜色格式不对时返回 null */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return null
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** 二维码要能被扫出来，前景色需要比背景色深，且对比度足够 */
export function checkColors(dark: string, light: string): string | null {
  const darkRgb = parseHex(dark)
  const lightRgb = parseHex(light)
  if (!darkRgb || !lightRgb) return '颜色格式不正确'
  if (luminance(darkRgb) >= luminance(lightRgb)) return '前景色比背景色浅，很多扫码软件无法识别，建议使用深色前景、浅色背景'
  const ratio = contrastRatio(dark, light)!
  if (ratio < 3) return '前景色与背景色对比度太低，可能无法扫描'
  return null
}

/** 校验二维码内容与颜色 */
export function validateQrInput(text: string, level: ErrorLevel, dark = '#000000', light = '#ffffff'): QrValidation {
  const bytes = utf8Bytes(text)
  const maxBytes = MAX_BYTES[level]
  const result: QrValidation = { ok: false, error: null, warnings: [], bytes, maxBytes }

  if (text.trim() === '') {
    result.error = '请输入要生成二维码的网址或文字'
    return result
  }
  if (bytes > maxBytes) {
    // 建议「比当前低、又能装下内容」的级别中最高的那个，尽量保留容错能力
    const order: ErrorLevel[] = ['L', 'M', 'Q', 'H']
    const lower = order.slice(0, order.indexOf(level)).reverse().find(l => MAX_BYTES[l] >= bytes)
    result.error = `内容过长：当前 ${bytes} 字节，容错级别「${level}」最多 ${maxBytes} 字节（一个汉字约占 3 字节）。`
      + (lower ? `可以把容错级别降到「${lower}」，或缩短内容。` : '请缩短内容。')
    return result
  }

  const urlWarning = checkUrl(text)
  if (urlWarning) result.warnings.push(urlWarning)
  if (bytes > DENSE_BYTES) result.warnings.push('内容较多，二维码会比较密，建议选择更大的尺寸，打印时也不要太小')
  const colorWarning = checkColors(dark, light)
  if (colorWarning) result.warnings.push(colorWarning)

  result.ok = true
  return result
}

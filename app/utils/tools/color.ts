/**
 * 颜色解析、格式互转、对比度与配色（纯函数，配 Vitest 单测）
 * 二维码工具的颜色对比度检查也复用这里的函数。
 */

/** r / g / b 取值 0 ~ 255，a 取值 0 ~ 1 */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export type Rgb = Omit<Rgba, 'a'>

/** h：0 ~ 360，s / l：0 ~ 100 */
export interface Hsl {
  h: number
  s: number
  l: number
}

/** h：0 ~ 360，s / v：0 ~ 100 */
export interface Hsv {
  h: number
  s: number
  v: number
}

/** 0 ~ 100 */
export interface Cmyk {
  c: number
  m: number
  y: number
  k: number
}

export type ParseColorResult
  = | { ok: true, color: Rgba }
    | { ok: false, error: string }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const round = (v: number, digits = 0) => {
  const f = 10 ** digits
  return Math.round(v * f) / f
}

/** 严格解析 #RRGGBB（二维码等只接受 6 位颜色的场景） */
export function parseHex(hex: string): Rgb | null {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!match) return null
  return { r: Number.parseInt(match[1]!, 16), g: Number.parseInt(match[2]!, 16), b: Number.parseInt(match[3]!, 16) }
}

/** 解析 0 ~ 255 的通道值，或百分比 */
function parseChannel(text: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)(%?)$/.exec(text)
  if (!m) return null
  const value = Number(m[1])
  // 先除再乘，避免 50 * 2.55 = 127.49999… 被舍入成 127
  const v = m[2] ? (value / 100) * 255 : value
  return v >= 0 && v <= 255.0001 ? clamp(v, 0, 255) : null
}

/** 解析 0 ~ 100 的百分比（百分号可省略） */
function parsePercent(text: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)%?$/.exec(text)
  if (!m) return null
  const v = Number(m[1])
  return v >= 0 && v <= 100 ? v : null
}

/** 解析透明度：0 ~ 1 的小数或百分比 */
function parseAlpha(text: string | undefined): number | null {
  if (text === undefined) return 1
  const m = /^(\d+(?:\.\d+)?|\.\d+)(%?)$/.exec(text)
  if (!m) return null
  const v = m[2] ? Number(m[1]) / 100 : Number(m[1])
  return v >= 0 && v <= 1 ? v : null
}

/** 解析色相，支持 deg 单位，结果归一到 0 ~ 360 */
function parseHue(text: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)(deg)?$/.exec(text)
  if (!m) return null
  return ((Number(m[1]) % 360) + 360) % 360
}

/** 拆分函数参数：兼容逗号分隔、空格分隔和 / 透明度写法 */
function splitArgs(inner: string): string[] {
  return inner.trim().split(/\s*[,/]\s*|\s+/).filter(Boolean)
}

/**
 * 解析颜色文本。
 * 支持 #rgb、#rgba、#rrggbb、#rrggbbaa（# 可省略）、rgb() / rgba()、hsl() / hsla()。
 */
export function parseColor(input: string): ParseColorResult {
  const text = input.trim().toLowerCase()
  if (!text) return { ok: false, error: '请输入颜色' }

  const hex = /^#?([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(text)
  if (hex) {
    let digits = hex[1]!
    if (digits.length <= 4) digits = digits.split('').map(d => d + d).join('')
    const n = (i: number) => Number.parseInt(digits.slice(i, i + 2), 16)
    return { ok: true, color: { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? round(n(6) / 255, 3) : 1 } }
  }

  const rgb = /^rgba?\((.*)\)$/.exec(text)
  if (rgb) {
    const args = splitArgs(rgb[1]!)
    if (args.length !== 3 && args.length !== 4) return { ok: false, error: 'rgb() 需要 3 个数值，例如 rgb(91, 79, 224)' }
    const [r, g, b] = args.slice(0, 3).map(parseChannel)
    const a = parseAlpha(args[3])
    if (r == null || g == null || b == null) return { ok: false, error: 'RGB 数值应在 0 ~ 255 之间' }
    if (a == null) return { ok: false, error: '透明度应在 0 ~ 1 之间' }
    return { ok: true, color: { r: Math.round(r), g: Math.round(g), b: Math.round(b), a } }
  }

  const hsl = /^hsla?\((.*)\)$/.exec(text)
  if (hsl) {
    const args = splitArgs(hsl[1]!)
    if (args.length !== 3 && args.length !== 4) return { ok: false, error: 'hsl() 需要 3 个数值，例如 hsl(245, 70%, 59%)' }
    const h = parseHue(args[0]!)
    const s = parsePercent(args[1]!)
    const l = parsePercent(args[2]!)
    const a = parseAlpha(args[3])
    if (h == null) return { ok: false, error: '色相应为数字（可带 deg）' }
    if (s == null || l == null) return { ok: false, error: '饱和度和亮度应在 0% ~ 100% 之间' }
    if (a == null) return { ok: false, error: '透明度应在 0 ~ 1 之间' }
    return { ok: true, color: { ...hslToRgb({ h, s, l }), a } }
  }

  return { ok: false, error: '无法识别的颜色格式，支持 #5b4fe0、rgb(91, 79, 224)、hsl(245, 70%, 59%)' }
}

const hex2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')

/** 转为 HEX；透明度不为 1 时输出 8 位 */
export function toHex(color: Rgb | Rgba): string {
  const a = 'a' in color ? color.a : 1
  return `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}${a < 1 ? hex2(a * 255) : ''}`
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1]
    = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = ln - c / 2
  return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) }
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const { h } = rgbToHsl({ r, g, b })
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  return { h, s: max === 0 ? 0 : ((max - min) / max) * 100, v: max * 100 }
}

export function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
  const k = 1 - Math.max(r, g, b) / 255
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 }
  const f = (v: number) => ((1 - v / 255 - k) / (1 - k)) * 100
  return { c: f(r), m: f(g), y: f(b), k: k * 100 }
}

/** 各种格式的文本表示，用于展示和复制 */
export function formatColor(color: Rgba) {
  const hsl = rgbToHsl(color)
  const hsv = rgbToHsv(color)
  const cmyk = rgbToCmyk(color)
  const alpha = color.a < 1 ? round(color.a, 2) : null
  const H = round(hsl.h)
  return {
    hex: toHex(color).toUpperCase(),
    rgb: alpha === null ? `rgb(${color.r}, ${color.g}, ${color.b})` : `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`,
    hsl: alpha === null
      ? `hsl(${H}, ${round(hsl.s)}%, ${round(hsl.l)}%)`
      : `hsla(${H}, ${round(hsl.s)}%, ${round(hsl.l)}%, ${alpha})`,
    hsv: `hsv(${round(hsv.h)}, ${round(hsv.s)}%, ${round(hsv.v)}%)`,
    cmyk: `cmyk(${round(cmyk.c)}%, ${round(cmyk.m)}%, ${round(cmyk.y)}%, ${round(cmyk.k)}%)`,
  }
}

/** 相对亮度（WCAG 定义，0 ~ 1） */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** 两种颜色的对比度（1 ~ 21） */
export function contrastBetween(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

export type WcagGrade = 'AAA' | 'AA' | '不达标'

/** WCAG 2 对比度等级：普通文字 AA ≥ 4.5、AAA ≥ 7；大字（≥ 18pt 或 14pt 粗体）AA ≥ 3、AAA ≥ 4.5 */
export function wcagLevel(ratio: number): { normal: WcagGrade, large: WcagGrade } {
  const grade = (aa: number, aaa: number): WcagGrade => (ratio >= aaa ? 'AAA' : ratio >= aa ? 'AA' : '不达标')
  return { normal: grade(4.5, 7), large: grade(3, 4.5) }
}

/** 颜色较浅时适合配深色文字 */
export function isLight(color: Rgb): boolean {
  return contrastBetween(color, { r: 0, g: 0, b: 0 }) > contrastBetween(color, { r: 255, g: 255, b: 255 })
}

/** 同色相、同饱和度的 10 级深浅（50 ~ 900，数字越大越深） */
export function shades(color: Rgb): { label: string, hex: string }[] {
  const { h, s } = rgbToHsl(color)
  const levels: [string, number][] = [
    ['50', 96], ['100', 90], ['200', 80], ['300', 70], ['400', 60],
    ['500', 50], ['600', 40], ['700', 30], ['800', 20], ['900', 12],
  ]
  return levels.map(([label, l]) => ({ label, hex: toHex(hslToRgb({ h, s, l })) }))
}

/** 常见配色方案：互补色、类似色、三角配色、分裂互补色 */
export function harmonies(color: Rgb): { name: string, colors: string[] }[] {
  const { h, s, l } = rgbToHsl(color)
  const rotate = (deg: number) => toHex(hslToRgb({ h: h + deg, s, l }))
  const self = toHex(color)
  return [
    { name: '互补色', colors: [self, rotate(180)] },
    { name: '类似色', colors: [rotate(-30), self, rotate(30)] },
    { name: '三角配色', colors: [self, rotate(120), rotate(240)] },
    { name: '分裂互补色', colors: [self, rotate(150), rotate(210)] },
  ]
}

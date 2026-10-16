/**
 * 图片压缩的纯函数部分（尺寸、格式、大小计算），配 Vitest 单测。
 * 真正的解码与编码在页面里用 Canvas 完成。
 */

export type OutputFormat = 'original' | 'jpeg' | 'webp' | 'png'

export const OUTPUT_FORMATS: { value: OutputFormat, label: string }[] = [
  { value: 'original', label: '保持原格式' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
  { value: 'png', label: 'PNG' },
]

/** 可以读取的图片类型（GIF 只取第一帧） */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']

/** 单张图片的大小上限，避免一次解码过大的图片导致页面卡死 */
export const MAX_FILE_SIZE = 30 * 1024 * 1024

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** 校验文件，返回错误信息；可以处理时返回 null */
export function validateImageFile(file: { type: string, size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return '不支持的格式，请选择 JPG、PNG、WebP、GIF 或 BMP 图片'
  if (file.size === 0) return '文件是空的'
  if (file.size > MAX_FILE_SIZE) return `图片超过 ${formatBytes(MAX_FILE_SIZE)}，请先用其他工具缩小后再压缩`
  return null
}

/** 输出的 MIME 类型：保持原格式时，JPG / PNG / WebP 不变，GIF、BMP 转为 JPG */
export function resolveOutputType(inputType: string, format: OutputFormat): string {
  if (format !== 'original') return `image/${format}`
  return EXTENSIONS[inputType] ? inputType : 'image/jpeg'
}

/** 该格式是否支持调节质量（PNG 是无损格式，质量参数无效） */
export function supportsQuality(type: string): boolean {
  return type === 'image/jpeg' || type === 'image/webp'
}

/**
 * 按最大宽度 / 高度等比缩小，不会放大；不限制时传 0。
 */
export function fitSize(width: number, height: number, maxWidth = 0, maxHeight = 0): { width: number, height: number } {
  let scale = 1
  if (maxWidth > 0 && width > maxWidth) scale = Math.min(scale, maxWidth / width)
  if (maxHeight > 0 && height > maxHeight) scale = Math.min(scale, maxHeight / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** 字节数转为易读的大小，如 1.25 MB */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unit]}`
}

/** 节省的比例（百分比，保留 1 位小数）；压缩后更大时为负数 */
export function savedPercent(original: number, compressed: number): number {
  if (original <= 0) return 0
  return Math.round((1 - compressed / original) * 1000) / 10
}

/** 输出文件名：photo.png → photo-compressed.webp */
export function outputFilename(name: string, type: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'image'
  const ext = EXTENSIONS[type] ?? 'jpg'
  return `${base}-compressed.${ext}`
}

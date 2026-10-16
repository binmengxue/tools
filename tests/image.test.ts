import { describe, expect, it } from 'vitest'
import {
  fitSize,
  formatBytes,
  MAX_FILE_SIZE,
  outputFilename,
  resolveOutputType,
  savedPercent,
  supportsQuality,
  validateImageFile,
} from '../app/utils/tools/image'

describe('fitSize', () => {
  it('不限制时保持原尺寸', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 4000, height: 3000 })
  })

  it('按最大宽度等比缩小', () => {
    expect(fitSize(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 })
  })

  it('同时限制宽高时取更严格的比例', () => {
    expect(fitSize(1000, 4000, 1920, 1000)).toEqual({ width: 250, height: 1000 })
  })

  it('不会放大小图', () => {
    expect(fitSize(800, 600, 1920)).toEqual({ width: 800, height: 600 })
  })

  it('最小为 1 像素', () => {
    expect(fitSize(10000, 1, 100)).toEqual({ width: 100, height: 1 })
  })
})

describe('formatBytes', () => {
  it('不同量级', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.50 KB')
    expect(formatBytes(350 * 1024)).toBe('350 KB')
    expect(formatBytes(1.25 * 1024 * 1024)).toBe('1.25 MB')
    expect(formatBytes(12.5 * 1024 * 1024)).toBe('12.5 MB')
  })
})

describe('savedPercent', () => {
  it('计算节省比例', () => {
    expect(savedPercent(1000, 250)).toBe(75)
    expect(savedPercent(3, 2)).toBe(33.3)
  })

  it('压缩后更大时为负数', () => {
    expect(savedPercent(100, 120)).toBe(-20)
  })

  it('原始大小为 0 时返回 0', () => {
    expect(savedPercent(0, 10)).toBe(0)
  })
})

describe('输出格式与文件名', () => {
  it('保持原格式', () => {
    expect(resolveOutputType('image/png', 'original')).toBe('image/png')
    expect(resolveOutputType('image/webp', 'original')).toBe('image/webp')
    expect(resolveOutputType('image/gif', 'original')).toBe('image/jpeg')
  })

  it('指定格式', () => {
    expect(resolveOutputType('image/png', 'webp')).toBe('image/webp')
    expect(resolveOutputType('image/jpeg', 'png')).toBe('image/png')
  })

  it('只有 JPG 和 WebP 支持调节质量', () => {
    expect(supportsQuality('image/jpeg')).toBe(true)
    expect(supportsQuality('image/webp')).toBe(true)
    expect(supportsQuality('image/png')).toBe(false)
  })

  it('文件名', () => {
    expect(outputFilename('photo.PNG', 'image/webp')).toBe('photo-compressed.webp')
    expect(outputFilename('my.trip.jpg', 'image/jpeg')).toBe('my.trip-compressed.jpg')
    expect(outputFilename('.png', 'image/png')).toBe('image-compressed.png')
  })
})

describe('validateImageFile', () => {
  it('支持的图片', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })

  it('不支持的格式', () => {
    expect(validateImageFile({ type: 'image/svg+xml', size: 1000 })).toContain('不支持')
    expect(validateImageFile({ type: 'application/pdf', size: 1000 })).toContain('不支持')
  })

  it('空文件与超大文件', () => {
    expect(validateImageFile({ type: 'image/png', size: 0 })).toBe('文件是空的')
    expect(validateImageFile({ type: 'image/png', size: MAX_FILE_SIZE + 1 })).toContain('超过')
  })
})

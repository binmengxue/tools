import { describe, expect, it } from 'vitest'
import { checkColors, checkUrl, contrastRatio, MAX_BYTES, utf8Bytes, validateQrInput } from '../app/utils/tools/qrcode'

describe('utf8Bytes', () => {
  it('英文 1 字节，汉字 3 字节', () => {
    expect(utf8Bytes('abc')).toBe(3)
    expect(utf8Bytes('二维码')).toBe(9)
  })
})

describe('validateQrInput', () => {
  it('空内容不能生成', () => {
    const r = validateQrInput('   ', 'M')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('请输入')
  })

  it('普通文字可以生成，且没有提醒', () => {
    const r = validateQrInput('你好，轻工具箱', 'M')
    expect(r.ok).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it('超出容量时报错，并建议降低容错级别', () => {
    const text = 'a'.repeat(MAX_BYTES.H + 1)
    const r = validateQrInput(text, 'H')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('内容过长')
    expect(r.error).toContain('「Q」')
  })

  it('超过最低容错级别的容量时，只提示缩短内容', () => {
    const r = validateQrInput('a'.repeat(MAX_BYTES.L + 1), 'L')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('请缩短内容')
  })

  it('汉字按 3 字节计算容量', () => {
    // 425 个汉字 = 1275 字节，超过 H 级的 1273 字节
    expect(validateQrInput('码'.repeat(425), 'H').ok).toBe(false)
    expect(validateQrInput('码'.repeat(424), 'H').ok).toBe(true)
  })

  it('内容较多时提醒二维码会很密', () => {
    const r = validateQrInput('a'.repeat(400), 'M')
    expect(r.ok).toBe(true)
    expect(r.warnings.some(w => w.includes('比较密'))).toBe(true)
  })

  it('颜色对比度不足时提醒', () => {
    const r = validateQrInput('hello', 'M', '#cccccc', '#ffffff')
    expect(r.ok).toBe(true)
    expect(r.warnings.some(w => w.includes('对比度'))).toBe(true)
  })
})

describe('checkUrl', () => {
  it('完整的网址没有提醒', () => {
    expect(checkUrl('https://tools.sheyinglai.top/json-formatter?a=1')).toBeNull()
    expect(checkUrl('http://localhost:3000')).toBeNull()
  })

  it('缺少 https:// 的网址给出建议', () => {
    expect(checkUrl('tools.sheyinglai.top')).toContain('https://')
    expect(checkUrl('www.example.com/path')).toContain('https://')
  })

  it('域名不完整', () => {
    expect(checkUrl('https://example')).toContain('域名')
  })

  it('格式错误的网址', () => {
    expect(checkUrl('https://exa mple.com')).toBeNull() // 含空格，视为普通文字
    expect(checkUrl('http://[bad')).toContain('格式可能有误')
  })

  it('普通文字不提醒', () => {
    expect(checkUrl('你好')).toBeNull()
    expect(checkUrl('hello world')).toBeNull()
    expect(checkUrl('v1.0')).toBeNull()
  })
})

describe('颜色检查', () => {
  it('黑白对比度为 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('格式错误返回 null', () => {
    expect(contrastRatio('red', '#ffffff')).toBeNull()
  })

  it('深色前景 + 浅色背景没有问题', () => {
    expect(checkColors('#1f2133', '#ffffff')).toBeNull()
  })

  it('前景色比背景色浅', () => {
    expect(checkColors('#ffffff', '#000000')).toContain('前景色比背景色浅')
  })

  it('对比度太低', () => {
    expect(checkColors('#999999', '#aaaaaa')).toContain('对比度太低')
  })
})

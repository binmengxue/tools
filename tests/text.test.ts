import { describe, expect, it } from 'vitest'
import { CLEAN_ORDER, cleanText, countText, SAMPLE_TEXT, splitGraphemes } from '../app/utils/tools/text'

describe('countText 字数统计', () => {
  it('空文本全部为 0', () => {
    expect(countText('')).toEqual({
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
      chinese: 0,
      englishWords: 0,
      numbers: 0,
      punctuation: 0,
      lines: 0,
      paragraphs: 0,
      bytes: 0,
    })
  })

  it('纯英文', () => {
    const s = countText('Hello world')
    expect(s.englishWords).toBe(2)
    expect(s.words).toBe(2)
    expect(s.characters).toBe(11)
    expect(s.charactersNoSpaces).toBe(10)
  })

  it('纯中文：标点不计入字数，但计入字符数', () => {
    const s = countText('你好，世界！')
    expect(s.chinese).toBe(4)
    expect(s.words).toBe(4)
    expect(s.punctuation).toBe(2)
    expect(s.characters).toBe(6)
  })

  it('中英文与数字混排', () => {
    const s = countText('我有 3 个 apple 和 2.5 kg')
    expect(s.chinese).toBe(4)
    expect(s.englishWords).toBe(2)
    expect(s.numbers).toBe(2)
    expect(s.words).toBe(8)
  })

  it('英文缩写和连字符算一个单词', () => {
    expect(countText('don’t stop well-known').englishWords).toBe(3)
  })

  it('全角字母、全角数字和带重音的字母也能统计', () => {
    const s = countText('Ｈｅｌｌｏ Ｗｏｒｌｄ 版本 ２.０ café')
    expect(s.englishWords).toBe(3)
    expect(s.numbers).toBe(1)
  })

  it('emoji 按字形计数', () => {
    expect(countText('👍🏻👨‍👩‍👧').characters).toBe(2)
    expect(splitGraphemes('a👍🏻b')).toEqual(['a', '👍🏻', 'b'])
  })

  it('行数与段落数（段落为非空行）', () => {
    const s = countText('第一段\n\n第二段\n   \n第三段')
    expect(s.lines).toBe(5)
    expect(s.paragraphs).toBe(3)
  })

  it('只有空白时段落数为 0', () => {
    const s = countText('  \n\t\n ')
    expect(s.paragraphs).toBe(0)
    expect(s.charactersNoSpaces).toBe(0)
    expect(s.words).toBe(0)
  })

  it('兼容 \\r\\n 换行', () => {
    expect(countText('a\r\nb').lines).toBe(2)
  })

  it('UTF-8 字节数', () => {
    expect(countText('中a').bytes).toBe(4)
  })
})

describe('cleanText 文本清洗', () => {
  it('去除空行（含只有空白的行）', () => {
    expect(cleanText('a\n\n  \nb\n', ['removeEmptyLines'])).toBe('a\nb')
  })

  it('去除每行首尾空格', () => {
    expect(cleanText('  a  \n\tb\t', ['trimLines'])).toBe('a\nb')
  })

  it('合并重复空格，不影响换行', () => {
    expect(cleanText('a    b\t\tc　　d\n\ne', ['collapseSpaces'])).toBe('a b c d\n\ne')
  })

  it('全角字母、数字、空格转半角，中文标点不变', () => {
    expect(cleanText('Ｈｅｌｌｏ　２０２６，你好！', ['toHalfWidth'])).toBe('Hello 2026，你好！')
  })

  it('统一换行符', () => {
    expect(cleanText('a\r\nb\rc', [])).toBe('a\nb\nc')
  })

  it('全部执行', () => {
    const cleaned = cleanText(SAMPLE_TEXT, CLEAN_ORDER)
    expect(cleaned).toBe([
      '轻工具箱是一个无需注册、打开即用的中文在线工具网站。',
      '它提供 JSON 格式化、文本对比、字数统计等 6 个工具， 所有数据都在浏览器本地处理。',
      'Hello World！Version 2.0 is coming soon 🎉',
      '欢迎使用，也欢迎反馈建议。',
    ].join('\n'))
  })

  it('没有需要处理的内容时原样返回', () => {
    expect(cleanText('abc', CLEAN_ORDER)).toBe('abc')
  })
})

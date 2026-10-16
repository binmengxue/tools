/**
 * 字数统计与文本清洗（纯函数，配 Vitest 单测）
 */

export interface TextStats {
  /** 字数：中文字符 + 英文单词 + 数字（与 Word 等软件的「字数」口径接近） */
  words: number
  /** 字符数（按用户看到的字形计算，一个 emoji 算 1 个） */
  characters: number
  /** 字符数，不含空白 */
  charactersNoSpaces: number
  /** 中文字符数（汉字，不含标点） */
  chinese: number
  /** 英文单词数 */
  englishWords: number
  /** 数字个数（连续的数字算 1 个，如 2.5） */
  numbers: number
  /** 标点符号数（中英文） */
  punctuation: number
  /** 行数 */
  lines: number
  /** 段落数（非空行的数量） */
  paragraphs: number
  /** UTF-8 字节数 */
  bytes: number
}

const HAN_RE = /\p{Script=Han}/gu
// 拉丁字母（含全角字母与 é 等带重音字母）组成的单词，缩写和连字符算一个词
const ENGLISH_WORD_RE = /\p{Script=Latin}+(?:['’-]\p{Script=Latin}+)*/gu
// 数字（含全角数字），小数算一个
const NUMBER_RE = /\p{Nd}+(?:[.．]\p{Nd}+)?/gu
const PUNCTUATION_RE = /\p{P}/gu
const WHITESPACE_RE = /^\s+$/u

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0
}

/** 拆分为字形（用户感知的字符），不支持 Intl.Segmenter 时退回按码点拆分 */
export function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' })
    return Array.from(segmenter.segment(text), s => s.segment)
  }
  return Array.from(text)
}

/** 统计文本 */
export function countText(text: string): TextStats {
  const graphemes = splitGraphemes(text)
  const chinese = countMatches(text, HAN_RE)
  const englishWords = countMatches(text, ENGLISH_WORD_RE)
  const numbers = countMatches(text, NUMBER_RE)
  const lineList = text === '' ? [] : text.split(/\r?\n/)
  return {
    words: chinese + englishWords + numbers,
    characters: graphemes.length,
    charactersNoSpaces: graphemes.filter(g => !WHITESPACE_RE.test(g)).length,
    chinese,
    englishWords,
    numbers,
    punctuation: countMatches(text, PUNCTUATION_RE),
    lines: lineList.length,
    paragraphs: lineList.filter(line => line.trim() !== '').length,
    bytes: new TextEncoder().encode(text).length,
  }
}

export type CleanOperation = 'removeEmptyLines' | 'trimLines' | 'collapseSpaces' | 'toHalfWidth'

/** 全部执行时的顺序：先转半角（全角空格变普通空格），再合并空格、去首尾空格，最后删空行 */
export const CLEAN_ORDER: CleanOperation[] = ['toHalfWidth', 'collapseSpaces', 'trimLines', 'removeEmptyLines']

/** 全角字母、数字、空格转半角；中文标点保持不变 */
function toHalfWidth(text: string): string {
  return text.replace(/[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\u3000]/g, (ch) => {
    if (ch === '\u3000') return ' '
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  })
}

function applyOperation(text: string, operation: CleanOperation): string {
  switch (operation) {
    case 'removeEmptyLines':
      return text.split('\n').filter(line => line.trim() !== '').join('\n')
    case 'trimLines':
      return text.split('\n').map(line => line.trim()).join('\n')
    case 'collapseSpaces':
      // 连续的空格、Tab、全角空格合并为一个普通空格，不影响换行
      return text.replace(/[ \t\u3000]{2,}/g, ' ')
    case 'toHalfWidth':
      return toHalfWidth(text)
  }
}

/** 按顺序执行若干清洗操作；统一换行符为 \n */
export function cleanText(text: string, operations: CleanOperation[]): string {
  let result = text.replace(/\r\n?/g, '\n')
  for (const operation of operations) result = applyOperation(result, operation)
  return result
}

/** 页面上的示例文本 */
export const SAMPLE_TEXT = `  轻工具箱是一个无需注册、打开即用的中文在线工具网站。


它提供 JSON 格式化、文本对比、字数统计等 6 个工具，   所有数据都在浏览器本地处理。
Ｈｅｌｌｏ\u3000Ｗｏｒｌｄ！Version ２.０ is coming soon 🎉

  欢迎使用，也欢迎反馈建议。  `

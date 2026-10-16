/**
 * JSON 格式化 / 压缩 / 校验（纯函数，配 Vitest 单测）
 *
 * 没有直接用 JSON.parse，而是手写了一个严格的 JSON 解析器：
 * - 出错时能给出准确的行号、列号和中文提示（各浏览器 JSON.parse 的报错格式不统一，Safari 甚至没有位置）
 * - 数字按原文保留，超出 Number 精度的大整数不会被改写（如 12345678901234567890）
 * - 字符串按原文保留转义写法，重复的键也原样保留
 */

/** 解析得到的语法树节点 */
export type JsonNode
  = | { type: 'object', entries: JsonEntry[] }
    | { type: 'array', items: JsonNode[] }
    | { type: 'string', raw: string }
    | { type: 'number', raw: string }
    | { type: 'literal', raw: 'true' | 'false' | 'null' }

export interface JsonEntry {
  /** 键的原文（含双引号） */
  key: string
  value: JsonNode
}

export interface JsonErrorInfo {
  message: string
  /** 出错位置（字符下标），无法定位时为 null */
  position: number | null
  /** 行号（从 1 开始），无法定位时为 null */
  line: number | null
  /** 列号（从 1 开始），无法定位时为 null */
  column: number | null
}

export type JsonResult
  = | { ok: true, output: string }
    | { ok: false, error: JsonErrorInfo }

export interface FormatOptions {
  /** 缩进：空格数或 Tab，默认 2 */
  indent?: number | 'tab'
  /** 是否按键名排序 */
  sortKeys?: boolean
}

/** 带位置信息的语法错误 */
export class JsonSyntaxError extends Error {
  readonly position: number
  readonly line: number
  readonly column: number

  constructor(message: string, position: number, source: string) {
    super(message)
    this.name = 'JsonSyntaxError'
    this.position = position
    const { line, column } = positionToLineColumn(source, position)
    this.line = line
    this.column = column
  }
}

/** 字符下标转行号、列号（均从 1 开始） */
export function positionToLineColumn(source: string, position: number): { line: number, column: number } {
  let line = 1
  let lineStart = 0
  const end = Math.min(position, source.length)
  for (let i = 0; i < end; i++) {
    if (source.charCodeAt(i) === 10) {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: position - lineStart + 1 }
}

/** 报错信息里展示的字符 */
function describe(char: string): string {
  return `「${char}」`
}

const NUMBER_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const WORD_RE = /[A-Za-z_$][\w$]*/y
const HEX4_RE = /^[0-9a-fA-F]{4}$/

class Parser {
  private i = 0

  constructor(private readonly s: string) {}

  parseRoot(): JsonNode {
    this.skipWhitespace()
    if (this.i >= this.s.length) this.fail('内容为空')
    const value = this.parseValue()
    this.skipWhitespace()
    if (this.i < this.s.length) {
      if (this.s[this.i] === '/') this.fail('JSON 不支持注释')
      this.fail(`JSON 已经结束，后面还有多余内容 ${describe(this.s[this.i]!)}`)
    }
    return value
  }

  private fail(message: string, position = this.i): never {
    throw new JsonSyntaxError(message, position, this.s)
  }

  private skipWhitespace() {
    const s = this.s
    while (this.i < s.length) {
      const c = s.charCodeAt(this.i)
      // 空格、Tab、换行、回车
      if (c === 32 || c === 9 || c === 10 || c === 13) this.i++
      else break
    }
  }

  private parseValue(): JsonNode {
    const c = this.s[this.i]
    if (c === '{') return this.parseObject()
    if (c === '[') return this.parseArray()
    if (c === '"') return { type: 'string', raw: this.parseStringRaw() }
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return this.parseNumber()
    if (c === undefined) this.fail('意外的结尾，JSON 不完整')
    if (c === '\'') this.fail('字符串必须使用双引号，不能用单引号')
    if (c === '/') this.fail('JSON 不支持注释')
    if (/[A-Za-z_$]/.test(c)) return this.parseWord()
    return this.fail(`意外的字符 ${describe(c)}`)
  }

  /** true / false / null，以及常见的非法写法提示 */
  private parseWord(): JsonNode {
    WORD_RE.lastIndex = this.i
    const word = WORD_RE.exec(this.s)![0]
    if (word === 'true' || word === 'false' || word === 'null') {
      this.i += word.length
      return { type: 'literal', raw: word }
    }
    const lower = word.toLowerCase()
    if (lower === 'true' || lower === 'false' || lower === 'null') {
      this.fail(`${word} 必须小写为 ${lower}`)
    }
    if (word === 'None') this.fail('JSON 中空值写作 null，不是 None')
    if (word === 'NaN' || word === 'Infinity' || word === 'undefined') {
      this.fail(`JSON 不支持 ${word}`)
    }
    return this.fail(`意外的内容 ${describe(word)}，字符串需要用双引号包裹`)
  }

  private parseObject(): JsonNode {
    this.i++ // 跳过 {
    const entries: JsonEntry[] = []
    this.skipWhitespace()
    if (this.s[this.i] === '}') {
      this.i++
      return { type: 'object', entries }
    }
    for (;;) {
      this.skipWhitespace()
      const c = this.s[this.i]
      if (c !== '"') {
        if (c === undefined) this.fail('意外的结尾，对象缺少 }')
        if (c === '}') this.fail('} 前面有多余的逗号')
        if (c === '\'') this.fail('键名必须使用双引号，不能用单引号')
        if (c === '/') this.fail('JSON 不支持注释')
        this.fail(`键名必须是双引号包裹的字符串，这里是 ${describe(c)}`)
      }
      const key = this.parseStringRaw()
      this.skipWhitespace()
      if (this.s[this.i] !== ':') {
        if (this.s[this.i] === undefined) this.fail('意外的结尾，键名后缺少冒号 :')
        this.fail('键名后缺少冒号 :')
      }
      this.i++
      this.skipWhitespace()
      entries.push({ key, value: this.parseValue() })
      this.skipWhitespace()
      const next = this.s[this.i]
      if (next === ',') {
        this.i++
        continue
      }
      if (next === '}') {
        this.i++
        return { type: 'object', entries }
      }
      if (next === undefined) this.fail('意外的结尾，对象缺少 }')
      if (next === '/') this.fail('JSON 不支持注释')
      this.fail(`缺少逗号 , 或 }，这里是 ${describe(next)}`)
    }
  }

  private parseArray(): JsonNode {
    this.i++ // 跳过 [
    const items: JsonNode[] = []
    this.skipWhitespace()
    if (this.s[this.i] === ']') {
      this.i++
      return { type: 'array', items }
    }
    for (;;) {
      this.skipWhitespace()
      if (this.s[this.i] === ']') this.fail('] 前面有多余的逗号')
      items.push(this.parseValue())
      this.skipWhitespace()
      const next = this.s[this.i]
      if (next === ',') {
        this.i++
        continue
      }
      if (next === ']') {
        this.i++
        return { type: 'array', items }
      }
      if (next === undefined) this.fail('意外的结尾，数组缺少 ]')
      if (next === '/') this.fail('JSON 不支持注释')
      this.fail(`缺少逗号 , 或 ]，这里是 ${describe(next)}`)
    }
  }

  /** 读取字符串原文（含两侧双引号），只校验不解码 */
  private parseStringRaw(): string {
    const s = this.s
    const start = this.i
    this.i++ // 跳过开头的 "
    for (;;) {
      if (this.i >= s.length) this.fail('字符串缺少结束的双引号', start)
      const c = s.charCodeAt(this.i)
      if (c === 34) {
        this.i++
        return s.slice(start, this.i)
      }
      if (c === 92) {
        const escape = s[this.i + 1]
        if (escape === undefined) this.fail('字符串缺少结束的双引号', start)
        if ('"\\/bfnrt'.includes(escape)) {
          this.i += 2
        }
        else if (escape === 'u') {
          if (!HEX4_RE.test(s.slice(this.i + 2, this.i + 6))) {
            this.fail('无效的 \\u 转义，需要 4 位十六进制数字')
          }
          this.i += 6
        }
        else {
          this.fail(`无效的转义字符 \\${escape}`)
        }
        continue
      }
      if (c < 0x20) {
        this.fail(c === 10 ? '字符串中不能直接换行，请写成 \\n（也可能是缺少结束的双引号）' : '字符串中不能包含未转义的控制字符')
      }
      this.i++
    }
  }

  private parseNumber(): JsonNode {
    NUMBER_RE.lastIndex = this.i
    const match = NUMBER_RE.exec(this.s)
    if (!match) this.fail('无效的数字')
    const raw = match[0]
    const after = this.s[this.i + raw.length]
    if (after !== undefined) {
      if (raw.replace('-', '') === '0' && after >= '0' && after <= '9') this.fail('数字不能以 0 开头')
      if (after === '.') this.fail('小数点后必须有数字', this.i + raw.length)
      if (/[\w$]/.test(after)) this.fail('无效的数字', this.i + raw.length)
    }
    this.i += raw.length
    return { type: 'number', raw }
  }
}

/** 解析 JSON 文本，出错时抛出 JsonSyntaxError */
export function parseJson(text: string): JsonNode {
  return new Parser(text).parseRoot()
}

/** 把语法树重新输出为文本；indentUnit 为空字符串时输出压缩格式 */
export function stringifyNode(node: JsonNode, indentUnit: string, sortKeys = false): string {
  const pretty = indentUnit !== ''
  const parts: string[] = []

  const write = (n: JsonNode, depth: number) => {
    switch (n.type) {
      case 'string':
      case 'number':
      case 'literal':
        parts.push(n.raw)
        return
      case 'array': {
        if (n.items.length === 0) {
          parts.push('[]')
          return
        }
        const inner = pretty ? '\n' + indentUnit.repeat(depth + 1) : ''
        parts.push('[')
        n.items.forEach((item, index) => {
          if (index > 0) parts.push(',')
          parts.push(inner)
          write(item, depth + 1)
        })
        parts.push(pretty ? '\n' + indentUnit.repeat(depth) : '', ']')
        return
      }
      case 'object': {
        if (n.entries.length === 0) {
          parts.push('{}')
          return
        }
        const entries = sortKeys ? sortEntries(n.entries) : n.entries
        const inner = pretty ? '\n' + indentUnit.repeat(depth + 1) : ''
        parts.push('{')
        entries.forEach((entry, index) => {
          if (index > 0) parts.push(',')
          parts.push(inner, entry.key, pretty ? ': ' : ':')
          write(entry.value, depth + 1)
        })
        parts.push(pretty ? '\n' + indentUnit.repeat(depth) : '', '}')
      }
    }
  }

  write(node, 0)
  return parts.join('')
}

/** 按解码后的键名排序（稳定排序，重复键保持原顺序） */
function sortEntries(entries: JsonEntry[]): JsonEntry[] {
  return entries
    .map(entry => ({ entry, name: JSON.parse(entry.key) as string }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(item => item.entry)
}

function indentUnitOf(indent: FormatOptions['indent'] = 2): string {
  return indent === 'tab' ? '\t' : ' '.repeat(indent)
}

/** 把异常转换为统一的错误信息 */
function toErrorInfo(error: unknown): JsonErrorInfo {
  if (error instanceof JsonSyntaxError) {
    return { message: error.message, position: error.position, line: error.line, column: error.column }
  }
  if (error instanceof RangeError) {
    return { message: '嵌套层级过深，无法处理', position: null, line: null, column: null }
  }
  return { message: error instanceof Error ? error.message : String(error), position: null, line: null, column: null }
}

/** 格式化（美化） */
export function formatJson(input: string, options: FormatOptions = {}): JsonResult {
  try {
    const node = parseJson(input)
    return { ok: true, output: stringifyNode(node, indentUnitOf(options.indent), options.sortKeys) }
  }
  catch (error) {
    return { ok: false, error: toErrorInfo(error) }
  }
}

/** 压缩为一行 */
export function minifyJson(input: string, options: Pick<FormatOptions, 'sortKeys'> = {}): JsonResult {
  try {
    return { ok: true, output: stringifyNode(parseJson(input), '', options.sortKeys) }
  }
  catch (error) {
    return { ok: false, error: toErrorInfo(error) }
  }
}

/** 压缩后转义为字符串字面量，便于粘贴到代码或另一个 JSON 字段中 */
export function escapeJson(input: string, options: Pick<FormatOptions, 'sortKeys'> = {}): JsonResult {
  const result = minifyJson(input, options)
  return result.ok ? { ok: true, output: JSON.stringify(result.output) } : result
}

/**
 * 去除转义：把 "{\"a\":1}" 这类字符串还原为 JSON 并格式化。
 * 两侧的双引号可有可无。
 */
export function unescapeJson(input: string, options: FormatOptions = {}): JsonResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, error: { message: '内容为空', position: null, line: null, column: null } }
  }
  let text: string
  try {
    const literal = trimmed.startsWith('"') ? trimmed : `"${trimmed}"`
    text = JSON.parse(literal) as string
  }
  catch {
    return { ok: false, error: { message: '不是有效的转义字符串', position: null, line: null, column: null } }
  }
  const result = formatJson(text, options)
  if (result.ok) return result
  const { line, column } = result.error
  const where = line !== null ? `（第 ${line} 行第 ${column} 列）` : ''
  return {
    ok: false,
    error: { message: `去除转义后不是有效的 JSON${where}：${result.error.message}`, position: null, line: null, column: null },
  }
}

/**
 * 出错行的原文，以及列号对应的指示位置（用于在页面上画 ^）。
 * 行太长（如压缩后的 JSON）时只截取指示位置附近 maxWidth 个字符，两端用 … 表示省略。
 */
export function getErrorContext(input: string, error: JsonErrorInfo, maxWidth = 60): { lineText: string, caret: number } | null {
  if (error.line === null || error.column === null) return null
  // Tab 换成空格，保证 ^ 与字符对齐
  const raw = (input.split('\n')[error.line - 1] ?? '').replace(/\r$/, '').replace(/\t/g, ' ')
  let caret = Math.min(error.column - 1, raw.length)
  if (raw.length <= maxWidth) return { lineText: raw, caret }
  const begin = Math.max(0, Math.min(caret - Math.floor(maxWidth / 2), raw.length - maxWidth))
  let lineText = raw.slice(begin, begin + maxWidth)
  caret -= begin
  if (begin > 0) {
    lineText = '…' + lineText
    caret += 1
  }
  if (begin + maxWidth < raw.length) lineText += '…'
  return { lineText, caret }
}

/** 页面上的示例数据 */
export const SAMPLE_JSON = '{"name":"效率工具箱","url":"https://tools.sheyinglai.top","version":1.0,"bigId":12345678901234567890,"tags":["JSON","编码","时间"],"author":{"name":"liu","online":true,"email":null},"tools":[{"id":"json-formatter","hot":true},{"id":"base64","hot":false}]}'

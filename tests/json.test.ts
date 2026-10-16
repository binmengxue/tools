import { describe, expect, it } from 'vitest'
import {
  escapeJson,
  formatJson,
  getErrorContext,
  minifyJson,
  positionToLineColumn,
  SAMPLE_JSON,
  unescapeJson,
} from '../app/utils/tools/json'
import type { JsonResult } from '../app/utils/tools/json'

/** 取成功结果的输出，失败时让测试直接报出错误信息 */
function output(result: JsonResult): string {
  if (!result.ok) throw new Error(`期望成功，实际失败：${result.error.message}`)
  return result.output
}

/** 取失败结果的错误信息 */
function errorOf(result: JsonResult) {
  if (result.ok) throw new Error(`期望失败，实际成功：${result.output}`)
  return result.error
}

describe('formatJson 格式化', () => {
  it('默认 2 空格缩进', () => {
    expect(output(formatJson('{"a":1,"b":[1,2],"c":{}}'))).toBe(
      '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ],\n  "c": {}\n}',
    )
  })

  it('支持 4 空格与 Tab 缩进', () => {
    expect(output(formatJson('{"a":[1]}', { indent: 4 }))).toBe('{\n    "a": [\n        1\n    ]\n}')
    expect(output(formatJson('{"a":1}', { indent: 'tab' }))).toBe('{\n\t"a": 1\n}')
  })

  it('空对象和空数组保持在一行', () => {
    expect(output(formatJson('{"a":{},"b":[]}'))).toBe('{\n  "a": {},\n  "b": []\n}')
  })

  it('根节点可以是基本类型', () => {
    expect(output(formatJson(' "x" '))).toBe('"x"')
    expect(output(formatJson('123'))).toBe('123')
    expect(output(formatJson('null'))).toBe('null')
  })

  it('示例数据能被正确格式化', () => {
    expect(formatJson(SAMPLE_JSON).ok).toBe(true)
  })
})

describe('minifyJson 压缩', () => {
  it('去掉所有空白', () => {
    expect(output(minifyJson('{ "a" : [ 1 , 2 ] ,\n "b": { "c": true } }'))).toBe('{"a":[1,2],"b":{"c":true}}')
  })

  it('大数字和小数写法原样保留，不丢精度', () => {
    expect(output(minifyJson('{"id": 12345678901234567890, "v": 1.0, "e": 1E+10}'))).toBe(
      '{"id":12345678901234567890,"v":1.0,"e":1E+10}',
    )
  })

  it('字符串里的转义写法原样保留', () => {
    expect(output(minifyJson('{"s": "\\u4e2d\\n\\"x\\""}'))).toBe('{"s":"\\u4e2d\\n\\"x\\""}')
  })

  it('重复的键原样保留', () => {
    expect(output(minifyJson('{"a": 1, "a": 2}'))).toBe('{"a":1,"a":2}')
  })

  it('按键名排序（递归，且只影响对象）', () => {
    expect(output(minifyJson('{"b":1,"a":{"d":1,"c":2},"arr":[{"z":1,"y":2}]}', { sortKeys: true }))).toBe(
      '{"a":{"c":2,"d":1},"arr":[{"y":2,"z":1}],"b":1}',
    )
  })
})

describe('语法错误的提示与位置', () => {
  it('空内容', () => {
    const e = errorOf(formatJson('   '))
    expect(e.message).toBe('内容为空')
  })

  it('单引号键名', () => {
    const e = errorOf(formatJson('{\'a\':1}'))
    expect(e.message).toContain('双引号')
    expect([e.line, e.column]).toEqual([1, 2])
  })

  it('对象末尾多余的逗号', () => {
    const e = errorOf(formatJson('{"a":1,}'))
    expect(e.message).toBe('} 前面有多余的逗号')
    expect([e.line, e.column]).toEqual([1, 8])
  })

  it('数组末尾多余的逗号', () => {
    const e = errorOf(formatJson('[1,2,]'))
    expect(e.message).toBe('] 前面有多余的逗号')
    expect([e.line, e.column]).toEqual([1, 6])
  })

  it('换行后缺少逗号，定位到下一行', () => {
    const e = errorOf(formatJson('{\n  "a": 1\n  "b": 2\n}'))
    expect(e.message).toContain('缺少逗号')
    expect([e.line, e.column]).toEqual([3, 3])
  })

  it('数组元素之间缺少逗号', () => {
    expect(errorOf(formatJson('[1 2]')).message).toContain('缺少逗号 , 或 ]')
  })

  it('注释', () => {
    expect(errorOf(formatJson('{"a": 1 // 说明\n}')).message).toBe('JSON 不支持注释')
    expect(errorOf(formatJson('// 说明\n{}')).message).toBe('JSON 不支持注释')
  })

  it('NaN、大写 True、Python 的 None', () => {
    const nan = errorOf(formatJson('{"a": NaN}'))
    expect(nan.message).toBe('JSON 不支持 NaN')
    expect([nan.line, nan.column]).toEqual([1, 7])
    expect(errorOf(formatJson('{"a": True}')).message).toBe('True 必须小写为 true')
    expect(errorOf(formatJson('{"a": None}')).message).toContain('null')
  })

  it('字符串缺少结束的双引号，定位到字符串开头', () => {
    const e = errorOf(formatJson('{"a": "abc}'))
    expect(e.message).toBe('字符串缺少结束的双引号')
    expect([e.line, e.column]).toEqual([1, 7])
  })

  it('字符串中直接换行', () => {
    const e = errorOf(formatJson('{"a": "ab\ncd"}'))
    expect(e.message).toContain('不能直接换行')
    expect([e.line, e.column]).toEqual([1, 10])
  })

  it('无效的转义与数字', () => {
    expect(errorOf(formatJson('"\\x"')).message).toBe('无效的转义字符 \\x')
    expect(errorOf(formatJson('"\\u12"')).message).toContain('4 位十六进制')
    expect(errorOf(formatJson('{"a": 01}')).message).toBe('数字不能以 0 开头')
    expect(errorOf(formatJson('[1.]')).message).toBe('小数点后必须有数字')
  })

  it('缺少冒号、提前结束、多余内容', () => {
    expect(errorOf(formatJson('{"a" 1}')).message).toBe('键名后缺少冒号 :')
    expect(errorOf(formatJson('{"a":')).message).toBe('意外的结尾，JSON 不完整')
    expect(errorOf(formatJson('[1, 2')).message).toBe('意外的结尾，数组缺少 ]')
    const extra = errorOf(formatJson('{"a":1} x'))
    expect(extra.message).toContain('多余内容')
    expect(extra.column).toBe(9)
  })
})

describe('转义与去除转义', () => {
  it('压缩后转义为字符串字面量', () => {
    expect(output(escapeJson('{ "a": "b" }'))).toBe(JSON.stringify('{"a":"b"}'))
  })

  it('去除转义后格式化，两侧引号可有可无', () => {
    expect(output(unescapeJson('"{\\"a\\":1}"'))).toBe('{\n  "a": 1\n}')
    expect(output(unescapeJson('{\\"a\\":1}'))).toBe('{\n  "a": 1\n}')
  })

  it('转义后再去除转义能还原', () => {
    const escaped = output(escapeJson(SAMPLE_JSON))
    expect(output(unescapeJson(escaped))).toBe(output(formatJson(SAMPLE_JSON)))
  })

  it('不是有效的转义字符串', () => {
    expect(errorOf(unescapeJson('"abc')).message).toBe('不是有效的转义字符串')
  })

  it('去除转义后的内容不是 JSON', () => {
    expect(errorOf(unescapeJson('"{a:1}"')).message).toMatch(/^去除转义后不是有效的 JSON（第 1 行第 2 列）/)
  })
})

describe('位置辅助函数', () => {
  it('字符下标转行列号', () => {
    expect(positionToLineColumn('ab\ncd', 0)).toEqual({ line: 1, column: 1 })
    expect(positionToLineColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 })
  })

  it('出错行原文与 ^ 位置', () => {
    const input = '{\n  "a": 1\n  "b": 2\n}'
    const ctx = getErrorContext(input, errorOf(formatJson(input)))
    expect(ctx).toEqual({ lineText: '  "b": 2', caret: 2 })
  })

  it('长行只截取出错位置附近', () => {
    const input = `[${'1,'.repeat(100)}x]`
    const e = errorOf(formatJson(input))
    const ctx = getErrorContext(input, e, 20)!
    expect(ctx.lineText.startsWith('…')).toBe(true)
    expect(ctx.lineText[ctx.caret]).toBe('x')
  })

  it('无法定位时返回 null', () => {
    expect(getErrorContext('x', { message: '', position: null, line: null, column: null })).toBeNull()
  })
})

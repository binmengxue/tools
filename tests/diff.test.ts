import { describe, expect, it } from 'vitest'
import { diffLinePair, diffTexts, SAMPLE_NEW, SAMPLE_OLD, splitLines, toUnified } from '../app/utils/tools/diff'
import type { DiffResult } from '../app/utils/tools/diff'

function run(a: string, b: string, options = {}): DiffResult {
  const result = diffTexts(a, b, options)
  if (!result) throw new Error('对比超时')
  return result
}

describe('splitLines', () => {
  it('空字符串没有任何行', () => {
    expect(splitLines('')).toEqual([])
  })

  it('兼容 \\n 与 \\r\\n', () => {
    expect(splitLines('a\r\nb\nc')).toEqual(['a', 'b', 'c'])
  })
})

describe('diffTexts', () => {
  it('完全相同', () => {
    const r = run('a\nb', 'a\nb')
    expect(r.identical).toBe(true)
    expect(r.stats).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 2 })
  })

  it('两边都为空也视为相同', () => {
    expect(run('', '').identical).toBe(true)
  })

  it('新增与删除整行', () => {
    const r = run('a\nb\nc', 'a\nc\nd')
    expect(r.rows.map(row => row.type)).toEqual(['equal', 'removed', 'equal', 'added'])
    expect(r.stats).toEqual({ added: 1, removed: 1, modified: 0, unchanged: 2 })
  })

  it('相邻的删除和新增配对为修改，并带行号', () => {
    const r = run('a\nhello world\nc', 'a\nhello there\nc')
    const row = r.rows[1]!
    expect(row.type).toBe('modified')
    expect(row.left!.lineNo).toBe(2)
    expect(row.right!.lineNo).toBe(2)
    expect(r.stats.modified).toBe(1)
  })

  it('删除行多于新增行时，多出的部分仍是删除', () => {
    const r = run('x\n1\n2\n3\ny', 'x\nA\ny')
    expect(r.rows.map(row => row.type)).toEqual(['equal', 'modified', 'removed', 'removed', 'equal'])
  })

  it('一边为空时全部是新增或删除', () => {
    expect(run('', 'a\nb').stats.added).toBe(2)
    expect(run('a\nb', '').stats.removed).toBe(2)
  })

  it('忽略首尾空白', () => {
    expect(run('  a\nb  ', 'a\nb').identical).toBe(false)
    const r = run('  a\nb  ', 'a\nb', { ignoreWhitespace: true })
    expect(r.identical).toBe(true)
    // 相同行仍显示各自的原文
    expect(r.rows[0]!.left!.text).toBe('  a')
    expect(r.rows[0]!.right!.text).toBe('a')
  })

  it('忽略大小写', () => {
    expect(run('Hello', 'hello', { ignoreCase: true }).identical).toBe(true)
  })

  it('示例文本能正常对比', () => {
    const r = run(SAMPLE_OLD, SAMPLE_NEW)
    // 不变：标题、「2. 新增文本对比」、「感谢使用！」；修改：版本号、第 1 条、第 3 条；新增：最后一行
    expect(r.stats).toEqual({ added: 1, removed: 0, modified: 3, unchanged: 3 })
  })
})

describe('diffLinePair 行内差异', () => {
  it('只标出改动的字符', () => {
    const { left, right } = diffLinePair('版本：1.0.0', '版本：1.1.0')
    expect(left.filter(s => s.changed).map(s => s.text).join('')).toBe('0')
    expect(right.filter(s => s.changed).map(s => s.text).join('')).toBe('1')
    expect(left.map(s => s.text).join('')).toBe('版本：1.0.0')
    expect(right.map(s => s.text).join('')).toBe('版本：1.1.0')
  })

  it('差异过大时整行标为差异', () => {
    const { left, right } = diffLinePair('abcdef', 'xyz123')
    expect(left).toEqual([{ text: 'abcdef', changed: true }])
    expect(right).toEqual([{ text: 'xyz123', changed: true }])
  })
})

describe('toUnified 合并视图', () => {
  it('修改行拆成删除行 + 新增行', () => {
    const lines = toUnified(run('a\nb', 'a\nB2').rows)
    expect(lines.map(l => l.type)).toEqual(['equal', 'removed', 'added'])
    expect(lines[1]!.oldNo).toBe(2)
    expect(lines[2]!.newNo).toBe(2)
  })
})

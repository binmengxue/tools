/**
 * 文本对比（纯函数，配 Vitest 单测）
 * 先按行对比，再把相邻的「删除 + 新增」配对成「修改」，修改行内部按字符标出差异。
 */
import { diffArrays, diffChars } from 'diff'

export type RowType = 'equal' | 'added' | 'removed' | 'modified'

/** 一行中的一段文字；changed 为 true 表示这段是差异部分 */
export interface Segment {
  text: string
  changed: boolean
}

export interface DiffLine {
  /** 行号（从 1 开始） */
  lineNo: number
  text: string
  segments: Segment[]
}

export interface DiffRow {
  type: RowType
  /** 原文这一侧，新增行为 null */
  left: DiffLine | null
  /** 新文本这一侧，删除行为 null */
  right: DiffLine | null
}

export interface DiffStats {
  added: number
  removed: number
  modified: number
  unchanged: number
}

export interface DiffResult {
  rows: DiffRow[]
  stats: DiffStats
  /** 两段文本（按当前选项）完全一致 */
  identical: boolean
}

export interface DiffOptions {
  /** 忽略每行首尾的空白 */
  ignoreWhitespace?: boolean
  /** 忽略大小写 */
  ignoreCase?: boolean
  /** 超时（毫秒），文本差异过大时放弃对比，返回 null */
  timeout?: number
}

/** 拆分为行；空字符串视为没有任何行 */
export function splitLines(text: string): string[] {
  return text === '' ? [] : text.split(/\r?\n/)
}

/** 按选项归一化一行文本，用于比较 */
function normalizeLine(line: string, options: DiffOptions): string {
  let value = options.ignoreWhitespace ? line.trim() : line
  if (options.ignoreCase) value = value.toLowerCase()
  return value
}

/** 字符相同部分占比低于这个值时，整行标为差异，避免满屏零碎高亮 */
const MIN_SIMILARITY = 0.3

/** 计算一对修改行的行内差异 */
export function diffLinePair(oldText: string, newText: string, options: DiffOptions = {}): { left: Segment[], right: Segment[] } {
  const changes = diffChars(oldText, newText, { ignoreCase: options.ignoreCase })
  const left: Segment[] = []
  const right: Segment[] = []
  let common = 0
  for (const change of changes) {
    if (change.added) {
      right.push({ text: change.value, changed: true })
    }
    else if (change.removed) {
      left.push({ text: change.value, changed: true })
    }
    else {
      common += change.value.length
      left.push({ text: change.value, changed: false })
      right.push({ text: change.value, changed: false })
    }
  }
  const longest = Math.max(oldText.length, newText.length)
  if (longest > 0 && common / longest < MIN_SIMILARITY) {
    return {
      left: oldText ? [{ text: oldText, changed: true }] : [],
      right: newText ? [{ text: newText, changed: true }] : [],
    }
  }
  return { left: mergeSegments(left), right: mergeSegments(right) }
}

/** 合并相邻且状态相同的片段 */
function mergeSegments(segments: Segment[]): Segment[] {
  const merged: Segment[] = []
  for (const segment of segments) {
    const last = merged[merged.length - 1]
    if (last && last.changed === segment.changed) last.text += segment.text
    else merged.push({ ...segment })
  }
  return merged
}

function plainLine(lineNo: number, text: string, changed: boolean): DiffLine {
  return { lineNo, text, segments: text ? [{ text, changed }] : [] }
}

/**
 * 对比两段文本。
 * 返回 null 表示差异过大、在 timeout 内没有算完。
 */
export function diffTexts(oldText: string, newText: string, options: DiffOptions = {}): DiffResult | null {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)
  const changes = diffArrays(oldLines, newLines, {
    comparator: (a: string, b: string) => normalizeLine(a, options) === normalizeLine(b, options),
    timeout: options.timeout ?? 3000,
  })
  if (!changes) return null

  const rows: DiffRow[] = []
  const stats: DiffStats = { added: 0, removed: 0, modified: 0, unchanged: 0 }
  let oi = 0 // 原文行下标
  let ni = 0 // 新文本行下标
  // 暂存连续的删除 / 新增行，遇到相同行或结尾时再配对输出
  let pendingRemoved: number[] = []
  let pendingAdded: number[] = []

  const flush = () => {
    const pairs = Math.min(pendingRemoved.length, pendingAdded.length)
    for (let k = 0; k < pairs; k++) {
      const l = pendingRemoved[k]!
      const r = pendingAdded[k]!
      const { left, right } = diffLinePair(oldLines[l]!, newLines[r]!, options)
      rows.push({
        type: 'modified',
        left: { lineNo: l + 1, text: oldLines[l]!, segments: left },
        right: { lineNo: r + 1, text: newLines[r]!, segments: right },
      })
      stats.modified++
    }
    for (const l of pendingRemoved.slice(pairs)) {
      rows.push({ type: 'removed', left: plainLine(l + 1, oldLines[l]!, true), right: null })
      stats.removed++
    }
    for (const r of pendingAdded.slice(pairs)) {
      rows.push({ type: 'added', left: null, right: plainLine(r + 1, newLines[r]!, true) })
      stats.added++
    }
    pendingRemoved = []
    pendingAdded = []
  }

  for (const change of changes) {
    if (change.removed) {
      for (let k = 0; k < change.count; k++) pendingRemoved.push(oi++)
    }
    else if (change.added) {
      for (let k = 0; k < change.count; k++) pendingAdded.push(ni++)
    }
    else {
      flush()
      for (let k = 0; k < change.count; k++) {
        rows.push({
          type: 'equal',
          left: plainLine(oi + 1, oldLines[oi]!, false),
          right: plainLine(ni + 1, newLines[ni]!, false),
        })
        stats.unchanged++
        oi++
        ni++
      }
    }
  }
  flush()

  const identical = stats.added === 0 && stats.removed === 0 && stats.modified === 0
  return { rows, stats, identical }
}

/** 合并视图的一行：同一行修改时拆成「删除行 + 新增行」两行显示 */
export interface UnifiedLine {
  type: 'equal' | 'added' | 'removed'
  oldNo: number | null
  newNo: number | null
  segments: Segment[]
}

/** 把对比结果转换为合并（上下）视图 */
export function toUnified(rows: DiffRow[]): UnifiedLine[] {
  const lines: UnifiedLine[] = []
  for (const row of rows) {
    if (row.type === 'equal') {
      lines.push({ type: 'equal', oldNo: row.left!.lineNo, newNo: row.right!.lineNo, segments: row.right!.segments })
      continue
    }
    if (row.left) lines.push({ type: 'removed', oldNo: row.left.lineNo, newNo: null, segments: row.left.segments })
    if (row.right) lines.push({ type: 'added', oldNo: null, newNo: row.right.lineNo, segments: row.right.segments })
  }
  return lines
}

/** 页面上的示例文本 */
export const SAMPLE_OLD = `轻工具箱更新说明
版本：1.0.0
1. 新增 JSON 格式化
2. 新增文本对比
3. 修复了若干问题
感谢使用！`

export const SAMPLE_NEW = `轻工具箱更新说明
版本：1.1.0
1. 新增 JSON 格式化与校验
2. 新增文本对比
3. 新增字数统计
感谢使用！
欢迎反馈建议。`

/**
 * 线性撤销 / 重做记录（纯函数）
 * items 为全部操作，index 为当前生效的操作数；新操作会丢弃已撤销的部分。
 */

export interface History<T> {
  items: T[]
  index: number
}

export function createHistory<T>(): History<T> {
  return { items: [], index: 0 }
}

/** 追加一个操作（丢弃已撤销、尚未重做的操作） */
export function push<T>(history: History<T>, item: T): History<T> {
  const items = history.items.slice(0, history.index)
  items.push(item)
  return { items, index: items.length }
}

/** 替换最后一个生效的操作（推拉画笔拖动过程中不断更新同一笔） */
export function replaceLast<T>(history: History<T>, item: T): History<T> {
  if (history.index === 0) return push(history, item)
  const items = history.items.slice(0, history.index)
  items[items.length - 1] = item
  return { items, index: items.length }
}

export function undo<T>(history: History<T>): History<T> {
  return history.index > 0 ? { items: history.items, index: history.index - 1 } : history
}

export function redo<T>(history: History<T>): History<T> {
  return history.index < history.items.length ? { items: history.items, index: history.index + 1 } : history
}

export function canUndo<T>(history: History<T>): boolean {
  return history.index > 0
}

export function canRedo<T>(history: History<T>): boolean {
  return history.index < history.items.length
}

/** 当前生效的操作 */
export function active<T>(history: History<T>): T[] {
  return history.items.slice(0, history.index)
}

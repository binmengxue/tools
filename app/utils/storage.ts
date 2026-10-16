/**
 * localStorage 读写工具（只能在客户端调用）
 */

/** 安全读取字符串数组，数据损坏时返回空数组 */
export function readStringList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  }
  catch {
    return []
  }
}

/** 写入字符串数组，隐私模式或配额不足时静默失败 */
export function writeStringList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  }
  catch {
    // 忽略写入失败
  }
}

/** 把 id 放到列表最前面并去重，超出上限时截断 */
export function pushRecent(list: string[], id: string, max: number): string[] {
  return [id, ...list.filter(v => v !== id)].slice(0, max)
}

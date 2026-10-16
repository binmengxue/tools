/**
 * 最近使用的工具（localStorage 持久化，最多保留 8 个）
 * 与收藏一样，只在客户端挂载后读取。
 */
const STORAGE_KEY = 'toolbox:recent'
const MAX_RECENT = 8

export function useRecent() {
  const recent = useState<string[]>('recent', () => [])
  const loaded = useState<boolean>('recent-loaded', () => false)

  function load() {
    if (import.meta.server || loaded.value) return
    recent.value = readStringList(STORAGE_KEY)
    loaded.value = true
  }

  /** 记录一次使用 */
  function addRecent(id: string) {
    load()
    recent.value = pushRecent(recent.value, id, MAX_RECENT)
    writeStringList(STORAGE_KEY, recent.value)
  }

  function clearRecent() {
    recent.value = []
    writeStringList(STORAGE_KEY, [])
  }

  return { recent, loaded, load, addRecent, clearRecent }
}

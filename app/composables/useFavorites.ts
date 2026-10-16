/**
 * 收藏工具（localStorage 持久化）
 * SSR 安全：服务端与水合阶段始终为空列表，客户端挂载后再调用 load() 读取，避免水合不一致。
 */
const STORAGE_KEY = 'toolbox:favorites'

export function useFavorites() {
  const favorites = useState<string[]>('favorites', () => [])
  const loaded = useState<boolean>('favorites-loaded', () => false)

  /** 从 localStorage 读取（仅客户端，重复调用无副作用） */
  function load() {
    if (import.meta.server || loaded.value) return
    favorites.value = readStringList(STORAGE_KEY)
    loaded.value = true
  }

  function isFavorite(id: string) {
    return favorites.value.includes(id)
  }

  /** 切换收藏状态，新收藏的排在最前 */
  function toggleFavorite(id: string) {
    load()
    favorites.value = isFavorite(id)
      ? favorites.value.filter(v => v !== id)
      : [id, ...favorites.value]
    writeStringList(STORAGE_KEY, favorites.value)
  }

  return { favorites, loaded, load, isFavorite, toggleFavorite }
}

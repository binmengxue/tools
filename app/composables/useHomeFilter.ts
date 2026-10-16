/**
 * 首页筛选状态（Header 搜索框与首页共享）
 */
import type { TabId } from '~/utils/search'

export function useHomeFilter() {
  const query = useState<string>('home-query', () => '')
  const tab = useState<TabId>('home-tab', () => 'all')
  return { query, tab }
}

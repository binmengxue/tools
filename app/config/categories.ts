/**
 * 工具分组配置
 * 首页按分组展示卡片，工具页面包屑也显示所属分组。
 */

export type CategoryId = 'developer' | 'text' | 'image' | 'life'

export interface Category {
  /** 分组唯一标识 */
  id: CategoryId
  /** 分组中文名 */
  name: string
}

/** 首页按这个顺序展示分组 */
export const categories: Category[] = [
  { id: 'developer', name: '开发者工具' },
  { id: 'text', name: '文本工具' },
  { id: 'image', name: '图片工具' },
  { id: 'life', name: '生活工具' },
]

/** 根据 id 查找分组 */
export function getCategory(id: CategoryId): Category | undefined {
  return categories.find(c => c.id === id)
}

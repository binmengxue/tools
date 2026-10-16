/**
 * 工具分类配置
 * 首页分类 Tab、卡片标签、图标配色都由这里驱动。
 */

export type CategoryId
  = | 'common'
    | 'json'
    | 'encode'
    | 'datetime'
    | 'code'
    | 'text'
    | 'image'
    | 'frontend'

export interface Category {
  /** 分类唯一标识 */
  id: CategoryId
  /** 分类中文名（Tab 与卡片标签上显示） */
  name: string
  /** Tab 上的图标（Iconify 名称） */
  icon: string
  /** 卡片图标的主题色（Tailwind 文字色 + 背景色类名） */
  color: string
}

export const categories: Category[] = [
  { id: 'common', name: '常用工具', icon: 'lucide:flame', color: 'text-orange-400 light:text-orange-600 bg-orange-400/10' },
  { id: 'json', name: 'JSON', icon: 'lucide:braces', color: 'text-amber-400 light:text-amber-600 bg-amber-400/10' },
  { id: 'encode', name: '编码加密', icon: 'lucide:lock', color: 'text-emerald-400 light:text-emerald-600 bg-emerald-400/10' },
  { id: 'datetime', name: '时间日期', icon: 'lucide:clock', color: 'text-sky-400 light:text-sky-600 bg-sky-400/10' },
  { id: 'code', name: '代码', icon: 'lucide:code-xml', color: 'text-violet-400 light:text-violet-600 bg-violet-400/10' },
  { id: 'text', name: '文本', icon: 'lucide:type', color: 'text-rose-400 light:text-rose-600 bg-rose-400/10' },
  { id: 'image', name: '图像', icon: 'lucide:image', color: 'text-pink-400 light:text-pink-600 bg-pink-400/10' },
  { id: 'frontend', name: '前端开发', icon: 'lucide:palette', color: 'text-cyan-400 light:text-cyan-600 bg-cyan-400/10' },
]

/** 根据 id 查找分类 */
export function getCategory(id: CategoryId): Category | undefined {
  return categories.find(c => c.id === id)
}

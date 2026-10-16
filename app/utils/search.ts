/**
 * 首页工具筛选逻辑（纯函数，便于单测）
 */
import type { Tool } from '../config/tools'

/** 首页 Tab：全部 / 我的收藏 / 具体分类 */
export type TabId = 'all' | 'favorites' | Tool['categories'][number]

export interface FilterOptions {
  /** 当前选中的 Tab */
  tab?: TabId
  /** 搜索关键字 */
  query?: string
  /** 已收藏的工具 id 列表（tab 为 favorites 时使用，并保持收藏顺序） */
  favorites?: string[]
}

/** 统一处理大小写与首尾空白 */
export function normalize(text: string): string {
  return text.trim().toLowerCase()
}

/**
 * 判断工具是否匹配搜索词：名称、描述、关键词任一包含即可。
 * 多个空格分隔的词需全部命中（AND 关系）。
 */
export function matchTool(tool: Tool, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = [tool.name, tool.desc, ...tool.keywords].join(' ').toLowerCase()
  return terms.every(term => haystack.includes(term))
}

/**
 * 按 Tab 与搜索词筛选工具。
 * 有搜索词时在当前 Tab 范围内继续过滤。
 */
export function filterTools(list: Tool[], options: FilterOptions = {}): Tool[] {
  const { tab = 'all', query = '', favorites = [] } = options

  let scoped: Tool[]
  if (tab === 'all') {
    scoped = list
  }
  else if (tab === 'favorites') {
    // 按收藏顺序返回，忽略已下线的工具 id
    scoped = favorites
      .map(id => list.find(t => t.id === id))
      .filter((t): t is Tool => Boolean(t))
  }
  else {
    scoped = list.filter(t => t.categories.includes(tab))
  }

  return scoped.filter(t => matchTool(t, query))
}

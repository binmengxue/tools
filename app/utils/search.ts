/**
 * 首页搜索与分组逻辑（纯函数，便于单测）
 */
import type { Category } from '../config/categories'
import type { Tool } from '../config/tools'

export interface ToolGroup {
  category: Category
  tools: Tool[]
}

/** 统一处理大小写与首尾空白 */
export function normalize(text: string): string {
  return text.trim().toLowerCase()
}

/**
 * 判断工具是否匹配搜索词：名称、描述、关键词以及额外文本（如分组名）任一包含即可。
 * 多个空格分隔的词需全部命中（AND 关系）。
 */
export function matchTool(tool: Tool, query: string, extra = ''): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = [tool.name, tool.desc, ...tool.keywords, extra].join(' ').toLowerCase()
  return terms.every(term => haystack.includes(term))
}

/**
 * 按分组顺序整理工具，并按搜索词过滤；没有匹配工具的分组不返回。
 * 搜索词也会匹配分组名，例如「图片」能找到图片工具下的全部工具。
 */
export function groupTools(list: Tool[], categoryList: Category[], query = ''): ToolGroup[] {
  return categoryList
    .map(category => ({
      category,
      tools: list.filter(t => t.category === category.id && matchTool(t, query, category.name)),
    }))
    .filter(group => group.tools.length > 0)
}

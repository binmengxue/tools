/**
 * 工具展示相关的辅助函数
 */
import { getCategory } from '../config/categories'
import { site } from '../config/site'
import type { Tool } from '../config/tools'

/** 工具所属分组名 */
export function toolCategoryName(tool: Tool): string {
  return getCategory(tool.category)?.name ?? ''
}

/** 工具页 SEO 信息 */
export function toolSeo(tool: Tool) {
  // 名称本身以「工具」结尾时避免重复，如「颜色工具」→「在线颜色工具」
  const title = tool.name.endsWith('工具') ? `在线${tool.name}` : `${tool.name}在线工具`
  const description = `${tool.desc}。免费在线使用，无需注册，数据仅在浏览器本地处理，不会上传服务器。`
  return {
    title,
    description,
    ogTitle: `${title} - ${site.name}`,
    ogDescription: description,
  }
}

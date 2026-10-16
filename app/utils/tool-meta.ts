/**
 * 工具展示相关的辅助函数
 */
import { categories, getCategory } from '../config/categories'
import type { Category } from '../config/categories'
import { site } from '../config/site'
import type { Tool } from '../config/tools'

/** 卡片标签：除「常用」外的所属分类 */
export function toolTags(tool: Tool): Category[] {
  return tool.categories
    .filter(id => id !== 'common')
    .map(id => getCategory(id))
    .filter((c): c is Category => Boolean(c))
}

/** 卡片图标配色：取第一个非「常用」分类的颜色 */
export function toolColor(tool: Tool): string {
  return toolTags(tool)[0]?.color ?? categories[0]!.color
}

/** 工具页 SEO 信息 */
export function toolSeo(tool: Tool) {
  const title = `${tool.name}在线工具`
  const description = `${tool.desc}。免费在线使用，无需安装，数据仅在浏览器本地处理，不会上传服务器。`
  return {
    title,
    description,
    ogTitle: `${title} - ${site.name}`,
    ogDescription: description,
  }
}

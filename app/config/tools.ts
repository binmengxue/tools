/**
 * 工具注册表
 * 首页卡片、分组、搜索、预渲染路由都由这份配置驱动。
 * 新增工具：在这里加一条配置 + 在 app/pages 下新建同名页面。
 */
import type { CategoryId } from './categories'

export interface Tool {
  /** 工具唯一标识，同时也是页面文件名（app/pages/<id>.vue） */
  id: string
  /** 工具名称 */
  name: string
  /** 一句话描述（卡片与 SEO description 使用） */
  desc: string
  /** 图标（Iconify 名称，需写成字面量以便 @nuxt/icon 静态扫描打包） */
  icon: string
  /** 强调色：图标与「立即使用」的文字色（浅色 / 深色两套） */
  color: string
  /** 所属分组 */
  category: CategoryId
  /** 搜索关键词（同义词、英文名、拼音等） */
  keywords: string[]
  /** 页面路径 */
  path: string
}

export const tools: Tool[] = [
  // ===== 开发者工具 =====
  {
    id: 'json-formatter',
    name: 'JSON 格式化',
    desc: '美化并校验 JSON，定位错误位置',
    icon: 'lucide:braces',
    color: 'text-violet-600 dark:text-violet-400',
    category: 'developer',
    keywords: ['json', 'format', 'beautify', '校验', '压缩', '美化', '转义', 'geshihua'],
    path: '/json-formatter',
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    desc: '时间戳与日期互转，区分秒与毫秒',
    icon: 'lucide:clock',
    color: 'text-sky-600 dark:text-sky-400',
    category: 'developer',
    keywords: ['timestamp', 'unix', '时间戳', '日期', 'date', '时区', 'shijianchuo'],
    path: '/timestamp',
  },

  // ===== 文本工具 =====
  {
    id: 'text-diff',
    name: '文本对比',
    desc: '找出两段文本的差异',
    icon: 'lucide:file-diff',
    color: 'text-teal-600 dark:text-teal-400',
    category: 'text',
    keywords: ['diff', '对比', '比较', '差异', 'compare'],
    path: '/text-diff',
  },
  {
    id: 'word-counter',
    name: '字数统计',
    desc: '统计字数并清洗文本',
    icon: 'lucide:letter-text',
    color: 'text-orange-600 dark:text-orange-400',
    category: 'text',
    keywords: ['字数', '统计', 'word count', '字符', '清洗', '去空行', '空格', 'zishu'],
    path: '/word-counter',
  },

  // ===== 图片工具 =====
  {
    id: 'qrcode-generator',
    name: '二维码生成',
    desc: '文字或网址转二维码',
    icon: 'lucide:qr-code',
    color: 'text-pink-600 dark:text-pink-400',
    category: 'image',
    keywords: ['qrcode', 'qr', '二维码', '生成', '网址'],
    path: '/qrcode-generator',
  },
  {
    id: 'image-compress',
    name: '图片压缩',
    desc: '本地压缩图片，对比前后大小',
    icon: 'lucide:image-down',
    color: 'text-emerald-600 dark:text-emerald-400',
    category: 'image',
    keywords: ['image', 'compress', '图片', '压缩', 'jpg', 'png', 'webp'],
    path: '/image-compress',
  },
]

/** 根据 id 查找工具 */
export function getTool(id: string): Tool | undefined {
  return tools.find(t => t.id === id)
}

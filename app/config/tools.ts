/**
 * 工具注册表
 * 首页卡片、分类、搜索、收藏、预渲染路由都由这份配置驱动。
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
  /** 所属分类，可多个；包含 common 的会出现在「常用工具」 */
  categories: CategoryId[]
  /** 搜索关键词（同义词、英文名、拼音缩写等） */
  keywords: string[]
  /** 页面路径 */
  path: string
}

export const tools: Tool[] = [
  // ===== JSON =====
  {
    id: 'json-formatter',
    name: 'JSON 格式化',
    desc: 'JSON 美化、压缩与语法校验，定位错误行号',
    icon: 'lucide:braces',
    categories: ['common', 'json'],
    keywords: ['json', 'format', 'beautify', '校验', '压缩', '美化', 'geshihua'],
    path: '/json-formatter',
  },
  {
    id: 'json-editor',
    name: 'JSON 编辑器',
    desc: '带语法高亮的 JSON 在线编辑，支持树形查看',
    icon: 'lucide:file-json',
    categories: ['json'],
    keywords: ['json', 'editor', '编辑', '树形', 'tree'],
    path: '/json-editor',
  },
  {
    id: 'json-converter',
    name: 'JSON 转换',
    desc: 'JSON 与 YAML / XML / CSV 互相转换',
    icon: 'lucide:arrow-left-right',
    categories: ['json'],
    keywords: ['json', 'yaml', 'xml', 'csv', '转换', 'convert'],
    path: '/json-converter',
  },

  // ===== 编码加密 =====
  {
    id: 'base64',
    name: 'Base64 编解码',
    desc: '文本与 Base64 互转，支持中文与 URL Safe 模式',
    icon: 'lucide:binary',
    categories: ['common', 'encode'],
    keywords: ['base64', 'encode', 'decode', '编码', '解码'],
    path: '/base64',
  },
  {
    id: 'url-encode',
    name: 'URL 编解码',
    desc: 'URL 编码与解码，处理中文与特殊字符',
    icon: 'lucide:link',
    categories: ['encode'],
    keywords: ['url', 'encodeURIComponent', 'decode', '编码', '解码', '链接'],
    path: '/url-encode',
  },
  {
    id: 'unicode-converter',
    name: 'Unicode 中文互转',
    desc: 'Unicode 转义序列与中文互相转换',
    icon: 'lucide:languages',
    categories: ['encode'],
    keywords: ['unicode', '中文', '转义', 'escape', '\\u'],
    path: '/unicode-converter',
  },
  {
    id: 'hash-crypto',
    name: 'MD5 / SHA / AES',
    desc: 'MD5、SHA 系列哈希计算与 AES 加密解密',
    icon: 'lucide:shield-check',
    categories: ['common', 'encode'],
    keywords: ['md5', 'sha1', 'sha256', 'sha512', 'aes', 'hash', '哈希', '加密', '解密'],
    path: '/hash-crypto',
  },
  {
    id: 'jwt-decoder',
    name: 'JWT 解析',
    desc: '解析 JWT 的 Header 与 Payload，查看过期时间',
    icon: 'lucide:key-round',
    categories: ['encode'],
    keywords: ['jwt', 'token', 'json web token', '解析', '令牌'],
    path: '/jwt-decoder',
  },

  // ===== 时间日期 =====
  {
    id: 'timestamp',
    name: '时间戳转换',
    desc: 'Unix 时间戳与日期时间互转，支持秒与毫秒',
    icon: 'lucide:clock',
    categories: ['common', 'datetime'],
    keywords: ['timestamp', 'unix', '时间戳', '日期', 'date', 'shijianchuo'],
    path: '/timestamp',
  },
  {
    id: 'date-calculator',
    name: '日期计算器',
    desc: '计算两个日期间隔，或推算 N 天前后的日期',
    icon: 'lucide:calendar-days',
    categories: ['datetime'],
    keywords: ['date', '日期', '间隔', '天数', '计算'],
    path: '/date-calculator',
  },
  {
    id: 'timezone-converter',
    name: '时区转换',
    desc: '世界各地时区的时间换算与对照',
    icon: 'lucide:globe',
    categories: ['datetime'],
    keywords: ['timezone', '时区', 'utc', 'gmt', '世界时间'],
    path: '/timezone-converter',
  },

  // ===== 文本 =====
  {
    id: 'regex-tester',
    name: '正则测试',
    desc: '正则表达式实时匹配高亮，查看分组结果',
    icon: 'lucide:regex',
    categories: ['common', 'text'],
    keywords: ['regex', 'regexp', '正则', '表达式', '匹配'],
    path: '/regex-tester',
  },
  {
    id: 'word-counter',
    name: '字数统计',
    desc: '统计中英文字数、字符数、行数与段落数',
    icon: 'lucide:letter-text',
    categories: ['text'],
    keywords: ['字数', '统计', 'word count', '字符', 'zishu'],
    path: '/word-counter',
  },
  {
    id: 'text-diff',
    name: '文本对比',
    desc: '两段文本逐行对比，高亮显示差异',
    icon: 'lucide:git-compare',
    categories: ['text'],
    keywords: ['diff', '对比', '比较', '差异', 'compare'],
    path: '/text-diff',
  },

  // ===== 图像 =====
  {
    id: 'image-compress',
    name: '图片压缩',
    desc: '浏览器本地压缩 JPG / PNG / WebP，图片不上传',
    icon: 'lucide:image-down',
    categories: ['common', 'image'],
    keywords: ['image', 'compress', '图片', '压缩', 'jpg', 'png', 'webp'],
    path: '/image-compress',
  },
  {
    id: 'qrcode-generator',
    name: '二维码生成',
    desc: '文本或链接生成二维码，可下载 PNG',
    icon: 'lucide:qr-code',
    categories: ['image'],
    keywords: ['qrcode', 'qr', '二维码', '生成'],
    path: '/qrcode-generator',
  },

  // ===== 前端开发 =====
  {
    id: 'color-converter',
    name: '颜色转换',
    desc: 'HEX / RGB / HSL 颜色格式互转与取色',
    icon: 'lucide:pipette',
    categories: ['frontend'],
    keywords: ['color', '颜色', 'hex', 'rgb', 'hsl', '取色'],
    path: '/color-converter',
  },
  {
    id: 'css-gradient',
    name: 'CSS 渐变生成',
    desc: '可视化调整线性 / 径向渐变，一键复制 CSS',
    icon: 'lucide:blend',
    categories: ['frontend'],
    keywords: ['css', 'gradient', '渐变', 'linear-gradient', 'radial'],
    path: '/css-gradient',
  },

  // ===== 代码 =====
  {
    id: 'code-formatter',
    name: '代码格式化',
    desc: 'HTML / CSS / JavaScript 代码美化',
    icon: 'lucide:code-xml',
    categories: ['code'],
    keywords: ['format', 'prettier', 'html', 'css', 'javascript', 'js', '格式化', '美化'],
    path: '/code-formatter',
  },
]

/** 根据 id 查找工具 */
export function getTool(id: string): Tool | undefined {
  return tools.find(t => t.id === id)
}

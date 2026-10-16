/**
 * 站点基础信息
 */
export const site = {
  name: '轻工具箱',
  slogan: '让每一次处理，都更简单',
  url: 'https://tools.sheyinglai.top',
  description: '轻工具箱：无需注册、打开即用的中文在线工具。JSON 格式化、文本对比、字数统计、二维码生成、时间戳转换、图片压缩，所有数据仅在浏览器本地处理。',
  // TODO: 替换为真实 ICP 备案号（子域名沿用主域名 sheyinglai.top 的备案）
  icp: '苏ICP备XXXXXXXX号',
  icpLink: 'https://beian.miit.gov.cn',
  since: 2026,
}

/** 主题在 localStorage 中的键名（nuxt.config 的首屏内联脚本与 useTheme 共用） */
export const THEME_STORAGE_KEY = 'toolbox:theme'

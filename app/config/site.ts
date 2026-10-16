/**
 * 站点基础信息
 */
export const site = {
  name: '效率工具箱',
  url: 'https://tools.sheyinglai.top',
  description: '免费、无广告的中文在线效率工具箱：JSON 格式化、编码加密、时间戳转换、正则测试、图片压缩等，所有数据仅在浏览器本地处理。',
  // TODO: 替换为真实 ICP 备案号（子域名沿用主域名 sheyinglai.top 的备案）
  icp: '苏ICP备XXXXXXXX号',
  icpLink: 'https://beian.miit.gov.cn',
  since: 2026,
}

/** 主题在 localStorage 中的键名（nuxt.config 的首屏内联脚本与 useTheme 共用） */
export const THEME_STORAGE_KEY = 'toolbox:theme'

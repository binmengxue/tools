/**
 * 深色 / 浅色主题切换
 * 主题通过 <html data-theme="light"> 切换 CSS 变量；默认深色。
 * 首屏由 nuxt.config 中 app.head 的内联脚本提前设置，避免闪烁。
 */
import { THEME_STORAGE_KEY } from '~/config/site'

export type Theme = 'dark' | 'light'

export function useTheme() {
  const theme = useState<Theme>('theme', () => 'dark')

  /** 客户端挂载后同步内联脚本已设置的主题 */
  function init() {
    if (import.meta.server) return
    theme.value = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  }

  function setTheme(value: Theme) {
    theme.value = value
    if (import.meta.server) return
    document.documentElement.dataset.theme = value
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value)
    }
    catch {
      // 忽略写入失败
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme, init, setTheme, toggleTheme }
}

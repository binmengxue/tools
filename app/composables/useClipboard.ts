/**
 * 复制到剪贴板 + 提示
 * 优先使用 Clipboard API，非安全上下文（如 http）下退回 execCommand。
 */
export function useClipboard() {
  const { show } = useToast()

  async function copy(text: string, successMessage = '已复制到剪贴板'): Promise<boolean> {
    if (!text) {
      show('没有可复制的内容', 'info')
      return false
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      }
      else {
        fallbackCopy(text)
      }
      show(successMessage, 'success')
      return true
    }
    catch {
      show('复制失败，请手动复制', 'error')
      return false
    }
  }

  return { copy }
}

/** 兼容旧浏览器的复制方式 */
function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok) throw new Error('execCommand copy failed')
}

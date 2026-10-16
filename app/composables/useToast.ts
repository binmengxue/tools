/**
 * 轻量全局提示
 */
export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

let seed = 0

export function useToast() {
  const toasts = useState<ToastItem[]>('toasts', () => [])

  function remove(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  /** 显示一条提示，默认 2 秒后自动消失 */
  function show(message: string, type: ToastItem['type'] = 'success', duration = 2000) {
    const id = ++seed
    toasts.value = [...toasts.value, { id, message, type }]
    setTimeout(() => remove(id), duration)
  }

  return { toasts, show, remove }
}

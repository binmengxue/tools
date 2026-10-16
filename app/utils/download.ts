/**
 * 浏览器下载工具（只能在客户端调用）
 */

/** 下载 Blob，下载触发后立即释放临时 URL */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 延迟释放，保证部分浏览器已开始下载
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 下载文本文件 */
export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename)
}

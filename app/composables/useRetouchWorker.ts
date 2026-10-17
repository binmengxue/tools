/**
 * 人像美颜后台线程的封装：初始化、按最新参数渲染（拖动滑杆时只保留最后一次请求）。
 */
import type { RetouchParams } from '~/utils/tools/retouch/engine'
import type { Point } from '~/utils/tools/retouch/regions'
import type { WorkerRequest, WorkerResponse } from '~/utils/tools/retouch/retouch.worker'

export function useRetouchWorker(onResult: (rgba: Uint8ClampedArray) => void) {
  const busy = ref(false)
  const spots = ref(0)
  const lastMs = ref(0)
  const error = ref('')

  let worker: Worker | null = null
  let nextId = 0
  let pending: RetouchParams | null = null
  let readyResolve: (() => void) | null = null

  function send(message: WorkerRequest, transfer: Transferable[] = []) {
    worker?.postMessage(message, transfer)
  }

  function handle(event: MessageEvent<WorkerResponse>) {
    const msg = event.data
    if (msg.type === 'ready') {
      readyResolve?.()
      readyResolve = null
    }
    else if (msg.type === 'result') {
      spots.value = msg.spots
      lastMs.value = msg.ms
      onResult(msg.rgba)
      busy.value = false
      if (pending) {
        const params = pending
        pending = null
        render(params)
      }
    }
    else {
      error.value = msg.message
      busy.value = false
    }
  }

  /** 把原图和人脸关键点交给后台线程，完成预处理后返回 */
  function start(width: number, height: number, rgba: Uint8ClampedArray, faces: Point[][]): Promise<void> {
    dispose()
    worker = new Worker(new URL('../utils/tools/retouch/retouch.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', handle)
    error.value = ''
    return new Promise((resolve) => {
      readyResolve = resolve
      send({ type: 'init', width, height, rgba, faces }, [rgba.buffer])
    })
  }

  /** 按参数渲染；上一次还没算完时只记住最新参数 */
  function render(params: RetouchParams) {
    if (!worker) return
    if (busy.value) {
      pending = { ...params }
      return
    }
    busy.value = true
    send({ type: 'render', id: ++nextId, params: { ...params } })
  }

  function dispose() {
    worker?.terminate()
    worker = null
    pending = null
    busy.value = false
  }

  onBeforeUnmount(dispose)

  return { busy, spots, lastMs, error, start, render, dispose }
}

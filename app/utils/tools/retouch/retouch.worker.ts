/**
 * 人像美颜的后台计算线程：持有原图与每张脸的遮罩，收到参数后计算结果并传回。
 * 放在 Worker 里，拖动滑杆时页面不会卡顿。
 */
import { prepareFace, renderRetouch } from './engine'
import type { FacePrep, RetouchParams } from './engine'
import type { Point } from './regions'

export type WorkerRequest
  = | { type: 'init', width: number, height: number, rgba: Uint8ClampedArray, faces: Point[][] }
    | { type: 'render', id: number, params: RetouchParams }

export type WorkerResponse
  = | { type: 'ready' }
    | { type: 'result', id: number, rgba: Uint8ClampedArray, spots: number, ms: number }
    | { type: 'error', message: string }

let width = 0
let height = 0
let base: Uint8ClampedArray | null = null
let preps: FacePrep[] = []

const post = (message: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer)

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  try {
    if (msg.type === 'init') {
      width = msg.width
      height = msg.height
      base = msg.rgba
      preps = msg.faces.map(face => prepareFace(msg.rgba, width, height, face))
      post({ type: 'ready' })
      return
    }
    if (msg.type === 'render') {
      if (!base) throw new Error('图片尚未初始化')
      const start = performance.now()
      const { rgba, spots } = renderRetouch(base, width, height, preps, msg.params)
      post({ type: 'result', id: msg.id, rgba, spots, ms: Math.round(performance.now() - start) }, [rgba.buffer])
    }
  }
  catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
})

/**
 * 人像美颜后台线程的封装。
 * 请求排队规则：笔画、撤销、重做按顺序全部执行；渲染（拖动滑杆）只保留最新一次；
 * 推拉画笔拖动中的同一笔只保留最新的路径。
 */
import type { RetouchParams } from '~/utils/tools/retouch/engine'
import type { ManualTool } from '~/utils/tools/retouch/manual'
import type { Point } from '~/utils/tools/retouch/regions'
import type { WorkerRequest, WorkerResponse } from '~/utils/tools/retouch/retouch.worker'

type Command = Exclude<WorkerRequest, { type: 'init' } | { type: 'render' }>

export function useRetouchWorker(onResult: (rgba: Uint8ClampedArray) => void) {
  const busy = ref(false)
  const spots = ref(0)
  const lastMs = ref(0)
  const error = ref('')
  const canUndo = ref(false)
  const canRedo = ref(false)

  let worker: Worker | null = null
  let readyResolve: (() => void) | null = null
  let pendingRender: RetouchParams | null = null
  const commands: Command[] = []

  function next() {
    if (!worker || busy.value) return
    const command = commands.shift()
    if (command) {
      busy.value = true
      worker.postMessage(command)
      return
    }
    if (pendingRender) {
      busy.value = true
      worker.postMessage({ type: 'render', params: pendingRender } satisfies WorkerRequest)
      pendingRender = null
    }
  }

  function handle(event: MessageEvent<WorkerResponse>) {
    const msg = event.data
    if (msg.type === 'ready') {
      readyResolve?.()
      readyResolve = null
      return
    }
    busy.value = false
    if (msg.type === 'result') {
      spots.value = msg.spots
      lastMs.value = msg.ms
      canUndo.value = msg.canUndo
      canRedo.value = msg.canRedo
      onResult(msg.rgba)
    }
    else {
      error.value = msg.message
    }
    next()
  }

  /** 把原图和人脸关键点交给后台线程，完成预处理后返回 */
  function start(width: number, height: number, rgba: Uint8ClampedArray, faces: Point[][]): Promise<void> {
    dispose()
    worker = new Worker(new URL('../utils/tools/retouch/retouch.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', handle)
    error.value = ''
    canUndo.value = false
    canRedo.value = false
    return new Promise((resolve) => {
      readyResolve = resolve
      worker!.postMessage({ type: 'init', width, height, rgba, faces } satisfies WorkerRequest, [rgba.buffer])
    })
  }

  /** 按参数渲染（只保留最新一次） */
  function render(params: RetouchParams) {
    pendingRender = { ...params }
    next()
  }

  /** 提交一笔画笔操作；同一笔的后续更新会替换排队中尚未发送的旧路径 */
  function stroke(strokeId: number, tool: ManualTool, points: Point[], radius: number) {
    const last = commands[commands.length - 1]
    const command: Command = { type: 'stroke', strokeId, tool, points: points.map(p => ({ x: p.x, y: p.y })), radius }
    if (last && last.type === 'stroke' && last.strokeId === strokeId) commands[commands.length - 1] = command
    else commands.push(command)
    next()
  }

  function undo() {
    commands.push({ type: 'undo' })
    next()
  }

  function redo() {
    commands.push({ type: 'redo' })
    next()
  }

  function dispose() {
    worker?.terminate()
    worker = null
    pendingRender = null
    commands.length = 0
    busy.value = false
  }

  onBeforeUnmount(dispose)

  return { busy, spots, lastMs, error, canUndo, canRedo, start, render, stroke, undo, redo, dispose }
}

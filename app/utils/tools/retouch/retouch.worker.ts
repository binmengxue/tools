/**
 * 人像美颜的后台计算线程：持有原图、每张脸的遮罩和手动操作记录，收到请求后计算结果并传回。
 * 放在 Worker 里，拖动滑杆、涂抹时页面不会卡顿。
 */
import { prepareFace, renderRetouch, ZERO_PARAMS } from './engine'
import type { FacePrep, RetouchParams } from './engine'
import { active, canRedo, canUndo, createHistory, push, redo, replaceLast, undo } from './history'
import type { History } from './history'
import { applyPatches, erasePatch, healPatch, pushOp } from './manual'
import type { ManualOp, ManualTool } from './manual'
import type { Point } from './regions'

export type WorkerRequest
  = | { type: 'init', width: number, height: number, rgba: Uint8ClampedArray, faces: Point[][] }
    | { type: 'render', params: RetouchParams }
    | { type: 'stroke', strokeId: number, tool: ManualTool, points: Point[], radius: number }
    | { type: 'undo' }
    | { type: 'redo' }

export type WorkerResponse
  = | { type: 'ready' }
    | {
      type: 'result'
      rgba: Uint8ClampedArray
      spots: number
      ms: number
      canUndo: boolean
      canRedo: boolean
    }
    | { type: 'error', message: string }

let width = 0
let height = 0
let original: Uint8ClampedArray | null = null
let preps: FacePrep[] = []
let params: RetouchParams = { ...ZERO_PARAMS }
let history: History<ManualOp> = createHistory()

// 贴好补丁的底图缓存：记录用到的补丁，前缀不变时只追加新的补丁
let patched: Uint8ClampedArray | null = null
let patchedOps: ManualOp[] = []

const post = (message: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer)

/** 当前生效的补丁贴在原图上的结果 */
function patchedBase(): Uint8ClampedArray {
  const patches = active(history).filter(op => op.kind === 'patch')
  const reusable = patched !== null
    && patchedOps.length <= patches.length
    && patchedOps.every((op, i) => op === patches[i])
  if (!reusable) {
    patched = original!.slice()
    patchedOps = []
  }
  applyPatches(patched!, width, patches.slice(patchedOps.length))
  patchedOps = patches
  return patched!
}

function render() {
  const start = performance.now()
  const ops = active(history)
  const { rgba, spots } = renderRetouch(patchedBase(), width, height, preps, params, ops)
  post({
    type: 'result',
    rgba,
    spots,
    ms: Math.round(performance.now() - start),
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  }, [rgba.buffer])
}

/** 处理一笔：修复 / 消除在落笔结束时计算补丁；磨皮、保护、推拉可以在拖动中不断更新同一笔 */
function stroke(msg: Extract<WorkerRequest, { type: 'stroke' }>) {
  const s = { points: msg.points, radius: msg.radius }
  let op: ManualOp
  if (msg.tool === 'heal' || msg.tool === 'erase') {
    const base = patchedBase()
    const patch = msg.tool === 'heal' ? healPatch(base, width, height, s) : erasePatch(base, width, height, s, msg.strokeId)
    op = { kind: 'patch', strokeId: msg.strokeId, ...patch }
  }
  else if (msg.tool === 'push') {
    op = pushOp(msg.strokeId, s)
  }
  else {
    op = { kind: 'mask', strokeId: msg.strokeId, tool: msg.tool, stroke: s }
  }
  const ops = active(history)
  const last = ops[ops.length - 1]
  history = last && last.strokeId === msg.strokeId ? replaceLast(history, op) : push(history, op)
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  try {
    switch (msg.type) {
      case 'init':
        width = msg.width
        height = msg.height
        original = msg.rgba
        patched = null
        patchedOps = []
        history = createHistory()
        params = { ...ZERO_PARAMS }
        preps = msg.faces.map(face => prepareFace(msg.rgba, width, height, face))
        post({ type: 'ready' })
        return
      case 'render':
        params = { ...msg.params }
        break
      case 'stroke':
        stroke(msg)
        break
      case 'undo':
        history = undo(history)
        break
      case 'redo':
        history = redo(history)
        break
    }
    if (!original) throw new Error('图片尚未初始化')
    render()
  }
  catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
})

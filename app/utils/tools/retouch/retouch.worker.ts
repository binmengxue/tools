/**
 * 人像美颜的后台计算线程：持有原图、每张脸的遮罩和手动操作记录，收到请求后计算结果并传回。
 * 放在 Worker 里，拖动滑杆、涂抹时页面不会卡顿。
 */
import { finishRender, prepareFace, renderSkin, skinKey, ZERO_PARAMS } from './engine'
import type { FacePrep, RetouchParams } from './engine'
import { active, canRedo, canUndo, createHistory, push, redo, replaceLast, undo } from './history'
import type { History } from './history'
import { applyPatches, chinOp, erasePatch, healPatch, pushOp } from './manual'
import type { ManualOp, ManualTool } from './manual'
import type { Point } from './regions'
import { applyWarpSequence } from './warp'

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
/** 底图内容每变化一次加 1，用于判断皮肤阶段缓存是否还能用 */
let patchedVersion = 0

// 皮肤阶段的缓存：只拖动瘦脸、去双下巴，或只做推拉、磨皮画笔时不必重算
let skinCache: { key: string, version: number, rgba: Uint8ClampedArray, spots: number } | null = null

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
    patchedVersion++
  }
  const added = patches.slice(patchedOps.length)
  if (added.length) {
    applyPatches(patched!, width, added)
    patchedVersion++
  }
  patchedOps = patches
  return patched!
}

function render() {
  const start = performance.now()
  const ops = active(history)
  const base = patchedBase()
  const key = skinKey(params)
  if (!skinCache || skinCache.key !== key || skinCache.version !== patchedVersion) {
    const skin = renderSkin(base, width, preps, params)
    skinCache = { key, version: patchedVersion, rgba: skin.rgba, spots: skin.spots }
  }
  const rgba = renderWithLivePush(skinCache.rgba, base, ops)
  const spots = skinCache.spots
  post({
    type: 'result',
    rgba,
    spots,
    ms: Math.round(performance.now() - start),
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  }, [rgba.buffer])
}

// 推拉画笔拖动中：最后一笔之前的结果不变，缓存起来，每次只重新应用最后一笔，拖动更跟手
let prefixCache: { skin: Uint8ClampedArray, slim: number, chin: number, ops: ManualOp[], rgba: Uint8ClampedArray } | null = null

function renderWithLivePush(skin: Uint8ClampedArray, base: Uint8ClampedArray, ops: ManualOp[]): Uint8ClampedArray {
  const last = ops[ops.length - 1]
  if (!last || last.kind !== 'push') {
    prefixCache = null
    return finishRender(skin, base, width, height, preps, params, ops)
  }
  const prefixOps = ops.slice(0, -1)
  const reusable = prefixCache !== null
    && prefixCache.skin === skin
    && prefixCache.slim === params.slim
    && prefixCache.chin === params.chin
    && prefixCache.ops.length === prefixOps.length
    && prefixCache.ops.every((op, i) => op === prefixOps[i])
  if (!reusable) {
    prefixCache = {
      skin,
      slim: params.slim,
      chin: params.chin,
      ops: prefixOps,
      rgba: finishRender(skin, base, width, height, preps, params, prefixOps),
    }
  }
  const out = prefixCache!.rgba.slice()
  applyWarpSequence(out, width, height, last.controls)
  return out
}

/** 处理一笔：修复 / 消除 / 收下巴在落笔结束时计算；磨皮、保护、推拉可以在拖动中不断更新同一笔 */
function stroke(msg: Extract<WorkerRequest, { type: 'stroke' }>) {
  const s = { points: msg.points, radius: msg.radius }
  let op: ManualOp | null
  if (msg.tool === 'heal' || msg.tool === 'erase') {
    const base = patchedBase()
    const patch = msg.tool === 'heal' ? healPatch(base, width, height, s) : erasePatch(base, width, height, s, msg.strokeId)
    op = { kind: 'patch', strokeId: msg.strokeId, ...patch }
  }
  else if (msg.tool === 'push') {
    op = pushOp(msg.strokeId, s)
  }
  else if (msg.tool === 'chin') {
    // 没有人脸或涂在脸内侧时不产生操作
    op = chinOp(msg.strokeId, s, preps)
    if (!op) return
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
        skinCache = null
        prefixCache = null
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

<script setup lang="ts">
// 工具页：人像美颜（AI 识别人脸 + 本地图像处理，照片不上传）
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import RetouchCanvas from '~/components/retouch/RetouchCanvas.vue'
import { getTool } from '~/config/tools'
import { fitSize, formatBytes, validateImageFile } from '~/utils/tools/image'
import { BEAUTY_PRESET, ZERO_PARAMS } from '~/utils/tools/retouch/engine'
import type { RetouchParams } from '~/utils/tools/retouch/engine'
import type { ManualTool } from '~/utils/tools/retouch/manual'
import {
  FACE_OVAL,
  faceWidth,
  LEFT_EYE,
  LEFT_EYEBROW,
  LEFT_UNDER_EYE,
  LIPS_OUTER,
  RIGHT_EYE,
  RIGHT_EYEBROW,
  RIGHT_UNDER_EYE,
  toPolygon,
} from '~/utils/tools/retouch/regions'
import type { Point } from '~/utils/tools/retouch/regions'

const tool = getTool('portrait-retouch')!

useSeoMeta(toolSeo(tool))

const { show } = useToast()
const { stage: loaderStage, loadedBytes, errorMessage, detect } = useFaceLandmarker()

/** 模型与运行时的总大小（约），用于显示下载进度 */
const MODEL_TOTAL_BYTES = 17_278_518

interface WorkImage {
  name: string
  width: number
  height: number
  /** 处理分辨率下的原图 */
  original: ImageData
}

const work = shallowRef<WorkImage | null>(null)
const result = shallowRef<ImageData | null>(null)
const faces = shallowRef<NormalizedLandmark[][]>([])
const detecting = ref(false)
const workerReady = ref(false)
const showLandmarks = ref(false)
const comparing = ref(false)
const canvas = ref<InstanceType<typeof RetouchCanvas> | null>(null)

const params = reactive<RetouchParams>({ ...ZERO_PARAMS })

const sliders: { key: keyof RetouchParams, label: string, icon: string }[] = [
  { key: 'smooth', label: '磨皮', icon: 'lucide:sparkles' },
  { key: 'blemish', label: '祛斑祛痘', icon: 'lucide:bandage' },
  { key: 'wrinkle', label: '去皱 / 淡化眼袋', icon: 'lucide:waves' },
  { key: 'slim', label: '瘦脸', icon: 'lucide:scan-face' },
  { key: 'chin', label: '去双下巴', icon: 'lucide:smile' },
]

const brushes: { id: ManualTool, label: string, icon: string, hint: string }[] = [
  { id: 'heal', label: '修复', icon: 'lucide:bandage', hint: '点按或涂抹痘印、斑点、细纹，用周围的皮肤填补' },
  { id: 'erase', label: '消除', icon: 'lucide:eraser', hint: '涂抹路人、杂物、电线等，松手后用周围的背景填补' },
  { id: 'smooth', label: '磨皮', icon: 'lucide:brush', hint: '涂抹脖子、手臂等自动识别不到的皮肤' },
  { id: 'protect', label: '保护', icon: 'lucide:shield', hint: '涂抹不想被磨皮的地方，如头发、饰品、衣服花纹' },
  { id: 'push', label: '推拉', icon: 'lucide:move', hint: '用大笔刷，圆心放在要收的轮廓外侧，按住往里轻推；修双下巴用「收下巴」更简单' },
  { id: 'chin', label: '收下巴', icon: 'lucide:chevrons-up', hint: '在双下巴上涂抹，松手后自动往下颌线收紧、淡化褶皱；可多涂几次加强' },
]

/** 需要识别到人脸才能用的画笔 */
const FACE_BRUSHES: ManualTool[] = ['chin']

const activeBrush = ref<ManualTool | null>(null)

/** 各画笔默认大小（占图片短边的比例）：推拉需要大笔刷才能推动轮廓，修复需要小笔刷 */
const BRUSH_SIZE_RATIO: Record<ManualTool, number> = { heal: 0.02, erase: 0.03, smooth: 0.05, protect: 0.04, push: 0.08, chin: 0.06 }
/** 识别到人脸后，变形类画笔的默认大小按脸宽设置（占脸宽的比例） */
const FACE_BRUSH_RATIO: Partial<Record<ManualTool, number>> = { push: 0.15, chin: 0.12 }
/** 每种画笔分别记住自己的大小 */
const brushSizes = reactive<Record<ManualTool, number>>({ heal: 20, erase: 30, smooth: 50, protect: 40, push: 80, chin: 60 })
const brushRadius = computed({
  get: () => brushSizes[activeBrush.value ?? 'heal'],
  set: (value: number) => {
    brushSizes[activeBrush.value ?? 'heal'] = value
  },
})
const zoom = ref<'fit' | '1' | '2'>('fit')
let strokeId = 0

const retouch = useRetouchWorker((rgba) => {
  const image = work.value
  if (!image) return
  result.value = new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, image.width, image.height)
  draw()
})

/** 处理分辨率：长边上限，手机上更小以控制内存 */
function maxSide() {
  return window.innerWidth < 768 ? 1600 : 2560
}

const brushRange = computed(() => {
  const side = work.value ? Math.min(work.value.width, work.value.height) : 1000
  return { min: 2, max: Math.max(10, Math.round(side * 0.15)) }
})

async function onFiles(files: File[]) {
  const file = files[0]
  if (!file) return
  const error = validateImageFile(file)
  if (error) {
    show(error, 'error')
    return
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  }
  catch {
    show('无法读取这张图片，文件可能已损坏', 'error')
    return
  }
  const size = fitSize(bitmap.width, bitmap.height, maxSide(), maxSide())
  const source = document.createElement('canvas')
  source.width = size.width
  source.height = size.height
  const ctx = source.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const original = ctx.getImageData(0, 0, size.width, size.height)

  retouch.dispose()
  workerReady.value = false
  Object.assign(params, ZERO_PARAMS)
  activeBrush.value = null
  zoom.value = 'fit'
  const short = Math.min(size.width, size.height)
  for (const id of Object.keys(BRUSH_SIZE_RATIO) as ManualTool[]) brushSizes[id] = Math.max(4, Math.round(short * BRUSH_SIZE_RATIO[id]))
  work.value = { name: file.name || 'photo', ...size, original }
  result.value = null
  faces.value = []
  await nextTick()
  draw()
  await runDetection(source)
  source.width = 0
}

/** 识别人脸，然后交给后台线程预处理；识别失败也能继续使用画笔 */
async function runDetection(source: HTMLCanvasElement) {
  const image = work.value
  if (!image) return
  detecting.value = true
  try {
    const size = fitSize(source.width, source.height, 1280, 1280)
    const small = document.createElement('canvas')
    small.width = size.width
    small.height = size.height
    small.getContext('2d')!.drawImage(source, 0, 0, size.width, size.height)
    faces.value = await detect(small)
    small.width = 0
  }
  catch {
    // 错误信息由 useFaceLandmarker 记录并显示
    faces.value = []
  }
  finally {
    detecting.value = false
  }
  if (work.value !== image) return
  if (faces.value.length) {
    // 按最大的那张脸设置变形类画笔的大小
    const fw = Math.max(...faces.value.map(face => faceWidth(face, image.width, image.height)))
    for (const [id, ratio] of Object.entries(FACE_BRUSH_RATIO) as [ManualTool, number][]) {
      brushSizes[id] = Math.min(brushRange.value.max, Math.max(4, Math.round(fw * ratio)))
    }
  }
  const points = faces.value.map(face => face.map(p => ({ x: p.x, y: p.y })))
  await retouch.start(image.width, image.height, image.original.data.slice(), points)
  workerReady.value = true
  if (faces.value.length) Object.assign(params, BEAUTY_PRESET)
}

function resetParams() {
  Object.assign(params, ZERO_PARAMS)
}

watch(params, () => {
  if (workerReady.value) retouch.render(params)
}, { deep: true })

/** 绘制到画布：对比时显示原图，可叠加识别区域 */
function draw() {
  const image = work.value
  if (!image || !canvas.value) return
  const source = comparing.value || !result.value ? image.original : result.value
  canvas.value.draw(source, showLandmarks.value && !comparing.value ? ctx => drawLandmarks(ctx, image) : undefined)
}

/** 调试用：画出识别到的人脸区域 */
function drawLandmarks(ctx: CanvasRenderingContext2D, image: WorkImage) {
  const regions: [number[], string][] = [
    [FACE_OVAL, '#22c55e'],
    [LEFT_EYE, '#38bdf8'],
    [RIGHT_EYE, '#38bdf8'],
    [LEFT_EYEBROW, '#a78bfa'],
    [RIGHT_EYEBROW, '#a78bfa'],
    [LIPS_OUTER, '#f43f5e'],
    [LEFT_UNDER_EYE, '#f59e0b'],
    [RIGHT_UNDER_EYE, '#f59e0b'],
  ]
  ctx.lineWidth = Math.max(1.5, image.width / 800)
  for (const face of faces.value) {
    for (const [indices, color] of regions) {
      const polygon = toPolygon(face, indices, image.width, image.height)
      ctx.strokeStyle = color
      ctx.beginPath()
      polygon.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.closePath()
      ctx.stroke()
    }
  }
}

watch([showLandmarks, comparing], draw)

// 画笔
let liveStroke = 0
function onStrokeMove(points: Point[]) {
  if (!activeBrush.value || !workerReady.value) return
  // 推拉画笔：拖动中不断更新同一笔，实时看到效果
  if (!liveStroke) liveStroke = ++strokeId
  retouch.stroke(liveStroke, activeBrush.value, points, brushRadius.value)
}

function onStrokeEnd(points: Point[]) {
  if (!activeBrush.value || !workerReady.value || !points.length) return
  const id = liveStroke || ++strokeId
  liveStroke = 0
  retouch.stroke(id, activeBrush.value, points, brushRadius.value)
}

function brushDisabled(id: ManualTool) {
  return FACE_BRUSHES.includes(id) && !faces.value.length
}

function toggleBrush(id: ManualTool) {
  if (brushDisabled(id)) return
  activeBrush.value = activeBrush.value === id ? null : id
}

const activeBrushHint = computed(() => brushes.find(b => b.id === activeBrush.value)?.hint ?? '')

/** Ctrl+Z 撤销，Ctrl+Y / Ctrl+Shift+Z 重做，Esc 退出画笔 */
function onKeydown(e: KeyboardEvent) {
  if (!workerReady.value) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && (target as HTMLInputElement).type !== 'range') return
  const key = e.key.toLowerCase()
  if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
    e.preventDefault()
    if (retouch.canUndo.value) retouch.undo()
  }
  else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
    e.preventDefault()
    if (retouch.canRedo.value) retouch.redo()
  }
  else if (key === 'escape') {
    activeBrush.value = null
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const statusText = computed(() => {
  if (loaderStage.value === 'downloading') {
    return `正在下载 AI 模型（首次使用需下载，之后会缓存）${formatBytes(loadedBytes.value)} / 约 ${formatBytes(MODEL_TOTAL_BYTES)}`
  }
  if (loaderStage.value === 'initializing') return '正在初始化 AI 模型…'
  if (detecting.value) return '正在识别人脸…'
  if (work.value && !workerReady.value) return '正在分析皮肤区域…'
  if (retouch.error.value) return `处理出错：${retouch.error.value}`
  if (loaderStage.value === 'error') return `AI 模型加载失败（${errorMessage.value}），仍可使用下方画笔`
  if (!work.value) return ''
  return faces.value.length
    ? `识别到 ${faces.value.length} 张人脸`
    : '没有识别到人脸，美颜滑杆不可用，仍可使用画笔修图'
})

const slidersEnabled = computed(() => workerReady.value && faces.value.length > 0)

async function exportImage(type: 'image/jpeg' | 'image/png') {
  const image = work.value
  if (!image) return
  // 用离屏画布导出，不受对比、调试线条影响
  const out = document.createElement('canvas')
  out.width = image.width
  out.height = image.height
  out.getContext('2d')!.putImageData(result.value ?? image.original, 0, 0)
  const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, type, 0.92))
  out.width = 0
  if (!blob) {
    show('导出失败', 'error')
    return
  }
  const base = image.name.replace(/\.[^.]+$/, '') || 'photo'
  downloadBlob(blob, `${base}-美颜.${type === 'image/png' ? 'png' : 'jpg'}`)
}

function reset() {
  retouch.dispose()
  workerReady.value = false
  work.value = null
  result.value = null
  faces.value = []
  activeBrush.value = null
  Object.assign(params, ZERO_PARAMS)
}

const zoomOptions: { value: 'fit' | '1' | '2', label: string }[] = [
  { value: 'fit', label: '适应' },
  { value: '1', label: '100%' },
  { value: '2', label: '200%' },
]

const tips = [
  '首次使用需要下载约 17 MB 的 AI 模型，之后浏览器会缓存。识别到人脸后自动应用「一键美颜」，可用滑杆分别调整。',
  '滑杆处理不到的地方用画笔：「修复」去痘印斑点，「消除」去路人杂物，「磨皮」补涂脖子，「保护」避开头发饰品，「推拉」手动调整轮廓，「收下巴」涂在双下巴上自动收紧。支持 Ctrl+Z 撤销。',
  '修细节时可以放大到 100% 或 200%；按住「对比」查看原图。',
  '照片只在你的浏览器里处理，不会上传到任何服务器。正脸、光线均匀、人脸较大的照片效果最好。',
]
</script>

<template>
  <ToolLayout tool-id="portrait-retouch">
    <FileDrop
      v-if="!work"
      accept="image/jpeg,image/png,image/webp"
      :multiple="false"
      title="拖拽人像照片到这里，或点击选择"
      hint="支持 JPG、PNG、WebP，也可以直接 Ctrl+V 粘贴"
      @files="onFiles"
    />

    <div
      v-else
      class="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_19rem]"
    >
      <!-- 画布 -->
      <div class="min-w-0 space-y-2">
        <RetouchCanvas
          ref="canvas"
          :width="work.width"
          :height="work.height"
          :tool="workerReady ? activeBrush : null"
          :radius="brushRadius"
          :zoom="zoom === 'fit' ? 'fit' : Number(zoom)"
          @stroke-move="onStrokeMove"
          @stroke-end="onStrokeEnd"
        >
          <span
            v-if="comparing"
            class="absolute top-3 left-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white"
          >原图</span>
          <span
            v-if="retouch.busy.value"
            class="absolute top-3 right-3 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white"
          >
            <Icon
              name="lucide:loader-circle"
              class="size-3.5 animate-spin"
            />
            处理中
          </span>
        </RetouchCanvas>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            v-model="zoom"
            :options="zoomOptions"
            group-label="缩放"
          />
          <div class="flex gap-1">
            <button
              type="button"
              class="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
              :disabled="!retouch.canUndo.value"
              title="撤销（Ctrl+Z）"
              @click="retouch.undo()"
            >
              <Icon
                name="lucide:undo-2"
                class="size-4"
              />
              撤销
            </button>
            <button
              type="button"
              class="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
              :disabled="!retouch.canRedo.value"
              title="重做（Ctrl+Y）"
              @click="retouch.redo()"
            >
              <Icon
                name="lucide:redo-2"
                class="size-4"
              />
              重做
            </button>
          </div>
        </div>
      </div>

      <!-- 面板 -->
      <aside class="space-y-4">
        <div class="rounded-xl border border-line bg-surface p-4 text-sm">
          <p
            class="flex items-start gap-1.5"
            :class="retouch.error.value ? 'text-red-600 dark:text-red-400' : 'text-muted'"
          >
            <Icon
              v-if="loaderStage === 'downloading' || loaderStage === 'initializing' || detecting || (work && !workerReady)"
              name="lucide:loader-circle"
              class="mt-0.5 size-4 shrink-0 animate-spin"
            />
            <Icon
              v-else-if="faces.length"
              name="lucide:scan-face"
              class="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            {{ statusText }}
          </p>
          <p class="mt-2 text-xs text-muted">
            {{ work.width }} × {{ work.height }} px
            <template v-if="workerReady && retouch.lastMs.value">
              · 处理用时 {{ retouch.lastMs.value }} ms
            </template>
          </p>
        </div>

        <!-- 自动美颜 -->
        <div
          class="space-y-4 rounded-xl border border-line bg-surface p-4"
          :class="{ 'pointer-events-none opacity-50': !slidersEnabled }"
        >
          <div class="flex gap-2">
            <button
              type="button"
              class="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm text-primary-fg transition hover:opacity-90"
              @click="Object.assign(params, BEAUTY_PRESET)"
            >
              <Icon
                name="lucide:wand-sparkles"
                class="size-4"
              />
              一键美颜
            </button>
            <button
              type="button"
              class="h-9 rounded-lg border border-line px-3 text-sm transition hover:border-primary hover:text-primary"
              @click="resetParams"
            >
              重置
            </button>
          </div>
          <label
            v-for="item in sliders"
            :key="item.key"
            class="block"
          >
            <span class="mb-1 flex items-center justify-between text-sm">
              <span class="flex items-center gap-1.5">
                <Icon
                  :name="item.icon"
                  class="size-4 text-muted"
                />
                {{ item.label }}
              </span>
              <span class="text-xs text-muted tabular-nums">{{ params[item.key] }}</span>
            </span>
            <input
              v-model.number="params[item.key]"
              type="range"
              min="0"
              max="100"
              step="1"
              class="w-full accent-primary"
            >
          </label>
          <p
            v-if="params.blemish > 0 && slidersEnabled"
            class="text-xs text-muted"
          >
            已自动修补 {{ retouch.spots.value }} 处斑点 / 痘印
          </p>
        </div>

        <!-- 画笔 -->
        <div
          class="space-y-3 rounded-xl border border-line bg-surface p-4"
          :class="{ 'pointer-events-none opacity-50': !workerReady }"
        >
          <p class="text-sm font-medium">
            画笔
          </p>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              v-for="brush in brushes"
              :key="brush.id"
              type="button"
              class="flex flex-col items-center gap-1 rounded-lg border py-2 text-xs transition disabled:pointer-events-none disabled:opacity-40"
              :class="activeBrush === brush.id ? 'border-primary bg-primary/10 text-primary' : 'border-line text-muted hover:border-primary/50 hover:text-fg'"
              :aria-pressed="activeBrush === brush.id"
              :disabled="brushDisabled(brush.id)"
              :title="brushDisabled(brush.id) ? '需要识别到人脸才能使用' : brush.hint"
              @click="toggleBrush(brush.id)"
            >
              <Icon
                :name="brush.icon"
                class="size-4"
              />
              {{ brush.label }}
            </button>
          </div>
          <p
            v-if="activeBrushHint"
            class="text-xs text-muted"
          >
            {{ activeBrushHint }}（Esc 退出画笔）
          </p>
          <label class="block">
            <span class="mb-1 flex items-center justify-between text-sm">
              画笔大小
              <span class="text-xs text-muted tabular-nums">{{ brushRadius }} px</span>
            </span>
            <input
              v-model.number="brushRadius"
              type="range"
              :min="brushRange.min"
              :max="brushRange.max"
              step="1"
              class="w-full accent-primary"
            >
          </label>
        </div>

        <!-- 查看与导出 -->
        <div class="space-y-3">
          <button
            type="button"
            class="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-sm transition select-none hover:border-primary hover:text-primary"
            :disabled="!result"
            @pointerdown="comparing = true"
            @pointerup="comparing = false"
            @pointerleave="comparing = false"
            @pointercancel="comparing = false"
          >
            <Icon
              name="lucide:columns-2"
              class="size-4"
            />
            按住对比原图
          </button>
          <label
            v-if="faces.length"
            class="flex cursor-pointer items-center gap-2 text-sm text-muted select-none"
          >
            <input
              v-model="showLandmarks"
              type="checkbox"
              class="size-4 accent-primary"
            >
            显示识别区域
          </label>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm text-primary-fg transition hover:opacity-90"
              @click="exportImage('image/jpeg')"
            >
              <Icon
                name="lucide:download"
                class="size-4"
              />
              下载 JPG
            </button>
            <button
              type="button"
              class="inline-flex h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary hover:text-primary"
              @click="exportImage('image/png')"
            >
              PNG
            </button>
            <button
              type="button"
              class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary hover:text-primary"
              @click="reset"
            >
              <Icon
                name="lucide:image-plus"
                class="size-4"
              />
              换一张
            </button>
          </div>
        </div>
      </aside>
    </div>

    <!-- 使用说明 -->
    <section class="mt-8 rounded-xl border border-line bg-surface p-5">
      <h2 class="font-semibold">
        使用说明
      </h2>
      <ul class="mt-3 list-inside list-disc space-y-1.5 text-sm text-muted">
        <li
          v-for="tip in tips"
          :key="tip"
        >
          {{ tip }}
        </li>
      </ul>
    </section>
  </ToolLayout>
</template>

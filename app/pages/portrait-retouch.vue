<script setup lang="ts">
// 工具页：人像美颜（AI 识别人脸 + 本地图像处理，照片不上传）
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { getTool } from '~/config/tools'
import { fitSize, formatBytes, validateImageFile } from '~/utils/tools/image'
import { BEAUTY_PRESET, ZERO_PARAMS } from '~/utils/tools/retouch/engine'
import type { RetouchParams } from '~/utils/tools/retouch/engine'
import {
  FACE_OVAL,
  LEFT_EYE,
  LEFT_EYEBROW,
  LEFT_UNDER_EYE,
  LIPS_OUTER,
  RIGHT_EYE,
  RIGHT_EYEBROW,
  RIGHT_UNDER_EYE,
  toPolygon,
} from '~/utils/tools/retouch/regions'

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
const preparing = ref(false)
const showLandmarks = ref(false)
const comparing = ref(false)
const display = ref<HTMLCanvasElement | null>(null)

const params = reactive<RetouchParams>({ ...ZERO_PARAMS })

const sliders: { key: keyof RetouchParams, label: string, icon: string }[] = [
  { key: 'smooth', label: '磨皮', icon: 'lucide:sparkles' },
  { key: 'blemish', label: '祛斑祛痘', icon: 'lucide:bandage' },
  { key: 'wrinkle', label: '去皱 / 淡化眼袋', icon: 'lucide:waves' },
]

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
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const original = ctx.getImageData(0, 0, size.width, size.height)

  retouch.dispose()
  Object.assign(params, ZERO_PARAMS)
  work.value = { name: file.name || 'photo', ...size, original }
  result.value = null
  faces.value = []
  await nextTick()
  draw()
  await runDetection(canvas)
  canvas.width = 0
}

/** 识别人脸（用缩小的副本识别，关键点是归一化坐标），然后交给后台线程预处理 */
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
    return
  }
  finally {
    detecting.value = false
  }
  if (!faces.value.length) return
  preparing.value = true
  const points = faces.value.map(face => face.map(p => ({ x: p.x, y: p.y })))
  await retouch.start(image.width, image.height, image.original.data.slice(), points)
  preparing.value = false
  applyPreset()
}

function applyPreset() {
  params.smooth = BEAUTY_PRESET.smooth
  params.blemish = BEAUTY_PRESET.blemish
  params.wrinkle = BEAUTY_PRESET.wrinkle
}

function resetParams() {
  Object.assign(params, ZERO_PARAMS)
}

watch(params, () => {
  if (work.value && faces.value.length && !preparing.value) retouch.render(params)
}, { deep: true })

/** 绘制到显示画布：对比时显示原图 */
function draw() {
  const canvas = display.value
  const image = work.value
  if (!canvas || !image) return
  if (canvas.width !== image.width || canvas.height !== image.height) {
    canvas.width = image.width
    canvas.height = image.height
  }
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(comparing.value || !result.value ? image.original : result.value, 0, 0)
  if (showLandmarks.value && !comparing.value) drawLandmarks(ctx, image)
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

const statusText = computed(() => {
  if (loaderStage.value === 'downloading') {
    return `正在下载 AI 模型（首次使用需下载，之后会缓存）${formatBytes(loadedBytes.value)} / 约 ${formatBytes(MODEL_TOTAL_BYTES)}`
  }
  if (loaderStage.value === 'initializing') return '正在初始化 AI 模型…'
  if (loaderStage.value === 'error') return `AI 模型加载失败：${errorMessage.value}`
  if (detecting.value) return '正在识别人脸…'
  if (preparing.value) return '正在分析皮肤区域…'
  if (retouch.error.value) return `处理出错：${retouch.error.value}`
  if (!work.value) return ''
  return faces.value.length
    ? `识别到 ${faces.value.length} 张人脸`
    : '没有识别到人脸，可以换一张正脸清晰的照片'
})

const ready = computed(() => faces.value.length > 0 && !preparing.value && !detecting.value)

async function exportImage(type: 'image/jpeg' | 'image/png') {
  const image = work.value
  if (!image) return
  // 用离屏画布导出，不受对比、调试线条影响
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')!.putImageData(result.value ?? image.original, 0, 0)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.92))
  canvas.width = 0
  if (!blob) {
    show('导出失败', 'error')
    return
  }
  const base = image.name.replace(/\.[^.]+$/, '') || 'photo'
  downloadBlob(blob, `${base}-美颜.${type === 'image/png' ? 'png' : 'jpg'}`)
}

function reset() {
  retouch.dispose()
  work.value = null
  result.value = null
  faces.value = []
  Object.assign(params, ZERO_PARAMS)
}

const tips = [
  '首次使用需要下载约 17 MB 的 AI 模型，之后浏览器会缓存，再次打开很快。',
  '识别到人脸后会自动应用「一键美颜」，可以再用滑杆分别调整；按住「对比」查看原图。',
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
      <div class="relative flex min-h-80 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2 p-2">
        <canvas
          ref="display"
          class="max-h-[75vh] max-w-full object-contain"
        />
        <span
          v-if="comparing"
          class="absolute top-3 left-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white"
        >原图</span>
        <Icon
          v-if="retouch.busy.value"
          name="lucide:loader-circle"
          class="absolute top-3 right-3 size-5 animate-spin text-white drop-shadow"
        />
      </div>

      <!-- 面板 -->
      <aside class="space-y-4">
        <div class="rounded-xl border border-line bg-surface p-4 text-sm">
          <p
            class="flex items-start gap-1.5"
            :class="loaderStage === 'error' || retouch.error.value ? 'text-red-600 dark:text-red-400' : 'text-muted'"
          >
            <Icon
              v-if="loaderStage === 'downloading' || loaderStage === 'initializing' || detecting || preparing"
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
            <template v-if="ready && retouch.lastMs.value">
              · 处理用时 {{ retouch.lastMs.value }} ms
            </template>
          </p>
        </div>

        <!-- 美颜参数 -->
        <div
          class="space-y-4 rounded-xl border border-line bg-surface p-4"
          :class="{ 'pointer-events-none opacity-50': !ready }"
        >
          <div class="flex gap-2">
            <button
              type="button"
              class="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm text-primary-fg transition hover:opacity-90"
              @click="applyPreset"
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
            v-if="params.blemish > 0 && ready"
            class="text-xs text-muted"
          >
            已自动修补 {{ retouch.spots.value }} 处斑点 / 痘印
          </p>
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

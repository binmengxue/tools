<script setup lang="ts">
// 工具页：人像美颜（AI 识别人脸 + 本地图像处理，照片不上传）
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { getTool } from '~/config/tools'
import { fitSize, formatBytes, validateImageFile } from '~/utils/tools/image'
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
  source: HTMLCanvasElement
}

const work = shallowRef<WorkImage | null>(null)
const faces = shallowRef<NormalizedLandmark[][]>([])
const detecting = ref(false)
const showLandmarks = ref(false)
const display = ref<HTMLCanvasElement | null>(null)

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
  const source = document.createElement('canvas')
  source.width = size.width
  source.height = size.height
  const ctx = source.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()

  work.value = { name: file.name || 'photo', ...size, source }
  faces.value = []
  await nextTick()
  render()
  await runDetection(source)
}

/** 识别人脸：用缩小的副本识别（关键点是归一化坐标，与分辨率无关） */
async function runDetection(source: HTMLCanvasElement) {
  detecting.value = true
  try {
    const size = fitSize(source.width, source.height, 1280, 1280)
    const small = document.createElement('canvas')
    small.width = size.width
    small.height = size.height
    small.getContext('2d')!.drawImage(source, 0, 0, size.width, size.height)
    faces.value = await detect(small)
    small.width = 0
    render()
  }
  catch {
    // 错误信息由 useFaceLandmarker 记录并显示
  }
  finally {
    detecting.value = false
  }
}

/** 绘制到显示画布 */
function render() {
  const canvas = display.value
  const image = work.value
  if (!canvas || !image) return
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image.source, 0, 0)
  if (showLandmarks.value) drawLandmarks(ctx, image)
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

watch(showLandmarks, render)

const statusText = computed(() => {
  if (loaderStage.value === 'downloading') {
    return `正在下载 AI 模型（首次使用需下载，之后会缓存）${formatBytes(loadedBytes.value)} / 约 ${formatBytes(MODEL_TOTAL_BYTES)}`
  }
  if (loaderStage.value === 'initializing') return '正在初始化 AI 模型…'
  if (loaderStage.value === 'error') return `AI 模型加载失败：${errorMessage.value}`
  if (detecting.value) return '正在识别人脸…'
  if (!work.value) return ''
  return faces.value.length
    ? `识别到 ${faces.value.length} 张人脸`
    : '没有识别到人脸，可以换一张正脸清晰的照片'
})

async function exportImage(type: 'image/jpeg' | 'image/png') {
  const canvas = display.value
  const image = work.value
  if (!canvas || !image) return
  // 导出时不带调试线条
  const wasShowing = showLandmarks.value
  if (wasShowing) {
    showLandmarks.value = false
    render()
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.92))
  if (wasShowing) showLandmarks.value = true
  if (!blob) {
    show('导出失败', 'error')
    return
  }
  const base = image.name.replace(/\.[^.]+$/, '') || 'photo'
  downloadBlob(blob, `${base}-美颜.${type === 'image/png' ? 'png' : 'jpg'}`)
}

function reset() {
  if (work.value) work.value.source.width = 0
  work.value = null
  faces.value = []
}

onBeforeUnmount(reset)

const tips = [
  '首次使用需要下载约 17 MB 的 AI 模型，之后浏览器会缓存，再次打开很快。',
  '照片只在你的浏览器里处理，不会上传到任何服务器。',
  '正脸、光线均匀、人脸较大的照片识别效果最好。',
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
      class="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_18rem]"
    >
      <!-- 画布 -->
      <div class="flex min-h-80 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2 p-2">
        <canvas
          ref="display"
          class="max-h-[75vh] max-w-full object-contain"
        />
      </div>

      <!-- 面板 -->
      <aside class="space-y-4">
        <div class="rounded-xl border border-line bg-surface p-4 text-sm">
          <p
            class="flex items-start gap-1.5"
            :class="loaderStage === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted'"
          >
            <Icon
              v-if="loaderStage === 'downloading' || loaderStage === 'initializing' || detecting"
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
          </p>
          <label
            v-if="faces.length"
            class="mt-3 flex cursor-pointer items-center gap-2 text-muted select-none"
          >
            <input
              v-model="showLandmarks"
              type="checkbox"
              class="size-4 accent-primary"
            >
            显示识别区域
          </label>
        </div>

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
            class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary hover:text-primary"
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

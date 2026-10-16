<script setup lang="ts">
// 工具页：图片压缩（Canvas 本地处理）
import { getTool } from '~/config/tools'
import {
  ACCEPTED_TYPES,
  fitSize,
  formatBytes,
  OUTPUT_FORMATS,
  outputFilename,
  resolveOutputType,
  savedPercent,
  supportsQuality,
  validateImageFile,
} from '~/utils/tools/image'
import type { OutputFormat } from '~/utils/tools/image'

const tool = getTool('image-compress')!

useSeoMeta(toolSeo(tool))

type MaxWidth = '0' | '3840' | '2560' | '1920' | '1280' | '800'

const maxWidthOptions: { value: MaxWidth, label: string }[] = [
  { value: '0', label: '不限制' },
  { value: '3840', label: '3840（4K）' },
  { value: '2560', label: '2560' },
  { value: '1920', label: '1920（1080P）' },
  { value: '1280', label: '1280' },
  { value: '800', label: '800' },
]

/** 一次最多处理的图片数量 */
const MAX_ITEMS = 50

interface CompressResult {
  blob: Blob
  url: string
  size: number
  width: number
  height: number
  type: string
  /** 压缩后没有变小，保留了原图 */
  kept: boolean
}

interface ImageItem {
  id: number
  file: File
  originalUrl: string
  originalWidth: number | null
  originalHeight: number | null
  status: 'pending' | 'processing' | 'done' | 'error'
  result: CompressResult | null
  error: string
}

const quality = ref(80)
const format = ref<OutputFormat>('original')
const maxWidth = ref<MaxWidth>('0')

const items = ref<ImageItem[]>([])
const selectedId = ref<number | null>(null)
const rejected = ref<string[]>([])
let nextId = 1

const selected = computed(() => items.value.find(i => i.id === selectedId.value) ?? null)
const doneItems = computed(() => items.value.filter(i => i.status === 'done' && i.result))
const processingIndex = computed(() => items.value.filter(i => i.status === 'done' || i.status === 'error').length)
const busy = computed(() => items.value.some(i => i.status === 'pending' || i.status === 'processing'))

const totals = computed(() => {
  const original = doneItems.value.reduce((sum, i) => sum + i.file.size, 0)
  const compressed = doneItems.value.reduce((sum, i) => sum + i.result!.size, 0)
  return { original, compressed, saved: savedPercent(original, compressed) }
})

/** 当前选项下所有已选图片里是否有输出为 PNG 的（PNG 质量参数无效） */
const outputsPng = computed(() =>
  format.value === 'png' || (format.value === 'original' && items.value.some(i => i.file.type === 'image/png')),
)

/** 用 Canvas 压缩一张图片 */
async function compress(item: ImageItem): Promise<CompressResult> {
  const bitmap = await createImageBitmap(item.file)
  try {
    item.originalWidth = bitmap.width
    item.originalHeight = bitmap.height
    const type = resolveOutputType(item.file.type, format.value)
    const { width, height } = fitSize(bitmap.width, bitmap.height, Number(maxWidth.value))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    // JPG 不支持透明，先铺白底，否则透明区域会变黑
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, type, supportsQuality(type) ? quality.value / 100 : undefined),
    )
    // 释放画布占用的内存
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('编码失败')
    // 浏览器不支持编码为目标格式时会退回 PNG，以实际类型为准
    const actualType = blob.type || type
    const sameSize = width === bitmap.width && height === bitmap.height
    const kept = blob.size >= item.file.size && actualType === item.file.type && sameSize
    const finalBlob: Blob = kept ? item.file : blob
    return {
      blob: finalBlob,
      url: URL.createObjectURL(finalBlob),
      size: finalBlob.size,
      width,
      height,
      type: kept ? item.file.type : actualType,
      kept,
    }
  }
  finally {
    bitmap.close()
  }
}

// 逐张处理，避免同时解码多张大图占满内存；选项变化时作废进行中的结果
let optionsVersion = 0
let running = false
async function runQueue() {
  if (running) return
  running = true
  try {
    for (;;) {
      const item = items.value.find(i => i.status === 'pending')
      if (!item) break
      item.status = 'processing'
      const version = optionsVersion
      try {
        const result = await compress(item)
        if (!items.value.includes(item) || version !== optionsVersion) {
          URL.revokeObjectURL(result.url)
          if (items.value.includes(item)) item.status = 'pending'
          continue
        }
        item.result = result
        item.status = 'done'
      }
      catch {
        item.status = 'error'
        item.error = '无法读取这张图片，文件可能已损坏'
      }
    }
  }
  finally {
    running = false
  }
}

function releaseResult(item: ImageItem) {
  if (item.result) URL.revokeObjectURL(item.result.url)
  item.result = null
}

let optionTimer: ReturnType<typeof setTimeout> | undefined
watch([quality, format, maxWidth], () => {
  clearTimeout(optionTimer)
  optionTimer = setTimeout(() => {
    optionsVersion++
    for (const item of items.value) {
      if (item.status === 'error') continue
      releaseResult(item)
      item.status = 'pending'
    }
    runQueue()
  }, 300)
})

function addFiles(files: File[]) {
  rejected.value = []
  for (const file of files) {
    const error = validateImageFile(file)
    if (error) {
      rejected.value.push(`${file.name || '粘贴的图片'}：${error}`)
      continue
    }
    if (items.value.length >= MAX_ITEMS) {
      rejected.value.push(`一次最多处理 ${MAX_ITEMS} 张，其余图片已忽略`)
      break
    }
    const item: ImageItem = {
      id: nextId++,
      file,
      originalUrl: URL.createObjectURL(file),
      originalWidth: null,
      originalHeight: null,
      status: 'pending',
      result: null,
      error: '',
    }
    items.value.push(item)
    if (selectedId.value === null) selectedId.value = item.id
  }
  runQueue()
}

function removeItem(item: ImageItem) {
  URL.revokeObjectURL(item.originalUrl)
  releaseResult(item)
  items.value = items.value.filter(i => i.id !== item.id)
  if (selectedId.value === item.id) selectedId.value = items.value[0]?.id ?? null
}

function clearAll() {
  for (const item of items.value) {
    URL.revokeObjectURL(item.originalUrl)
    releaseResult(item)
  }
  items.value = []
  selectedId.value = null
  rejected.value = []
}

onBeforeUnmount(() => {
  clearTimeout(optionTimer)
  clearAll()
})

function downloadItem(item: ImageItem) {
  if (!item.result) return
  downloadBlob(item.result.blob, outputFilename(item.file.name || 'image', item.result.type))
}

async function downloadAll() {
  for (const item of doneItems.value) {
    downloadItem(item)
    // 间隔一下，避免浏览器把连续下载当成异常拦截
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}

function savedLabel(item: ImageItem): string {
  if (!item.result) return ''
  if (item.result.kept) return '已是最优，保留原图'
  const saved = savedPercent(item.file.size, item.result.size)
  return saved >= 0 ? `节省 ${saved}%` : `变大 ${-saved}%`
}

const tips = [
  'JPG 和 WebP 可以通过「质量」控制压缩程度，一般 70% ~ 85% 肉眼几乎看不出差别；PNG 是无损格式，想明显变小可以转为 WebP 或 JPG。',
  '照片尺寸很大时，限制「最大宽度」比降低质量更有效，例如发朋友圈、做网页配图选 1920 就够了。',
  '如果压缩后反而比原图大，会自动保留原图。',
  '图片在浏览器本地用 Canvas 处理，不会上传到服务器；处理完关闭页面即释放。',
]
</script>

<template>
  <ToolLayout tool-id="image-compress">
    <!-- 选项 -->
    <div class="mb-4 space-y-4 rounded-xl border border-line bg-surface p-4">
      <div class="flex flex-wrap items-center gap-3">
        <label
          for="quality"
          class="w-16 text-sm text-muted"
        >质量</label>
        <input
          id="quality"
          v-model.number="quality"
          type="range"
          min="10"
          max="100"
          step="5"
          class="w-48 accent-primary"
        >
        <span class="w-10 text-sm tabular-nums">{{ quality }}%</span>
        <span
          v-if="outputsPng"
          class="text-xs text-amber-700 dark:text-amber-400"
        >PNG 为无损格式，质量设置对它无效；想要更小可以转为 WebP 或 JPG</span>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <span class="w-16 text-sm text-muted">输出格式</span>
        <SegmentedControl
          v-model="format"
          :options="OUTPUT_FORMATS"
          group-label="输出格式"
        />
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <label
          for="max-width"
          class="w-16 text-sm text-muted"
        >最大宽度</label>
        <select
          id="max-width"
          v-model="maxWidth"
          class="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-primary"
        >
          <option
            v-for="option in maxWidthOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <span class="text-xs text-muted">超过时等比缩小，不会放大</span>
      </div>
    </div>

    <FileDrop
      :accept="ACCEPTED_TYPES.join(',')"
      title="拖拽图片到这里，或点击选择"
      hint="支持 JPG、PNG、WebP、GIF、BMP，可多选，也可以直接 Ctrl+V 粘贴截图"
      @files="addFiles"
    />

    <!-- 无法处理的文件 -->
    <ul
      v-if="rejected.length"
      class="mt-3 space-y-1 text-sm text-red-600 dark:text-red-400"
      role="alert"
    >
      <li
        v-for="message in rejected"
        :key="message"
        class="flex items-start gap-1.5"
      >
        <Icon
          name="lucide:circle-x"
          class="mt-0.5 size-4 shrink-0"
        />
        {{ message }}
      </li>
    </ul>

    <template v-if="items.length">
      <!-- 汇总 -->
      <div class="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
        <span
          v-if="busy"
          class="flex items-center gap-1.5 text-muted"
        >
          <Icon
            name="lucide:loader-circle"
            class="size-4 animate-spin"
          />
          正在压缩 {{ Math.min(processingIndex + 1, items.length) }} / {{ items.length }}…
        </span>
        <span v-else>共 {{ items.length }} 张</span>
        <span
          v-if="doneItems.length"
          class="text-muted"
        >
          {{ formatBytes(totals.original) }} → {{ formatBytes(totals.compressed) }}
          <span
            class="ml-1 font-medium"
            :class="totals.saved > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'"
          >节省 {{ Math.max(totals.saved, 0) }}%</span>
        </span>
        <div class="ml-auto flex gap-2">
          <button
            type="button"
            class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm text-primary-fg transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
            :disabled="!doneItems.length || busy"
            @click="downloadAll"
          >
            <Icon
              name="lucide:download"
              class="size-4"
            />
            全部下载
          </button>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm transition hover:border-primary hover:text-primary"
            @click="clearAll"
          >
            <Icon
              name="lucide:trash-2"
              class="size-4"
            />
            清空
          </button>
        </div>
      </div>

      <!-- 对比预览 -->
      <div
        v-if="selected"
        class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <figure class="overflow-hidden rounded-xl border border-line bg-surface">
          <div class="flex h-64 items-center justify-center bg-surface-2 sm:h-80">
            <img
              :src="selected.originalUrl"
              alt="原图"
              class="max-h-full max-w-full object-contain"
            >
          </div>
          <figcaption class="flex justify-between gap-2 border-t border-line px-3 py-2 text-sm">
            <span class="font-medium">原图</span>
            <span class="text-muted tabular-nums">
              {{ formatBytes(selected.file.size) }}
              <template v-if="selected.originalWidth"> · {{ selected.originalWidth }} × {{ selected.originalHeight }}</template>
            </span>
          </figcaption>
        </figure>
        <figure class="overflow-hidden rounded-xl border border-line bg-surface">
          <div class="flex h-64 items-center justify-center bg-surface-2 sm:h-80">
            <img
              v-if="selected.result"
              :src="selected.result.url"
              alt="压缩后"
              class="max-h-full max-w-full object-contain"
            >
            <span
              v-else-if="selected.status === 'error'"
              class="text-sm text-red-600 dark:text-red-400"
            >{{ selected.error }}</span>
            <Icon
              v-else
              name="lucide:loader-circle"
              class="size-8 animate-spin text-muted"
            />
          </div>
          <figcaption class="flex justify-between gap-2 border-t border-line px-3 py-2 text-sm">
            <span class="font-medium">压缩后</span>
            <span
              v-if="selected.result"
              class="text-muted tabular-nums"
            >
              {{ formatBytes(selected.result.size) }} · {{ selected.result.width }} × {{ selected.result.height }}
            </span>
          </figcaption>
        </figure>
      </div>

      <!-- 图片列表 -->
      <ul class="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        <li
          v-for="item in items"
          :key="item.id"
          class="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition"
          :class="item.id === selectedId ? 'bg-primary/5' : 'hover:bg-surface-2'"
          @click="selectedId = item.id"
        >
          <img
            :src="item.result?.url ?? item.originalUrl"
            alt=""
            class="size-12 shrink-0 rounded-md border border-line bg-surface-2 object-cover"
          >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">
              {{ item.file.name || '粘贴的图片' }}
            </p>
            <p class="mt-0.5 text-xs text-muted tabular-nums">
              {{ formatBytes(item.file.size) }}
              <template v-if="item.result">
                → {{ formatBytes(item.result.size) }}
              </template>
            </p>
          </div>
          <span
            v-if="item.status === 'done'"
            class="hidden rounded-full px-2 py-0.5 text-xs sm:inline"
            :class="item.result && !item.result.kept && item.result.size < item.file.size ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-surface-2 text-muted'"
          >{{ savedLabel(item) }}</span>
          <span
            v-else-if="item.status === 'error'"
            class="text-xs text-red-600 dark:text-red-400"
          >失败</span>
          <Icon
            v-else
            name="lucide:loader-circle"
            class="size-4 animate-spin text-muted"
          />
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
            :disabled="!item.result"
            title="下载"
            aria-label="下载"
            @click.stop="downloadItem(item)"
          >
            <Icon
              name="lucide:download"
              class="size-4"
            />
          </button>
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-red-500"
            title="移除"
            aria-label="移除"
            @click.stop="removeItem(item)"
          >
            <Icon
              name="lucide:x"
              class="size-4"
            />
          </button>
        </li>
      </ul>
    </template>

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

<script setup lang="ts">
// 工具页：二维码生成
import { getTool } from '~/config/tools'
import { ERROR_LEVELS, validateQrInput } from '~/utils/tools/qrcode'
import type { ErrorLevel } from '~/utils/tools/qrcode'

const tool = getTool('qrcode-generator')!

useSeoMeta(toolSeo(tool))

type Size = '256' | '512' | '1024'

const DEFAULT_DARK = '#000000'
const DEFAULT_LIGHT = '#ffffff'

const sizes: { value: Size, label: string }[] = [
  { value: '256', label: '256 px' },
  { value: '512', label: '512 px' },
  { value: '1024', label: '1024 px' },
]
const levels = ERROR_LEVELS.map(l => ({ value: l.value, label: `${l.value} ${l.label}` }))

const text = ref('')
const level = ref<ErrorLevel>('M')
const size = ref<Size>('512')
const dark = ref(DEFAULT_DARK)
const light = ref(DEFAULT_LIGHT)

const validation = computed(() => validateQrInput(text.value, level.value, dark.value, light.value))
const levelDesc = computed(() => ERROR_LEVELS.find(l => l.value === level.value)?.desc ?? '')

const dataUrl = ref('')
const renderError = ref('')
const { show } = useToast()

// qrcode 库体积不小，用到时才动态加载
type QrModule = typeof import('qrcode')
let qrModule: QrModule | null = null
async function loadQrcode(): Promise<QrModule> {
  if (!qrModule) {
    const mod = await import('qrcode')
    qrModule = ('default' in mod ? mod.default : mod) as QrModule
  }
  return qrModule
}

// 只保留最后一次生成的结果，避免快速输入时旧结果覆盖新结果
let renderId = 0
async function render() {
  const id = ++renderId
  if (!validation.value.ok) {
    dataUrl.value = ''
    renderError.value = ''
    return
  }
  try {
    const qrcode = await loadQrcode()
    const url = await qrcode.toDataURL(text.value, {
      errorCorrectionLevel: level.value,
      width: Number(size.value),
      margin: 2,
      color: { dark: dark.value, light: light.value },
    })
    if (id !== renderId) return
    dataUrl.value = url
    renderError.value = ''
  }
  catch (error) {
    if (id !== renderId) return
    dataUrl.value = ''
    renderError.value = `生成失败：${error instanceof Error ? error.message : String(error)}`
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch([text, level, size, dark, light], () => {
  clearTimeout(timer)
  timer = setTimeout(render, 150)
})
onBeforeUnmount(() => clearTimeout(timer))

// 复制图片需要 ClipboardItem，挂载后再检测，避免水合不一致
const canCopyImage = ref(false)
onMounted(() => {
  canCopyImage.value = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write
})

async function toBlob(): Promise<Blob> {
  const response = await fetch(dataUrl.value)
  return response.blob()
}

async function download() {
  downloadBlob(await toBlob(), 'qrcode.png')
}

async function copyImage() {
  try {
    const blob = await toBlob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
    show('二维码图片已复制')
  }
  catch {
    show('复制失败，请使用下载', 'error')
  }
}

function loadSample() {
  text.value = 'https://tools.sheyinglai.top'
}

function resetColors() {
  dark.value = DEFAULT_DARK
  light.value = DEFAULT_LIGHT
}

const tips = [
  '输入网址时请带上 https:// 开头，手机扫码后才能直接打开链接。',
  '容错级别越高，二维码被遮挡或弄脏后越容易识别，但能容纳的内容越少；一般用「M」即可，需要印刷或加 Logo 时选「H」。',
  '内容越多，二维码越密，建议选择更大的尺寸；前景色要比背景色深，且对比明显，否则可能扫不出来。',
  '二维码在浏览器本地生成，内容不会上传到服务器。',
]
</script>

<template>
  <ToolLayout tool-id="qrcode-generator">
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
      <!-- 表单 -->
      <div class="space-y-5">
        <EditorPane
          v-model="text"
          label="内容"
          placeholder="输入网址或文字，例如 https://tools.sheyinglai.top"
          height="h-40"
          :invalid="!!validation.error && text !== ''"
          wrap
        >
          <template #actions>
            <PaneButton
              icon="lucide:link"
              label="示例"
              @click="loadSample"
            />
            <PaneButton
              icon="lucide:trash-2"
              label="清空"
              :disabled="!text"
              @click="text = ''"
            />
          </template>
          <template #footer>
            <p
              class="border-t border-line px-3 py-2 text-xs tabular-nums"
              :class="validation.bytes > validation.maxBytes ? 'text-red-600 dark:text-red-400' : 'text-muted'"
            >
              {{ validation.bytes.toLocaleString() }} / {{ validation.maxBytes.toLocaleString() }} 字节
            </p>
          </template>
        </EditorPane>

        <!-- 错误与提醒 -->
        <div
          v-if="(validation.error && text !== '') || validation.warnings.length || renderError"
          class="space-y-2 text-sm"
        >
          <p
            v-if="validation.error && text !== ''"
            class="flex items-start gap-1.5 text-red-600 dark:text-red-400"
            role="alert"
          >
            <Icon
              name="lucide:circle-x"
              class="mt-0.5 size-4 shrink-0"
            />
            {{ validation.error }}
          </p>
          <p
            v-if="renderError"
            class="flex items-start gap-1.5 text-red-600 dark:text-red-400"
            role="alert"
          >
            <Icon
              name="lucide:circle-x"
              class="mt-0.5 size-4 shrink-0"
            />
            {{ renderError }}
          </p>
          <p
            v-for="warning in validation.warnings"
            :key="warning"
            class="flex items-start gap-1.5 text-amber-700 dark:text-amber-400"
          >
            <Icon
              name="lucide:triangle-alert"
              class="mt-0.5 size-4 shrink-0"
            />
            {{ warning }}
          </p>
        </div>

        <!-- 选项 -->
        <div class="space-y-4 rounded-xl border border-line bg-surface p-4">
          <div class="flex flex-wrap items-center gap-3">
            <span class="w-16 text-sm text-muted">容错级别</span>
            <SegmentedControl
              v-model="level"
              :options="levels"
              group-label="容错级别"
            />
            <span class="text-xs text-muted">{{ levelDesc }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <span class="w-16 text-sm text-muted">尺寸</span>
            <SegmentedControl
              v-model="size"
              :options="sizes"
              group-label="尺寸"
            />
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <span class="w-16 text-sm text-muted">颜色</span>
            <label class="flex items-center gap-2 text-sm">
              <input
                v-model="dark"
                type="color"
                class="size-8 cursor-pointer rounded border border-line bg-transparent"
                aria-label="前景色"
              >
              前景 <code class="text-xs text-muted">{{ dark }}</code>
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input
                v-model="light"
                type="color"
                class="size-8 cursor-pointer rounded border border-line bg-transparent"
                aria-label="背景色"
              >
              背景 <code class="text-xs text-muted">{{ light }}</code>
            </label>
            <button
              type="button"
              class="text-sm text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
              :disabled="dark === DEFAULT_DARK && light === DEFAULT_LIGHT"
              @click="resetColors"
            >
              恢复默认
            </button>
          </div>
        </div>
      </div>

      <!-- 预览 -->
      <div class="flex flex-col items-center gap-4 rounded-xl border border-line bg-surface p-5 lg:self-start">
        <div class="flex aspect-square w-full max-w-72 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2">
          <img
            v-if="dataUrl"
            :src="dataUrl"
            alt="生成的二维码"
            class="size-full object-contain"
          >
          <div
            v-else
            class="flex flex-col items-center gap-2 text-sm text-muted"
          >
            <Icon
              name="lucide:qr-code"
              class="size-12 opacity-40"
            />
            输入内容后自动生成
          </div>
        </div>
        <p
          v-if="dataUrl"
          class="text-xs text-muted"
        >
          {{ size }} × {{ size }} px · PNG
        </p>
        <div class="flex w-full flex-wrap justify-center gap-2">
          <button
            type="button"
            class="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm text-primary-fg transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
            :disabled="!dataUrl"
            @click="download"
          >
            <Icon
              name="lucide:download"
              class="size-4"
            />
            下载 PNG
          </button>
          <button
            v-if="canCopyImage"
            type="button"
            class="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-4 text-sm transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
            :disabled="!dataUrl"
            @click="copyImage"
          >
            <Icon
              name="lucide:copy"
              class="size-4"
            />
            复制图片
          </button>
        </div>
      </div>
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

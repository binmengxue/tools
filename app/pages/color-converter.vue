<script setup lang="ts">
// 工具页：颜色工具（格式互转、取色、对比度、色阶与配色）
import { getTool } from '~/config/tools'
import {
  contrastBetween,
  formatColor,
  harmonies,
  isLight,
  parseColor,
  shades,
  toHex,
  wcagLevel,
} from '~/utils/tools/color'
import type { Rgb, Rgba, WcagGrade } from '~/utils/tools/color'

const tool = getTool('color-converter')!

useSeoMeta(toolSeo(tool))

const { show } = useToast()

const input = ref('#5b4fe0')
const parsed = computed(() => parseColor(input.value))

// 输入非法时保留上一次有效的颜色，避免预览闪烁
const color = ref<Rgba>({ r: 91, g: 79, b: 224, a: 1 })
watch(parsed, (result) => {
  if (result.ok) color.value = result.color
}, { immediate: true })

const opaqueHex = computed(() => toHex({ r: color.value.r, g: color.value.g, b: color.value.b }))
const formats = computed(() => formatColor(color.value))
const formatRows = computed(() => [
  { label: 'HEX', value: formats.value.hex },
  { label: 'RGB', value: formats.value.rgb },
  { label: 'HSL', value: formats.value.hsl },
  { label: 'HSV / HSB', value: formats.value.hsv },
  { label: 'CMYK', value: formats.value.cmyk },
])
const previewTextColor = computed(() => (isLight(color.value) ? '#1f2133' : '#ffffff'))

/** 原生取色器只支持 #rrggbb，选色后去掉透明度 */
function onPick(e: Event) {
  input.value = (e.target as HTMLInputElement).value
}

function useColor(hex: string) {
  input.value = hex
}

// 屏幕取色（EyeDropper API，目前主要是 Chromium 内核浏览器支持），挂载后再检测
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }
const canEyeDropper = ref(false)
onMounted(() => {
  canEyeDropper.value = 'EyeDropper' in window
})

async function pickFromScreen() {
  const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper
  if (!Ctor) return
  try {
    const { sRGBHex } = await new Ctor().open()
    input.value = sRGBHex
  }
  catch {
    // 用户按 Esc 取消取色，不提示
  }
}

// 对比度检查：当前颜色作为文字，放在白底、黑底和自定义背景上
const customBg = ref('#f2f2f7')
const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

const contrastCards = computed(() => {
  const custom = parseColor(customBg.value)
  const bgs: { label: string, hex: string, rgb: Rgb }[] = [
    { label: '白色背景', hex: '#ffffff', rgb: WHITE },
    { label: '黑色背景', hex: '#000000', rgb: BLACK },
    { label: '自定义背景', hex: customBg.value, rgb: custom.ok ? custom.color : WHITE },
  ]
  return bgs.map((bg) => {
    const ratio = contrastBetween(color.value, bg.rgb)
    return { ...bg, ratio: ratio.toFixed(2), level: wcagLevel(ratio) }
  })
})

function gradeClass(grade: WcagGrade) {
  if (grade === 'AAA') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (grade === 'AA') return 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
  return 'bg-red-500/10 text-red-700 dark:text-red-300'
}

const shadeList = computed(() => shades(color.value))
const harmonyList = computed(() => harmonies(color.value))

/** 色块上的文字颜色 */
function labelColor(hex: string) {
  const result = parseColor(hex)
  return result.ok && isLight(result.color) ? '#1f2133' : '#ffffff'
}

async function copyHex(hex: string) {
  try {
    await navigator.clipboard.writeText(hex)
    show(`已复制 ${hex}`)
  }
  catch {
    show('复制失败，请手动复制', 'error')
  }
}

const tips = [
  '输入框支持 #5b4fe0、#fff、rgb(91, 79, 224)、rgba(…, 0.5)、hsl(245, 70%, 59%) 等写法，各种格式的结果实时显示。',
  '「屏幕取色」可以吸取屏幕上任意位置的颜色（Chrome、Edge 等浏览器支持）。',
  '对比度按 WCAG 2 标准计算：普通文字至少达到 AA（4.5:1），大字至少 3:1，才能保证大多数人看得清。',
  '点击色阶或配色方案里的色块可以设为当前颜色，点击色块下方的色值可以复制。',
]
</script>

<template>
  <ToolLayout tool-id="color-converter">
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
      <!-- 颜色输入与预览 -->
      <div class="space-y-3">
        <div
          class="overflow-hidden rounded-xl border border-line"
          style="background-image: conic-gradient(#ddd 25%, #fff 0 50%, #ddd 0 75%, #fff 0); background-size: 16px 16px;"
        >
          <div
            class="flex h-44 items-end p-4 font-mono text-lg font-semibold"
            :style="{ backgroundColor: formats.rgb, color: previewTextColor }"
          >
            {{ formats.hex }}
          </div>
        </div>
        <div class="flex gap-2">
          <input
            v-model="input"
            type="text"
            aria-label="颜色值"
            placeholder="#5b4fe0、rgb(…)、hsl(…)"
            spellcheck="false"
            class="h-10 min-w-0 flex-1 rounded-lg border bg-surface px-3 font-mono text-sm outline-none focus:border-primary"
            :class="parsed.ok ? 'border-line' : 'border-red-500/60'"
          >
          <input
            :value="opaqueHex"
            type="color"
            aria-label="取色器"
            class="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1"
            @input="onPick"
          >
        </div>
        <p
          v-if="!parsed.ok"
          class="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          <Icon
            name="lucide:circle-x"
            class="mt-0.5 size-4 shrink-0"
          />
          {{ parsed.error }}
        </p>
        <button
          v-if="canEyeDropper"
          type="button"
          class="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-sm transition hover:border-primary hover:text-primary"
          @click="pickFromScreen"
        >
          <Icon
            name="lucide:pipette"
            class="size-4"
          />
          屏幕取色
        </button>
      </div>

      <!-- 各种格式 -->
      <div class="rounded-xl border border-line bg-surface">
        <dl class="divide-y divide-line">
          <div
            v-for="row in formatRows"
            :key="row.label"
            class="flex items-center gap-3 px-4 py-3"
          >
            <dt class="w-20 shrink-0 text-sm text-muted">
              {{ row.label }}
            </dt>
            <dd class="min-w-0 flex-1 truncate font-mono text-sm">
              {{ row.value }}
            </dd>
            <CopyButton
              :text="row.value"
              label=""
              variant="pane"
            />
          </div>
        </dl>
      </div>
    </div>

    <!-- 对比度检查 -->
    <section class="mt-6 rounded-xl border border-line bg-surface p-5">
      <h2 class="font-semibold">
        对比度检查
      </h2>
      <p class="mt-1 text-sm text-muted">
        当前颜色作为文字颜色时，在不同背景上的可读性
      </p>
      <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div
          v-for="card in contrastCards"
          :key="card.label"
          class="overflow-hidden rounded-lg border border-line"
        >
          <div
            class="flex h-24 flex-col justify-center px-4"
            :style="{ backgroundColor: card.hex, color: formats.rgb }"
          >
            <span class="text-2xl font-bold">示例文字 Aa</span>
            <span class="text-sm">轻工具箱 Light Tools</span>
          </div>
          <div class="space-y-2 p-3 text-sm">
            <div class="flex items-center justify-between gap-2">
              <span class="text-muted">{{ card.label }}</span>
              <input
                v-if="card.label === '自定义背景'"
                v-model="customBg"
                type="color"
                aria-label="自定义背景色"
                class="h-7 w-10 cursor-pointer rounded border border-line bg-surface p-0.5"
              >
            </div>
            <p class="font-mono text-lg font-semibold">
              {{ card.ratio }} : 1
            </p>
            <div class="flex flex-wrap gap-1.5 text-xs">
              <span
                class="rounded-full px-2 py-0.5"
                :class="gradeClass(card.level.normal)"
              >普通文字 {{ card.level.normal }}</span>
              <span
                class="rounded-full px-2 py-0.5"
                :class="gradeClass(card.level.large)"
              >大字 {{ card.level.large }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 色阶 -->
    <section class="mt-6 rounded-xl border border-line bg-surface p-5">
      <h2 class="font-semibold">
        同色系深浅
      </h2>
      <div class="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
        <div
          v-for="shade in shadeList"
          :key="shade.label"
          class="text-center"
        >
          <button
            type="button"
            class="flex h-14 w-full items-end justify-center rounded-lg pb-1 text-xs font-medium transition hover:scale-105"
            :style="{ backgroundColor: shade.hex, color: labelColor(shade.hex) }"
            :title="`设为当前颜色 ${shade.hex}`"
            @click="useColor(shade.hex)"
          >
            {{ shade.label }}
          </button>
          <button
            type="button"
            class="mt-1 font-mono text-[11px] text-muted hover:text-fg"
            :title="`复制 ${shade.hex}`"
            @click="copyHex(shade.hex)"
          >
            {{ shade.hex }}
          </button>
        </div>
      </div>
    </section>

    <!-- 配色方案 -->
    <section class="mt-6 rounded-xl border border-line bg-surface p-5">
      <h2 class="font-semibold">
        配色方案
      </h2>
      <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div
          v-for="group in harmonyList"
          :key="group.name"
        >
          <p class="mb-2 text-sm text-muted">
            {{ group.name }}
          </p>
          <div class="flex gap-2">
            <div
              v-for="(hex, i) in group.colors"
              :key="i"
              class="flex-1 text-center"
            >
              <button
                type="button"
                class="h-12 w-full rounded-lg transition hover:scale-105"
                :style="{ backgroundColor: hex }"
                :title="`设为当前颜色 ${hex}`"
                :aria-label="`设为当前颜色 ${hex}`"
                @click="useColor(hex)"
              />
              <button
                type="button"
                class="mt-1 font-mono text-[11px] text-muted hover:text-fg"
                :title="`复制 ${hex}`"
                @click="copyHex(hex)"
              >
                {{ hex }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

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

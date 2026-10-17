<script setup lang="ts">
/**
 * 人像美颜画布：显示图片、缩放、画笔光标与笔画预览，把指针坐标换算成图片像素坐标。
 * 父组件通过 draw(imageData) 更新显示内容。
 * 滚轮以鼠标位置为中心缩放；没选画笔时按住左键拖动图片，选了画笔时按住空格或鼠标中键拖动。
 */
import type { ManualTool } from '~/utils/tools/retouch/manual'
import type { Point } from '~/utils/tools/retouch/regions'

const props = defineProps<{
  width: number
  height: number
  /** 当前画笔；为 null 时只查看，不响应涂抹 */
  tool: ManualTool | null
  /** 画笔半径（图片像素） */
  radius: number
}>()

/** 'fit' 适应窗口，数字为缩放倍数（1 = 图片一个像素对应屏幕一个物理像素） */
const zoom = defineModel<'fit' | number>('zoom', { required: true })

/** 缩放范围（倍数） */
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8

const emit = defineEmits<{
  /** 拖动中（推拉画笔实时预览用） */
  strokeMove: [points: Point[]]
  /** 一笔结束 */
  strokeEnd: [points: Point[]]
}>()

const container = ref<HTMLDivElement | null>(null)
const display = ref<HTMLCanvasElement | null>(null)
const overlay = ref<HTMLCanvasElement | null>(null)
const cursor = ref<{ x: number, y: number, size: number } | null>(null)

let points: Point[] = []
let drawing = false

// 拖动查看
let pan: { x: number, y: number, left: number, top: number } | null = null
const panning = ref(false)
const spaceHeld = ref(false)
let hovering = false

/** 画笔预览颜色 */
const PREVIEW_COLOR: Record<ManualTool, string> = {
  heal: 'rgba(34, 197, 94, 0.45)',
  erase: 'rgba(244, 63, 94, 0.45)',
  smooth: 'rgba(59, 130, 246, 0.4)',
  protect: 'rgba(245, 158, 11, 0.45)',
  push: 'rgba(255, 255, 255, 0)',
  chin: 'rgba(168, 85, 247, 0.4)',
}

function sizeCanvases() {
  for (const canvas of [display.value, overlay.value]) {
    if (canvas && (canvas.width !== props.width || canvas.height !== props.height)) {
      canvas.width = props.width
      canvas.height = props.height
    }
  }
}

/** 更新显示的图像 */
function draw(image: ImageData, decorate?: (ctx: CanvasRenderingContext2D) => void) {
  sizeCanvases()
  const ctx = display.value?.getContext('2d')
  if (!ctx) return
  ctx.putImageData(image, 0, 0)
  decorate?.(ctx)
}

defineExpose({ draw })

/** 指针位置 → 图片像素坐标 */
function toImage(e: PointerEvent): Point {
  const rect = display.value!.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) / rect.width) * props.width,
    y: ((e.clientY - rect.top) / rect.height) * props.height,
  }
}

/** 光标位置与大小（相对画布外框，CSS 像素） */
function updateCursor(e: PointerEvent) {
  if (!props.tool || !display.value) {
    cursor.value = null
    return
  }
  const rect = display.value.getBoundingClientRect()
  const scale = rect.width / props.width
  cursor.value = {
    x: e.clientX - rect.left + display.value.offsetLeft,
    y: e.clientY - rect.top + display.value.offsetTop,
    size: props.radius * 2 * scale,
  }
}

function drawPreview() {
  const canvas = overlay.value
  if (!canvas || !props.tool) return
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (props.tool === 'push' || !points.length) return
  ctx.strokeStyle = PREVIEW_COLOR[props.tool]
  ctx.fillStyle = PREVIEW_COLOR[props.tool]
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = props.radius * 2
  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y)
  if (points.length === 1) {
    ctx.arc(points[0]!.x, points[0]!.y, props.radius, 0, Math.PI * 2)
    ctx.fill()
  }
  else {
    ctx.stroke()
  }
}

function clearPreview() {
  const canvas = overlay.value
  canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
}

function capture(e: PointerEvent) {
  try {
    // 拖出画布外也能继续
    display.value?.setPointerCapture(e.pointerId)
  }
  catch {
    // 个别情况下指针已失效（如触摸被系统取消），忽略即可
  }
}

function onPointerDown(e: PointerEvent) {
  // 拖动图片：中键，或按住空格，或没选画笔时的左键
  if (e.button === 1 || (e.button === 0 && (spaceHeld.value || !props.tool))) {
    if (!container.value) return
    e.preventDefault()
    capture(e)
    pan = { x: e.clientX, y: e.clientY, left: container.value.scrollLeft, top: container.value.scrollTop }
    panning.value = true
    cursor.value = null
    return
  }
  if (!props.tool || e.button !== 0) return
  e.preventDefault()
  capture(e)
  drawing = true
  points = [toImage(e)]
  drawPreview()
}

function onPointerMove(e: PointerEvent) {
  if (pan && container.value) {
    container.value.scrollLeft = pan.left - (e.clientX - pan.x)
    container.value.scrollTop = pan.top - (e.clientY - pan.y)
    return
  }
  if (spaceHeld.value) {
    cursor.value = null
    return
  }
  updateCursor(e)
  if (!drawing) return
  const p = toImage(e)
  const last = points[points.length - 1]!
  // 忽略很小的移动，减少点数
  if (Math.hypot(p.x - last.x, p.y - last.y) < Math.max(1, props.radius * 0.1)) return
  points.push(p)
  drawPreview()
  if (props.tool === 'push') emit('strokeMove', [...points])
}

function onPointerUp() {
  if (pan) {
    pan = null
    panning.value = false
    return
  }
  if (!drawing) return
  drawing = false
  emit('strokeEnd', [...points])
  points = []
  clearPreview()
}

function onPointerEnter() {
  hovering = true
}

function onPointerLeave() {
  hovering = false
  cursor.value = null
}

// 外框可用宽度与窗口高度：「适应窗口」时据此算出显示尺寸
const boxWidth = ref(0)
const viewHeight = ref(0)
let observer: ResizeObserver | null = null

function measure() {
  // 减去左右内边距（p-2）
  if (container.value) boxWidth.value = container.value.clientWidth - 16
  viewHeight.value = window.innerHeight
}

onMounted(() => {
  measure()
  observer = new ResizeObserver(measure)
  if (container.value) observer.observe(container.value)
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})

/** 「适应窗口」时每个图片像素对应的 CSS 像素（不超过 1，小图不放大） */
const fitScale = computed(() =>
  boxWidth.value > 0 ? Math.min(1, boxWidth.value / props.width, (viewHeight.value * 0.75) / props.height) : 0,
)

/** 「适应窗口」时的缩放倍数（与 zoom 同一单位） */
function fitZoom(): number {
  return fitScale.value * (window.devicePixelRatio || 1)
}

/** 滚轮缩放：鼠标下的那个点保持不动；缩小到不超过窗口时回到「适应」 */
async function onWheel(e: WheelEvent) {
  const canvas = display.value
  const box = container.value
  if (!canvas || !box || !e.deltaY) return
  const rect = canvas.getBoundingClientRect()
  const current = (rect.width / props.width) * (window.devicePixelRatio || 1)
  // 鼠标下的位置（占图片宽高的比例）
  const fx = (e.clientX - rect.left) / rect.width
  const fy = (e.clientY - rect.top) / rect.height
  // 鼠标滚轮一格 deltaY 约 100，缩放约 1.2 倍；触控板的 deltaY 小，缩放更细
  const factor = Math.exp(-Math.max(-300, Math.min(300, e.deltaY)) * 0.0018)
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor))
  if (factor < 1 && next <= fitZoom()) {
    zoom.value = 'fit'
    return
  }
  zoom.value = Math.round(next * 1000) / 1000
  await nextTick()
  const after = canvas.getBoundingClientRect()
  box.scrollLeft += after.left + fx * after.width - e.clientX
  box.scrollTop += after.top + fy * after.height - e.clientY
}

/** 按住空格临时切换为拖动（鼠标在画布上时才拦截，不影响页面其他地方） */
function onKeydown(e: KeyboardEvent) {
  if (e.code !== 'Space' || !hovering) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  e.preventDefault()
  spaceHeld.value = true
  cursor.value = null
}

function onKeyup(e: KeyboardEvent) {
  if (e.code === 'Space') spaceHeld.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
})

/** 鼠标样式：拖动中为握拳，可拖动时为张开的手，使用画笔时隐藏（显示圆圈） */
const pointerClass = computed(() => {
  if (panning.value) return 'cursor-grabbing touch-none'
  if (spaceHeld.value || (!props.tool && zoom.value !== 'fit')) return 'cursor-grab'
  return props.tool ? 'cursor-none touch-none' : ''
})

watch(() => [props.width, props.height], sizeCanvases)
onMounted(sizeCanvases)

/** 缩放：适应窗口时按外框大小算出宽度（尚未测量时用最大宽高限制），放大时按倍数显示并可滚动 */
const canvasStyle = computed(() => {
  if (zoom.value === 'fit') {
    return fitScale.value > 0
      ? { width: `${props.width * fitScale.value}px` }
      : { maxWidth: '100%', maxHeight: '75vh' }
  }
  return { width: `${props.width * zoom.value / (import.meta.client ? window.devicePixelRatio || 1 : 1)}px` }
})
</script>

<template>
  <div
    ref="container"
    class="relative flex max-h-[78vh] overflow-auto rounded-xl border border-line bg-surface-2 p-2"
    :class="{ 'min-h-80': zoom === 'fit' }"
    @wheel.prevent="onWheel"
  >
    <!-- 自动外边距：图片比外框小时居中，比外框大时可以滚动到每一边 -->
    <div class="relative m-auto shrink-0 leading-none">
      <canvas
        ref="display"
        class="block"
        :class="pointerClass"
        :style="canvasStyle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerenter="onPointerEnter"
        @pointerleave="onPointerLeave"
        @mousedown.middle.prevent
      />
      <canvas
        ref="overlay"
        class="pointer-events-none absolute inset-0 size-full"
      />
      <div
        v-if="cursor"
        class="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
        :style="{
          left: `${cursor.x - cursor.size / 2}px`,
          top: `${cursor.y - cursor.size / 2}px`,
          width: `${cursor.size}px`,
          height: `${cursor.size}px`,
        }"
      />
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * 人像美颜画布：显示图片、缩放、画笔光标与笔画预览，把指针坐标换算成图片像素坐标。
 * 父组件通过 draw(imageData) 更新显示内容。
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
  /** 'fit' 适应窗口，数字为缩放倍数 */
  zoom: 'fit' | number
}>()

const emit = defineEmits<{
  /** 拖动中（推拉画笔实时预览用） */
  strokeMove: [points: Point[]]
  /** 一笔结束 */
  strokeEnd: [points: Point[]]
}>()

const display = ref<HTMLCanvasElement | null>(null)
const overlay = ref<HTMLCanvasElement | null>(null)
const cursor = ref<{ x: number, y: number, size: number } | null>(null)

let points: Point[] = []
let drawing = false

/** 画笔预览颜色 */
const PREVIEW_COLOR: Record<ManualTool, string> = {
  heal: 'rgba(34, 197, 94, 0.45)',
  erase: 'rgba(244, 63, 94, 0.45)',
  smooth: 'rgba(59, 130, 246, 0.4)',
  protect: 'rgba(245, 158, 11, 0.45)',
  push: 'rgba(255, 255, 255, 0)',
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

function onPointerDown(e: PointerEvent) {
  if (!props.tool || e.button !== 0) return
  e.preventDefault()
  try {
    // 拖出画布外也能继续这一笔
    display.value?.setPointerCapture(e.pointerId)
  }
  catch {
    // 个别情况下指针已失效（如触摸被系统取消），忽略即可
  }
  drawing = true
  points = [toImage(e)]
  drawPreview()
}

function onPointerMove(e: PointerEvent) {
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
  if (!drawing) return
  drawing = false
  emit('strokeEnd', [...points])
  points = []
  clearPreview()
}

function onPointerLeave() {
  cursor.value = null
}

watch(() => [props.width, props.height], sizeCanvases)
onMounted(sizeCanvases)

/** 缩放：适应窗口时限制最大宽高，放大时按像素尺寸显示并可滚动 */
const canvasStyle = computed(() =>
  props.zoom === 'fit'
    ? { maxWidth: '100%', maxHeight: '75vh' }
    : { width: `${props.width * props.zoom / (import.meta.client ? window.devicePixelRatio || 1 : 1)}px`, maxWidth: 'none' },
)
</script>

<template>
  <div
    class="relative max-h-[78vh] overflow-auto rounded-xl border border-line bg-surface-2"
    :class="zoom === 'fit' ? 'flex min-h-80 items-center justify-center p-2' : 'p-2'"
  >
    <div class="relative inline-block">
      <canvas
        ref="display"
        class="block"
        :class="tool ? 'cursor-none touch-none' : ''"
        :style="canvasStyle"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerLeave"
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

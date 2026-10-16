<script setup lang="ts">
/**
 * 文件选择区：拖拽、点击选择、Ctrl+V 粘贴三种方式
 */
const props = withDefaults(defineProps<{
  /** input 的 accept 属性 */
  accept?: string
  multiple?: boolean
  /** 是否监听整个页面的粘贴事件 */
  pasteable?: boolean
  title?: string
  hint?: string
}>(), {
  accept: '',
  multiple: true,
  pasteable: true,
  title: '拖拽文件到这里，或点击选择',
  hint: '',
})

const emit = defineEmits<{ files: [files: File[]] }>()

const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
// dragenter / dragleave 会在子元素间反复触发，用计数判断是否真的离开
let dragDepth = 0

function emitFiles(list: FileList | File[] | null | undefined) {
  const files = Array.from(list ?? [])
  if (files.length) emit('files', props.multiple ? files : files.slice(0, 1))
}

function onChange(e: Event) {
  const target = e.target as HTMLInputElement
  emitFiles(target.files)
  // 清空，允许再次选择同一个文件
  target.value = ''
}

function onDragEnter() {
  dragDepth++
  dragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

function onDrop(e: DragEvent) {
  dragDepth = 0
  dragging.value = false
  emitFiles(e.dataTransfer?.files)
}

function onPaste(e: ClipboardEvent) {
  // 在输入框里粘贴文字时不拦截
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  const files = Array.from(e.clipboardData?.files ?? [])
  if (files.length) {
    e.preventDefault()
    emitFiles(files)
  }
}

onMounted(() => {
  if (props.pasteable) window.addEventListener('paste', onPaste)
})
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
</script>

<template>
  <div
    class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition"
    :class="dragging ? 'border-primary bg-primary/5' : 'border-line bg-surface hover:border-primary/50'"
    role="button"
    tabindex="0"
    @click="input?.click()"
    @keydown.enter.prevent="input?.click()"
    @keydown.space.prevent="input?.click()"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <Icon
      name="lucide:upload"
      class="size-8 text-primary"
    />
    <p class="font-medium">
      {{ title }}
    </p>
    <p
      v-if="hint"
      class="text-sm text-muted"
    >
      {{ hint }}
    </p>
    <input
      ref="input"
      type="file"
      class="hidden"
      :accept="accept"
      :multiple="multiple"
      @change="onChange"
    >
  </div>
</template>

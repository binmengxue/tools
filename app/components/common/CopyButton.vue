<script setup lang="ts">
/**
 * 一键复制按钮
 * text 可以是字符串，也可以是点击时才求值的函数（如复制当前页面链接）。
 */
const props = withDefaults(defineProps<{
  text: string | (() => string)
  label?: string
  successMessage?: string
}>(), {
  label: '复制',
  successMessage: '已复制到剪贴板',
})

const { copy } = useClipboard()
const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function onClick() {
  const value = typeof props.text === 'function' ? props.text() : props.text
  const ok = await copy(value, props.successMessage)
  if (!ok) return
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1500)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <button
    type="button"
    class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-fg transition hover:border-primary hover:text-primary"
    @click="onClick"
  >
    <Icon
      :name="copied ? 'lucide:check' : 'lucide:copy'"
      class="size-4"
      :class="{ 'text-emerald-500': copied }"
    />
    <span>{{ copied ? '已复制' : label }}</span>
  </button>
</template>

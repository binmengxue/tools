<script setup lang="ts">
/**
 * 面板标题栏里的小按钮（图标 + 文字）
 */
defineProps<{
  icon: string
  label: string
  disabled?: boolean
}>()
</script>

<template>
  <button
    type="button"
    class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted transition hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
    :disabled="disabled"
  >
    <Icon
      :name="icon"
      class="size-4"
    />
    {{ label }}
  </button>
</template>

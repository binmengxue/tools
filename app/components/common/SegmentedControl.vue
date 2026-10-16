<script setup lang="ts" generic="T extends string">
/**
 * 分段选择器（单选），用于模式、缩进等少量选项的切换
 */
defineProps<{
  options: { value: T, label: string }[]
  /** 整组的无障碍名称 */
  groupLabel: string
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="inline-flex rounded-lg border border-line bg-surface-2 p-0.5"
    role="radiogroup"
    :aria-label="groupLabel"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="h-8 rounded-md px-3 text-sm whitespace-nowrap transition"
      :class="model === option.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

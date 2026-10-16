<script setup lang="ts">
/**
 * 文本编辑面板：标题栏（标题 + 操作按钮插槽）+ 等宽 textarea + 底部插槽。
 * 输入区、输出区通用，readonly 时作为结果展示。
 */
withDefaults(defineProps<{
  label: string
  placeholder?: string
  readonly?: boolean
  /** 标红边框，表示内容有误 */
  invalid?: boolean
  /** 是否自动换行；代码类内容建议关闭，保留横向滚动 */
  wrap?: boolean
  /** 文本框高度（Tailwind 类名） */
  height?: string
}>(), {
  placeholder: '',
  readonly: false,
  invalid: false,
  wrap: false,
  height: 'h-80 lg:h-[32rem]',
})

const model = defineModel<string>({ default: '' })
</script>

<template>
  <div
    class="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface transition"
    :class="invalid ? 'border-red-500/60' : 'border-line focus-within:border-primary/60'"
  >
    <div class="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
      <span class="text-sm font-medium">{{ label }}</span>
      <div class="flex items-center gap-1">
        <slot name="actions" />
      </div>
    </div>
    <textarea
      v-model="model"
      :readonly="readonly"
      :placeholder="placeholder"
      :wrap="wrap ? 'soft' : 'off'"
      :aria-label="label"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      class="min-h-40 w-full resize-y bg-transparent p-3 font-mono text-sm leading-6 text-fg outline-none placeholder:text-muted"
      :class="height"
    />
    <slot name="footer" />
  </div>
</template>

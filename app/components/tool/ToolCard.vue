<script setup lang="ts">
import type { Tool } from '~/config/tools'

defineProps<{ tool: Tool }>()
</script>

<template>
  <NuxtLink
    :to="tool.path"
    class="group flex flex-col rounded-xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-black/5 focus-visible:outline-2 focus-visible:outline-primary"
  >
    <Icon
      :name="tool.icon"
      class="size-6"
      :class="tool.color"
    />
    <h3 class="mt-3 text-base font-semibold text-fg">
      {{ tool.name }}
    </h3>
    <p class="mt-1 line-clamp-2 text-sm text-muted">
      {{ tool.desc }}
    </p>
    <span
      class="mt-4 inline-flex items-center gap-1 text-sm font-medium"
      :class="tool.color"
    >
      立即使用
      <Icon
        name="lucide:arrow-right"
        class="size-4 transition group-hover:translate-x-0.5"
      />
    </span>
  </NuxtLink>
</template>

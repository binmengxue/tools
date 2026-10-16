<script setup lang="ts">
import { site } from '~/config/site'
</script>

<template>
  <footer class="mt-16 border-t border-line">
    <div class="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted">
      <p>本地处理优先 · 保护用户隐私 · 持续更新</p>
      <p>
        © {{ site.since }} {{ site.name }}
        <span class="mx-1.5">·</span>
        <a
          :href="site.icpLink"
          target="_blank"
          rel="noopener noreferrer"
          class="transition hover:text-fg"
        >{{ site.icp }}</a>
      </p>
    </div>
  </footer>
</template>

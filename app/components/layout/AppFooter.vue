<script setup lang="ts">
import { site } from '~/config/site'
</script>

<template>
  <footer class="mt-12 border-t border-line">
    <div class="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-6 text-center text-sm text-muted">
      <p class="flex items-center gap-1.5">
        <Icon
          name="lucide:shield-check"
          class="size-4 text-emerald-500"
        />
        所有工具均在浏览器本地运行，数据不会上传到服务器
      </p>
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

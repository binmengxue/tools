<script setup lang="ts">
import { site } from '~/config/site'

const { toggleTheme } = useTheme()

const links = [
  { to: '/#tools', label: '全部工具' },
  { to: '/about', label: '关于' },
]
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
      <!-- Logo -->
      <NuxtLink
        to="/"
        class="flex shrink-0 items-center gap-2.5"
        :aria-label="`${site.name}首页`"
      >
        <span class="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-fg">
          <Icon
            name="lucide:wrench"
            class="size-5"
          />
        </span>
        <span class="text-lg font-bold">{{ site.name }}</span>
      </NuxtLink>

      <!-- 导航 -->
      <nav class="ml-auto flex items-center gap-1 text-sm">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="rounded-lg px-3 py-2 text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          {{ link.label }}
        </NuxtLink>
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg"
          title="切换浅色 / 深色主题"
          aria-label="切换浅色 / 深色主题"
          @click="toggleTheme"
        >
          <!-- 两个图标都渲染，由 CSS 按主题显示，避免水合不一致 -->
          <Icon
            name="lucide:moon"
            class="size-5 dark:hidden"
          />
          <Icon
            name="lucide:sun"
            class="hidden size-5 dark:block"
          />
        </button>
      </nav>
    </div>
  </header>
</template>

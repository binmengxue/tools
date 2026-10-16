<script setup lang="ts">
import { site } from '~/config/site'

const route = useRoute()
const { query, tab } = useHomeFilter()
const { toggleTheme } = useTheme()

const searchInput = ref<HTMLInputElement | null>(null)

/** 在工具页输入搜索词时跳回首页展示结果 */
function onSearchInput() {
  if (route.path !== '/') navigateTo('/')
}

function clearSearch() {
  query.value = ''
  searchInput.value?.blur()
}

/** 打开「我的收藏」Tab */
function openFavorites() {
  tab.value = 'favorites'
  query.value = ''
  if (route.path !== '/') navigateTo('/')
}

/** Ctrl+K / ⌘K 聚焦搜索框 */
function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchInput.value?.focus()
    searchInput.value?.select()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6">
      <!-- Logo -->
      <NuxtLink
        to="/"
        class="flex shrink-0 items-center gap-2"
        :aria-label="`${site.name}首页`"
      >
        <span class="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-fg">
          <Icon
            name="lucide:zap"
            class="size-5"
          />
        </span>
        <span class="hidden text-lg font-bold tracking-wide sm:inline">{{ site.name }}</span>
      </NuxtLink>

      <!-- 搜索 -->
      <div class="relative min-w-0 flex-1 sm:max-w-xl">
        <Icon
          name="lucide:search"
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        />
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="搜索工具，如 JSON、时间戳"
          aria-label="搜索工具"
          class="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm text-fg outline-none transition placeholder:text-muted focus:border-primary sm:pr-20 [&::-webkit-search-cancel-button]:hidden"
          @input="onSearchInput"
          @keydown.esc="clearSearch"
        >
        <kbd class="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs text-muted sm:block">
          Ctrl K
        </kbd>
      </div>

      <!-- 右侧操作 -->
      <nav class="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          class="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted transition hover:bg-surface hover:text-fg"
          title="我的收藏"
          @click="openFavorites"
        >
          <Icon
            name="lucide:star"
            class="size-5"
          />
          <span class="hidden md:inline">我的收藏</span>
        </button>
        <button
          type="button"
          class="flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-fg"
          title="切换深色 / 浅色主题"
          aria-label="切换深色 / 浅色主题"
          @click="toggleTheme"
        >
          <!-- 两个图标都渲染，由 CSS 按主题显示，避免水合不一致 -->
          <Icon
            name="lucide:sun"
            class="size-5 light:hidden"
          />
          <Icon
            name="lucide:moon"
            class="hidden size-5 light:block"
          />
        </button>
      </nav>
    </div>
  </header>
</template>

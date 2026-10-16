<script setup lang="ts">
import { categories } from '~/config/categories'
import { site } from '~/config/site'
import { tools } from '~/config/tools'

useSeoMeta({
  description: site.description,
  ogTitle: `${site.name} - ${site.slogan}`,
  ogDescription: site.description,
})

const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

const groups = computed(() => groupTools(tools, categories, query.value))

function clearSearch() {
  query.value = ''
  searchInput.value?.blur()
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
  <div class="mx-auto max-w-5xl px-4">
    <!-- 标题与搜索 -->
    <section class="pt-14 pb-10 text-center sm:pt-20">
      <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
        {{ site.slogan }}
      </h1>
      <p class="mt-3 text-sm text-muted sm:text-base">
        免费在线工具 · 无需注册 · 简单高效
      </p>
      <div class="relative mx-auto mt-8 max-w-3xl">
        <Icon
          name="lucide:search"
          class="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
        />
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="搜索工具，例如 JSON、文本对比……"
          aria-label="搜索工具"
          class="h-13 w-full rounded-xl border border-line bg-surface pr-4 pl-12 text-base text-fg shadow-sm outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/10 sm:pr-20 [&::-webkit-search-cancel-button]:hidden"
          @keydown.esc="clearSearch"
        >
        <kbd class="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs text-muted sm:block">
          Ctrl K
        </kbd>
      </div>
    </section>

    <!-- 分组卡片 -->
    <section
      id="tools"
      class="scroll-mt-20 space-y-10"
    >
      <div
        v-for="group in groups"
        :key="group.category.id"
      >
        <h2 class="mb-4 text-lg font-semibold">
          {{ group.category.name }}
        </h2>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ToolCard
            v-for="t in group.tools"
            :key="t.id"
            :tool="t"
          />
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-if="groups.length === 0"
        class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-16 text-center text-muted"
      >
        <Icon
          name="lucide:search-x"
          class="size-10 opacity-60"
        />
        <p>没有找到与「{{ query.trim() }}」相关的工具</p>
        <button
          type="button"
          class="mt-1 text-sm text-primary hover:underline"
          @click="query = ''"
        >
          清除搜索
        </button>
      </div>
    </section>
  </div>
</template>

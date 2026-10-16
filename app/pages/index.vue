<script setup lang="ts">
import { categories } from '~/config/categories'
import { site } from '~/config/site'
import { tools } from '~/config/tools'
import type { TabId } from '~/utils/search'

useSeoMeta({
  description: site.description,
  ogTitle: `${site.name} - 免费中文在线效率工具`,
  ogDescription: site.description,
})

const { query, tab } = useHomeFilter()
const { favorites } = useFavorites()
const { recent, clearRecent } = useRecent()

interface TabItem {
  id: TabId
  name: string
  icon: string
}

// Tab 顺序：全部工具 / 常用工具 / 我的收藏 / 其余分类
const commonCategory = categories.find(c => c.id === 'common')!
const tabs: TabItem[] = [
  { id: 'all', name: '全部工具', icon: 'lucide:layout-grid' },
  { id: 'common', name: commonCategory.name, icon: commonCategory.icon },
  { id: 'favorites', name: '我的收藏', icon: 'lucide:star' },
  ...categories.filter(c => c.id !== 'common').map(c => ({ id: c.id, name: c.name, icon: c.icon })),
]

/** 每个 Tab 下的工具数量（收藏数在客户端读取后才更新） */
function countOf(id: TabId) {
  return filterTools(tools, { tab: id, favorites: favorites.value }).length
}

const filtered = computed(() =>
  filterTools(tools, { tab: tab.value, query: query.value, favorites: favorites.value }),
)

const recentTools = computed(() =>
  recent.value
    .map(id => tools.find(t => t.id === id))
    .filter(t => t !== undefined),
)

const showRecent = computed(() => tab.value === 'all' && !query.value.trim() && recentTools.value.length > 0)
const activeTabName = computed(() => tabs.find(t => t.id === tab.value)?.name ?? '')
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-6 sm:py-8">
    <!-- 标题 -->
    <section class="mb-6">
      <h1 class="text-2xl font-bold sm:text-3xl">
        {{ site.name }}
      </h1>
      <p class="mt-2 text-sm text-muted sm:text-base">
        {{ tools.length }} 个免费在线工具，打开即用，数据只在你的浏览器里处理。
      </p>
    </section>

    <!-- 分类 Tab：手机上横向滑动 -->
    <div
      class="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4"
      role="tablist"
      aria-label="工具分类"
    >
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="tab === item.id"
        class="flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition"
        :class="tab === item.id
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-line bg-surface text-muted hover:border-primary/60 hover:text-fg'"
        @click="tab = item.id"
      >
        <Icon
          :name="item.icon"
          class="size-4"
        />
        {{ item.name }}
        <span
          class="text-xs"
          :class="tab === item.id ? 'opacity-80' : 'opacity-60'"
        >{{ countOf(item.id) }}</span>
      </button>
    </div>

    <!-- 最近使用 -->
    <section
      v-if="showRecent"
      class="mb-6"
    >
      <div class="mb-3 flex items-center justify-between">
        <h2 class="flex items-center gap-1.5 text-sm font-medium text-muted">
          <Icon
            name="lucide:history"
            class="size-4"
          />
          最近使用
        </h2>
        <button
          type="button"
          class="text-xs text-muted transition hover:text-fg"
          @click="clearRecent"
        >
          清空
        </button>
      </div>
      <div class="flex flex-wrap gap-2">
        <NuxtLink
          v-for="t in recentTools"
          :key="t.id"
          :to="t.path"
          class="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary hover:text-primary"
        >
          <Icon
            :name="t.icon"
            class="size-4"
          />
          {{ t.name }}
        </NuxtLink>
      </div>
    </section>

    <!-- 搜索提示 -->
    <p
      v-if="query.trim()"
      class="mb-4 text-sm text-muted"
    >
      在「{{ activeTabName }}」中搜索「{{ query.trim() }}」，共 {{ filtered.length }} 个结果
      <button
        type="button"
        class="ml-2 text-primary hover:underline"
        @click="query = ''"
      >
        清除搜索
      </button>
    </p>

    <!-- 卡片网格：4 / 3 / 2 / 1 列 -->
    <div
      v-if="filtered.length"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <ToolCard
        v-for="t in filtered"
        :key="t.id"
        :tool="t"
      />
    </div>

    <!-- 空状态 -->
    <div
      v-else
      class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-6 py-16 text-center text-muted"
    >
      <Icon
        :name="tab === 'favorites' && !query.trim() ? 'lucide:star' : 'lucide:search-x'"
        class="size-10 opacity-60"
      />
      <p v-if="tab === 'favorites' && !query.trim()">
        还没有收藏的工具，点击卡片右上角的星标即可收藏
      </p>
      <p v-else>
        没有找到与「{{ query.trim() }}」相关的工具
      </p>
    </div>
  </div>
</template>

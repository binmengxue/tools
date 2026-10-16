<script setup lang="ts">
/**
 * 工具页通用外壳：面包屑、标题、说明、收藏 / 复制链接操作、内容区、隐私说明。
 * 具体工具的输入区 / 输出区放在默认插槽里，额外按钮放在 actions 插槽。
 */
import { getTool } from '~/config/tools'

const props = defineProps<{ toolId: string }>()

const found = getTool(props.toolId)
if (!found) {
  throw createError({ statusCode: 404, statusMessage: '工具不存在', fatal: true })
}
const tool = found

const tags = toolTags(tool)
const color = toolColor(tool)

const { isFavorite, toggleFavorite } = useFavorites()
const favorited = computed(() => isFavorite(tool.id))

// 记录最近使用（仅客户端）
const { addRecent } = useRecent()
onMounted(() => addRecent(tool.id))

/** 复制当前页面链接（点击时才读取，SSR 不会执行） */
const currentUrl = () => window.location.href
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-6">
    <!-- 面包屑 -->
    <nav
      class="mb-5 flex items-center gap-1.5 text-sm text-muted"
      aria-label="面包屑"
    >
      <NuxtLink
        to="/"
        class="transition hover:text-fg"
      >首页</NuxtLink>
      <Icon
        name="lucide:chevron-right"
        class="size-4"
      />
      <template v-if="tags[0]">
        <span>{{ tags[0].name }}</span>
        <Icon
          name="lucide:chevron-right"
          class="size-4"
        />
      </template>
      <span class="text-fg">{{ tool.name }}</span>
    </nav>

    <!-- 标题区 -->
    <header class="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
      <span
        class="flex size-14 shrink-0 items-center justify-center rounded-xl"
        :class="color"
      >
        <Icon
          :name="tool.icon"
          class="size-8"
        />
      </span>
      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-bold sm:text-2xl">
          {{ tool.name }}
        </h1>
        <p class="mt-1 text-sm text-muted">
          {{ tool.desc }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary"
          :class="favorited ? 'text-amber-400 light:text-amber-500' : 'text-fg'"
          :aria-pressed="favorited"
          @click="toggleFavorite(tool.id)"
        >
          <Icon
            name="lucide:star"
            class="size-4"
            :class="{ 'icon-filled': favorited }"
          />
          {{ favorited ? '已收藏' : '收藏' }}
        </button>
        <CopyButton
          :text="currentUrl"
          label="复制链接"
          success-message="页面链接已复制"
        />
      </div>
    </header>

    <!-- 工具内容 -->
    <section class="mt-6">
      <slot />
    </section>

    <p class="mt-6 flex items-center gap-1.5 text-xs text-muted">
      <Icon
        name="lucide:lock"
        class="size-3.5"
      />
      所有数据仅在浏览器本地处理，不会上传到服务器
    </p>
  </div>
</template>

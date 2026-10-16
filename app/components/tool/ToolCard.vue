<script setup lang="ts">
import type { Tool } from '~/config/tools'

const props = defineProps<{ tool: Tool }>()

const { isFavorite, toggleFavorite } = useFavorites()
const favorited = computed(() => isFavorite(props.tool.id))
const tags = computed(() => toolTags(props.tool))
const color = computed(() => toolColor(props.tool))
</script>

<template>
  <article class="group relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg hover:shadow-black/10">
    <div class="flex items-start gap-3">
      <span
        class="flex size-11 shrink-0 items-center justify-center rounded-lg"
        :class="color"
      >
        <Icon
          :name="tool.icon"
          class="size-6"
        />
      </span>
      <div class="min-w-0 flex-1 pr-7">
        <h3 class="truncate font-semibold">
          <!-- 整张卡片可点击：链接的伪元素铺满卡片 -->
          <NuxtLink
            :to="tool.path"
            class="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-primary"
          >
            {{ tool.name }}
          </NuxtLink>
        </h3>
        <div class="mt-1.5 flex flex-wrap gap-1">
          <span
            v-for="tag in tags"
            :key="tag.id"
            class="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted"
          >{{ tag.name }}</span>
        </div>
      </div>
    </div>
    <p class="line-clamp-2 text-sm leading-relaxed text-muted">
      {{ tool.desc }}
    </p>

    <!-- 收藏星标（层级高于整卡链接） -->
    <button
      type="button"
      class="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-md transition hover:bg-surface-2"
      :class="favorited ? 'text-amber-400 light:text-amber-500' : 'text-muted opacity-60 group-hover:opacity-100'"
      :title="favorited ? '取消收藏' : '收藏'"
      :aria-label="favorited ? `取消收藏${tool.name}` : `收藏${tool.name}`"
      :aria-pressed="favorited"
      @click="toggleFavorite(tool.id)"
    >
      <Icon
        name="lucide:star"
        class="size-4.5"
        :class="{ 'icon-filled': favorited }"
      />
    </button>
  </article>
</template>

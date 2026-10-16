<script setup lang="ts">
/**
 * 全局错误页（含 404）。nuxt generate 会据此生成 404.html，供 nginx 兜底。
 */
import type { NuxtError } from '#app'
import { tools } from '~/config/tools'

const props = defineProps<{ error: NuxtError }>()

const is404 = computed(() => props.error.statusCode === 404)

useHead({ title: is404.value ? '页面不存在' : '出错了' })
useSeoMeta({ robots: 'noindex' })

// 推荐站内工具，减少用户流失
const suggestions = tools

function backHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-bg text-fg">
    <AppHeader />
    <main class="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 py-16 text-center">
      <p class="text-7xl font-bold text-primary sm:text-8xl">
        {{ error.statusCode }}
      </p>
      <h1 class="mt-4 text-xl font-semibold sm:text-2xl">
        {{ is404 ? '页面不存在' : '页面出错了' }}
      </h1>
      <p class="mt-2 text-sm text-muted">
        {{ is404 ? '你访问的页面可能已被移除，或链接地址有误。' : '请稍后刷新重试。' }}
      </p>
      <button
        type="button"
        class="mt-6 inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm text-primary-fg transition hover:opacity-90"
        @click="backHome"
      >
        <Icon
          name="lucide:house"
          class="size-4"
        />
        返回首页
      </button>

      <section class="mt-12 w-full">
        <h2 class="mb-3 text-sm text-muted">
          试试这些常用工具
        </h2>
        <div class="flex flex-wrap justify-center gap-2">
          <!-- 错误状态需先 clearError 再跳转 -->
          <a
            v-for="t in suggestions"
            :key="t.id"
            :href="t.path"
            class="flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary hover:text-primary"
            @click.prevent="clearError({ redirect: t.path })"
          >
            <Icon
              :name="t.icon"
              class="size-4"
            />
            {{ t.name }}
          </a>
        </div>
      </section>
    </main>
    <AppFooter />
  </div>
</template>

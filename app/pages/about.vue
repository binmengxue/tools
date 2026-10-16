<script setup lang="ts">
import { site } from '~/config/site'
import { tools } from '~/config/tools'

useSeoMeta({
  title: '关于',
  description: `关于${site.name}：无需注册、打开即用的中文在线工具，所有数据仅在浏览器本地处理。`,
})

const stack = ['Nuxt 4（Vue 3 + TypeScript）静态生成', 'Tailwind CSS 4', 'Vitest 单元测试', 'nginx 静态部署']
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-12">
    <h1 class="text-2xl font-bold sm:text-3xl">
      关于{{ site.name }}
    </h1>
    <p class="mt-4 leading-relaxed text-muted">
      {{ site.name }}是一个无需注册、打开即用的中文在线工具网站，面向经常需要处理文本、代码和文件的开发者、学生和办公人员。目前提供 {{ tools.length }} 个工具，后续会持续更新。
    </p>

    <section class="mt-10 space-y-8">
      <div>
        <h2 class="flex items-center gap-2 text-lg font-semibold">
          <Icon
            name="lucide:shield-check"
            class="size-5 text-emerald-600 dark:text-emerald-400"
          />
          数据只在你的浏览器里处理
        </h2>
        <p class="mt-2 leading-relaxed text-muted">
          所有工具都在浏览器本地运行：你输入的文本、上传的图片不会发送到任何服务器，关闭页面后也不会保留。没有账号体系，也不收集个人信息。
        </p>
      </div>

      <div>
        <h2 class="text-lg font-semibold">
          现有工具
        </h2>
        <ul class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <li
            v-for="t in tools"
            :key="t.id"
          >
            <NuxtLink
              :to="t.path"
              class="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm transition hover:border-primary/40"
            >
              <Icon
                :name="t.icon"
                class="size-4 shrink-0"
                :class="t.color"
              />
              <span class="shrink-0 font-medium">{{ t.name }}</span>
              <span class="truncate text-muted">{{ t.desc }}</span>
            </NuxtLink>
          </li>
        </ul>
      </div>

      <div>
        <h2 class="text-lg font-semibold">
          技术栈
        </h2>
        <ul class="mt-2 list-inside list-disc space-y-1 text-muted">
          <li
            v-for="item in stack"
            :key="item"
          >
            {{ item }}
          </li>
        </ul>
      </div>

      <div>
        <h2 class="text-lg font-semibold">
          反馈
        </h2>
        <p class="mt-2 leading-relaxed text-muted">
          遇到问题或想要新工具，欢迎在 GitHub 上提交 Issue：
          <a
            href="https://github.com/binmengxue/tools/issues"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary hover:underline"
          >github.com/binmengxue/tools</a>
        </p>
      </div>
    </section>
  </div>
</template>

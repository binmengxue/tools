<template>
  <!-- 工具尚未实现时的占位状态 -->
  <div class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
    <span class="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon
        name="lucide:hammer"
        class="size-7"
      />
    </span>
    <h2 class="text-lg font-semibold">
      开发中
    </h2>
    <p class="max-w-md text-sm text-muted">
      这个工具正在开发中，敬请期待。可以先点「收藏」，上线后在首页「我的收藏」里就能找到它。
    </p>
    <NuxtLink
      to="/"
      class="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm text-primary-fg transition hover:opacity-90"
    >
      <Icon
        name="lucide:arrow-left"
        class="size-4"
      />
      返回首页
    </NuxtLink>
  </div>
</template>

<template>
  <!-- 全站 head 设置见 plugins/head.ts，localStorage 初始化见 plugins/client-state.client.ts -->
  <div class="flex min-h-screen flex-col bg-bg text-fg">
    <AppHeader />
    <main class="flex-1">
      <NuxtPage />
    </main>
    <AppFooter />
    <AppToast />
  </div>
</template>

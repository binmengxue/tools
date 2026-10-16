<script setup lang="ts">
// 工具页：代码格式化（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('code-formatter')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="code-formatter">
    <ToolPlaceholder />
  </ToolLayout>
</template>

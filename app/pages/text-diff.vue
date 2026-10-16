<script setup lang="ts">
// 工具页：文本对比（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('text-diff')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="text-diff">
    <ToolPlaceholder />
  </ToolLayout>
</template>

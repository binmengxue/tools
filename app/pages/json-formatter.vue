<script setup lang="ts">
// 工具页：JSON 格式化（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('json-formatter')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="json-formatter">
    <ToolPlaceholder />
  </ToolLayout>
</template>

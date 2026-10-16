<script setup lang="ts">
// 工具页：JSON 编辑器（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('json-editor')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="json-editor">
    <ToolPlaceholder />
  </ToolLayout>
</template>

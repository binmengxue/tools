<script setup lang="ts">
// 工具页：JSON 转换（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('json-converter')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="json-converter">
    <ToolPlaceholder />
  </ToolLayout>
</template>

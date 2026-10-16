<script setup lang="ts">
// 工具页：图片压缩（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('image-compress')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="image-compress">
    <ToolPlaceholder />
  </ToolLayout>
</template>

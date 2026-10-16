<script setup lang="ts">
// 工具页：CSS 渐变生成（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('css-gradient')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="css-gradient">
    <ToolPlaceholder />
  </ToolLayout>
</template>

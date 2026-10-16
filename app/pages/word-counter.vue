<script setup lang="ts">
// 工具页：字数统计（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('word-counter')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="word-counter">
    <ToolPlaceholder />
  </ToolLayout>
</template>

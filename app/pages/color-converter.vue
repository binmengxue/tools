<script setup lang="ts">
// 工具页：颜色转换（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('color-converter')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="color-converter">
    <ToolPlaceholder />
  </ToolLayout>
</template>

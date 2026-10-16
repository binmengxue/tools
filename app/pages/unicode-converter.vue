<script setup lang="ts">
// 工具页：Unicode 中文互转（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('unicode-converter')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="unicode-converter">
    <ToolPlaceholder />
  </ToolLayout>
</template>

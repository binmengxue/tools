<script setup lang="ts">
// 工具页：时间戳转换（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('timestamp')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="timestamp">
    <ToolPlaceholder />
  </ToolLayout>
</template>

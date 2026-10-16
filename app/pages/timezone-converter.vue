<script setup lang="ts">
// 工具页：时区转换（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('timezone-converter')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="timezone-converter">
    <ToolPlaceholder />
  </ToolLayout>
</template>

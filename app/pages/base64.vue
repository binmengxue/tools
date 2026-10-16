<script setup lang="ts">
// 工具页：Base64 编解码（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('base64')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="base64">
    <ToolPlaceholder />
  </ToolLayout>
</template>

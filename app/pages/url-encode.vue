<script setup lang="ts">
// 工具页：URL 编解码（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('url-encode')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="url-encode">
    <ToolPlaceholder />
  </ToolLayout>
</template>

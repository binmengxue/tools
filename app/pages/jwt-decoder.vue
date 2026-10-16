<script setup lang="ts">
// 工具页：JWT 解析（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('jwt-decoder')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="jwt-decoder">
    <ToolPlaceholder />
  </ToolLayout>
</template>

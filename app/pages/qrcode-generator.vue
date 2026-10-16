<script setup lang="ts">
// 工具页：二维码生成（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('qrcode-generator')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="qrcode-generator">
    <ToolPlaceholder />
  </ToolLayout>
</template>

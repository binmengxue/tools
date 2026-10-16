<script setup lang="ts">
// 工具页：正则测试（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('regex-tester')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="regex-tester">
    <ToolPlaceholder />
  </ToolLayout>
</template>

<script setup lang="ts">
// 工具页：日期计算器（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('date-calculator')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="date-calculator">
    <ToolPlaceholder />
  </ToolLayout>
</template>

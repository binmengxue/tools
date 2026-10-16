<script setup lang="ts">
// 工具页：MD5 / SHA / AES（开发中）
import { getTool } from '~/config/tools'

const tool = getTool('hash-crypto')!

useSeoMeta(toolSeo(tool))
</script>

<template>
  <ToolLayout tool-id="hash-crypto">
    <ToolPlaceholder />
  </ToolLayout>
</template>

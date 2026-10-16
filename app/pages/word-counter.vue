<script setup lang="ts">
// 工具页：字数统计与文本清洗
import { getTool } from '~/config/tools'
import { CLEAN_ORDER, cleanText, countText, SAMPLE_TEXT } from '~/utils/tools/text'
import type { CleanOperation, TextStats } from '~/utils/tools/text'

const tool = getTool('word-counter')!

useSeoMeta(toolSeo(tool))

const { show } = useToast()

const text = ref('')

// 统计防抖：超长文本延迟计算
const source = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch(text, (value) => {
  clearTimeout(timer)
  if (value.length > 100_000) timer = setTimeout(() => (source.value = value), 200)
  else source.value = value
})
onBeforeUnmount(() => clearTimeout(timer))

const stats = computed(() => countText(source.value))

const statItems: { key: keyof TextStats, label: string, hint?: string }[] = [
  { key: 'words', label: '字数', hint: '中文字 + 英文单词 + 数字' },
  { key: 'characters', label: '字符数' },
  { key: 'charactersNoSpaces', label: '字符数（不含空白）' },
  { key: 'chinese', label: '中文字符' },
  { key: 'englishWords', label: '英文单词' },
  { key: 'numbers', label: '数字' },
  { key: 'punctuation', label: '标点符号' },
  { key: 'paragraphs', label: '段落', hint: '非空行的数量' },
  { key: 'lines', label: '行数' },
  { key: 'bytes', label: '字节（UTF-8）' },
]

const operations: { value: CleanOperation, label: string, icon: string }[] = [
  { value: 'removeEmptyLines', label: '去除空行', icon: 'lucide:list-x' },
  { value: 'trimLines', label: '去除首尾空格', icon: 'lucide:text-cursor-input' },
  { value: 'collapseSpaces', label: '合并重复空格', icon: 'lucide:space' },
  { value: 'toHalfWidth', label: '全角转半角', icon: 'lucide:case-sensitive' },
]

// 清洗前的内容，用于撤销（只保留最近一步）；cleaned 是清洗后的内容
const previous = ref<string | null>(null)
let cleaned: string | null = null

function clean(ops: CleanOperation[], label: string) {
  const result = cleanText(text.value, ops)
  if (result === text.value) {
    show(`没有需要${label}的内容`, 'info')
    return
  }
  previous.value = text.value
  cleaned = result
  text.value = result
  show(`已${label}`)
}

function undo() {
  if (previous.value === null) return
  text.value = previous.value
  previous.value = null
  show('已撤销')
}

// 清洗后又手动编辑过，就不再允许撤销，避免覆盖新的输入
watch(text, (value) => {
  if (previous.value !== null && value !== cleaned) previous.value = null
})

function loadSample() {
  text.value = SAMPLE_TEXT
  previous.value = null
}

function clearText() {
  text.value = ''
  previous.value = null
}

const tips = [
  '「字数」按中文字符、英文单词和数字分别计数后相加，与 Word 等软件的统计口径接近；标点不计入字数。',
  '「字符数」按看到的字符计算，一个 emoji 或带声调的字母都只算 1 个。',
  '清洗按钮会直接修改文本框里的内容，点错了可以「撤销」；「全部清洗」依次执行全角转半角、合并空格、去除首尾空格和去除空行。',
  '所有统计都在浏览器本地完成，内容不会上传到服务器。',
]
</script>

<template>
  <ToolLayout tool-id="word-counter">
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
      <!-- 文本 -->
      <EditorPane
        v-model="text"
        label="文本"
        placeholder="在这里粘贴或输入文本，统计结果实时更新"
        height="h-72 lg:h-[28rem]"
        wrap
      >
        <template #actions>
          <PaneButton
            icon="lucide:file-text"
            label="示例"
            @click="loadSample"
          />
          <CopyButton
            :text="text"
            variant="pane"
            :disabled="!text"
          />
          <PaneButton
            icon="lucide:trash-2"
            label="清空"
            :disabled="!text"
            @click="clearText"
          />
        </template>
      </EditorPane>

      <!-- 统计结果 -->
      <div class="grid grid-cols-2 content-start gap-3">
        <div
          v-for="item in statItems"
          :key="item.key"
          class="rounded-xl border border-line bg-surface p-3"
          :class="{ 'col-span-2': item.key === 'words' }"
          :title="item.hint"
        >
          <p class="text-xs text-muted">
            {{ item.label }}
          </p>
          <p
            class="mt-1 font-semibold tabular-nums"
            :class="item.key === 'words' ? 'text-3xl text-primary' : 'text-xl'"
          >
            {{ stats[item.key].toLocaleString() }}
          </p>
          <p
            v-if="item.key === 'words' && item.hint"
            class="mt-1 text-xs text-muted"
          >
            {{ item.hint }}
          </p>
        </div>
      </div>
    </div>

    <!-- 文本清洗 -->
    <section class="mt-6 rounded-xl border border-line bg-surface p-4">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="mr-2 text-sm font-medium">
          文本清洗
        </h2>
        <button
          v-for="op in operations"
          :key="op.value"
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          :disabled="!text"
          @click="clean([op.value], op.label)"
        >
          <Icon
            :name="op.icon"
            class="size-4"
          />
          {{ op.label }}
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm text-primary-fg transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          :disabled="!text"
          @click="clean(CLEAN_ORDER, '全部清洗')"
        >
          <Icon
            name="lucide:sparkles"
            class="size-4"
          />
          全部清洗
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted transition hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
          :disabled="previous === null"
          @click="undo"
        >
          <Icon
            name="lucide:undo-2"
            class="size-4"
          />
          撤销
        </button>
      </div>
    </section>

    <!-- 使用说明 -->
    <section class="mt-8 rounded-xl border border-line bg-surface p-5">
      <h2 class="font-semibold">
        使用说明
      </h2>
      <ul class="mt-3 list-inside list-disc space-y-1.5 text-sm text-muted">
        <li
          v-for="tip in tips"
          :key="tip"
        >
          {{ tip }}
        </li>
      </ul>
    </section>
  </ToolLayout>
</template>

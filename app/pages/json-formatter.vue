<script setup lang="ts">
// 工具页：JSON 格式化与校验
import { getTool } from '~/config/tools'
import {
  escapeJson,
  formatJson,
  getErrorContext,
  minifyJson,
  SAMPLE_JSON,
  unescapeJson,
} from '~/utils/tools/json'
import type { FormatOptions, JsonResult } from '~/utils/tools/json'

const tool = getTool('json-formatter')!

useSeoMeta(toolSeo(tool))

type Mode = 'format' | 'minify' | 'escape' | 'unescape'
type Indent = '2' | '4' | 'tab'

const modes: { value: Mode, label: string }[] = [
  { value: 'format', label: '格式化' },
  { value: 'minify', label: '压缩' },
  { value: 'escape', label: '压缩转义' },
  { value: 'unescape', label: '去除转义' },
]
const indents: { value: Indent, label: string }[] = [
  { value: '2', label: '2 空格' },
  { value: '4', label: '4 空格' },
  { value: 'tab', label: 'Tab' },
]

const input = ref('')
const mode = ref<Mode>('format')
const indent = ref<Indent>('2')
const sortKeys = ref(false)

// 输入防抖：大文本延迟处理，避免每次按键都重新解析
const source = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch(input, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => (source.value = value), value.length > 50_000 ? 300 : 60)
})
onBeforeUnmount(() => clearTimeout(timer))

const showIndent = computed(() => mode.value === 'format' || mode.value === 'unescape')
const inputPlaceholder = computed(() =>
  mode.value === 'unescape' ? '粘贴转义后的 JSON 字符串，如 {\\"a\\":1}' : '在这里粘贴或输入 JSON',
)

const result = computed<JsonResult | null>(() => {
  const text = source.value
  if (!text.trim()) return null
  const options: FormatOptions = {
    indent: indent.value === 'tab' ? 'tab' : Number(indent.value),
    sortKeys: sortKeys.value,
  }
  switch (mode.value) {
    case 'minify':
      return minifyJson(text, options)
    case 'escape':
      return escapeJson(text, options)
    case 'unescape':
      return unescapeJson(text, options)
    default:
      return formatJson(text, options)
  }
})

const output = computed(() => (result.value?.ok ? result.value.output : ''))
const error = computed(() => (result.value && !result.value.ok ? result.value.error : null))
const errorContext = computed(() => (error.value ? getErrorContext(source.value, error.value) : null))

/** 出错行前面的行号前缀，例如「12 | 」 */
const linePrefix = computed(() => (error.value?.line ? `${error.value.line} | ` : ''))

function loadSample() {
  input.value = SAMPLE_JSON
}

function clearInput() {
  input.value = ''
}

function download() {
  const isJson = mode.value === 'format' || mode.value === 'minify' || mode.value === 'unescape'
  downloadText(output.value, isJson ? 'formatted.json' : 'escaped.txt', isJson ? 'application/json' : 'text/plain')
}

const tips = [
  '粘贴或输入 JSON 后自动处理，不需要点按钮；语法有误时会标出出错的行和列。',
  '「压缩转义」把 JSON 压成一行并转义成字符串，适合放进代码或另一个 JSON 字段；「去除转义」反过来还原。',
  '数字按原样保留，超长的整数 ID（如 12345678901234567890）不会丢失精度。',
  '所有处理都在浏览器本地完成，内容不会上传到服务器。',
]
</script>

<template>
  <ToolLayout tool-id="json-formatter">
    <!-- 选项 -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <SegmentedControl
        v-model="mode"
        :options="modes"
        group-label="处理模式"
      />
      <SegmentedControl
        v-if="showIndent"
        v-model="indent"
        :options="indents"
        group-label="缩进"
      />
      <label class="flex cursor-pointer items-center gap-2 text-sm text-muted select-none">
        <input
          v-model="sortKeys"
          type="checkbox"
          class="size-4 accent-primary"
        >
        按键名排序
      </label>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- 输入 -->
      <EditorPane
        v-model="input"
        label="输入"
        :placeholder="inputPlaceholder"
        :invalid="!!error"
      >
        <template #actions>
          <PaneButton
            icon="lucide:file-text"
            label="示例"
            @click="loadSample"
          />
          <PaneButton
            icon="lucide:trash-2"
            label="清空"
            :disabled="!input"
            @click="clearInput"
          />
        </template>
        <template #footer>
          <!-- 校验状态 -->
          <div
            v-if="error"
            class="border-t border-red-500/30 bg-red-500/5 px-3 py-2.5 text-sm"
            role="alert"
          >
            <p class="flex items-start gap-1.5 text-red-600 dark:text-red-400">
              <Icon
                name="lucide:circle-x"
                class="mt-0.5 size-4 shrink-0"
              />
              <span>
                <template v-if="error.line">第 {{ error.line }} 行第 {{ error.column }} 列：</template>{{ error.message }}
              </span>
            </p>
            <pre
              v-if="errorContext"
              class="mt-2 overflow-x-auto font-mono text-xs leading-5 text-fg"
            ><span class="text-muted">{{ linePrefix }}</span>{{ errorContext.lineText }}
<span class="text-red-600 dark:text-red-400">{{ ' '.repeat(linePrefix.length + errorContext.caret) }}^</span></pre>
          </div>
          <p
            v-else-if="output"
            class="flex items-center gap-1.5 border-t border-line px-3 py-2.5 text-sm text-emerald-600 dark:text-emerald-400"
          >
            <Icon
              name="lucide:circle-check"
              class="size-4"
            />
            JSON 格式正确
          </p>
        </template>
      </EditorPane>

      <!-- 输出 -->
      <EditorPane
        :model-value="output"
        label="结果"
        placeholder="处理结果会显示在这里"
        readonly
      >
        <template #actions>
          <CopyButton
            :text="output"
            variant="pane"
            :disabled="!output"
          />
          <PaneButton
            icon="lucide:download"
            label="下载"
            :disabled="!output"
            @click="download"
          />
        </template>
        <template
          v-if="output"
          #footer
        >
          <p class="border-t border-line px-3 py-2.5 text-sm text-muted">
            {{ output.length.toLocaleString() }} 个字符 · {{ output.split('\n').length.toLocaleString() }} 行
          </p>
        </template>
      </EditorPane>
    </div>

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

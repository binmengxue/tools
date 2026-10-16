<script setup lang="ts">
// 工具页：文本差异对比
import { getTool } from '~/config/tools'
import { diffTexts, SAMPLE_NEW, SAMPLE_OLD, toUnified } from '~/utils/tools/diff'
import type { DiffResult, Segment } from '~/utils/tools/diff'

const tool = getTool('text-diff')!

useSeoMeta(toolSeo(tool))

type View = 'split' | 'unified'

const views: { value: View, label: string }[] = [
  { value: 'split', label: '并排' },
  { value: 'unified', label: '合并' },
]

const left = ref('')
const right = ref('')
const view = ref<View>('split')
const ignoreWhitespace = ref(false)
const ignoreCase = ref(false)
const onlyChanges = ref(false)

// 输入防抖：大文本延迟对比
const sources = ref({ left: '', right: '' })
let timer: ReturnType<typeof setTimeout> | undefined
watch([left, right], ([a, b]) => {
  clearTimeout(timer)
  timer = setTimeout(() => (sources.value = { left: a, right: b }), a.length + b.length > 50_000 ? 300 : 80)
})
onBeforeUnmount(() => clearTimeout(timer))

const hasInput = computed(() => sources.value.left !== '' || sources.value.right !== '')

/** undefined：还没有输入；null：差异过大超时 */
const result = computed<DiffResult | null | undefined>(() => {
  if (!hasInput.value) return undefined
  return diffTexts(sources.value.left, sources.value.right, {
    ignoreWhitespace: ignoreWhitespace.value,
    ignoreCase: ignoreCase.value,
  })
})

const rows = computed(() => {
  const all = result.value?.rows ?? []
  return onlyChanges.value ? all.filter(r => r.type !== 'equal') : all
})
const unifiedLines = computed(() => toUnified(rows.value))

function loadSample() {
  left.value = SAMPLE_OLD
  right.value = SAMPLE_NEW
}

function swap() {
  [left.value, right.value] = [right.value, left.value]
}

function clearAll() {
  left.value = ''
  right.value = ''
}

/** 行内差异片段的高亮样式 */
function segmentClass(segment: Segment, side: 'left' | 'right') {
  if (!segment.changed) return ''
  return side === 'left'
    ? 'rounded-sm bg-red-500/25 text-red-800 dark:text-red-200'
    : 'rounded-sm bg-emerald-500/30 text-emerald-800 dark:text-emerald-200'
}

const tips = [
  '左边粘贴原文，右边粘贴修改后的文本，结果会实时显示在下方。',
  '红色表示删除，绿色表示新增；同一行被修改时，会进一步标出改动的字符。',
  '「并排」适合逐行核对，「合并」适合在窄屏上查看；勾选「只看差异」可以隐藏相同的行。',
  '所有对比都在浏览器本地完成，内容不会上传到服务器。',
]
</script>

<template>
  <ToolLayout tool-id="text-diff">
    <!-- 操作与选项 -->
    <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary hover:text-primary"
          @click="swap"
        >
          <Icon
            name="lucide:arrow-left-right"
            class="size-4"
          />
          交换左右
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm transition hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-40"
          :disabled="!left && !right"
          @click="clearAll"
        >
          <Icon
            name="lucide:trash-2"
            class="size-4"
          />
          全部清空
        </button>
      </div>
      <label class="flex cursor-pointer items-center gap-2 text-sm text-muted select-none">
        <input
          v-model="ignoreWhitespace"
          type="checkbox"
          class="size-4 accent-primary"
        >
        忽略首尾空白
      </label>
      <label class="flex cursor-pointer items-center gap-2 text-sm text-muted select-none">
        <input
          v-model="ignoreCase"
          type="checkbox"
          class="size-4 accent-primary"
        >
        忽略大小写
      </label>
    </div>

    <!-- 输入 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <EditorPane
        v-model="left"
        label="原文"
        placeholder="粘贴原始文本"
        height="h-56 lg:h-72"
        wrap
      >
        <template #actions>
          <PaneButton
            icon="lucide:file-text"
            label="示例"
            @click="loadSample"
          />
          <PaneButton
            icon="lucide:x"
            label="清空"
            :disabled="!left"
            @click="left = ''"
          />
        </template>
      </EditorPane>
      <EditorPane
        v-model="right"
        label="新文本"
        placeholder="粘贴修改后的文本"
        height="h-56 lg:h-72"
        wrap
      >
        <template #actions>
          <PaneButton
            icon="lucide:x"
            label="清空"
            :disabled="!right"
            @click="right = ''"
          />
        </template>
      </EditorPane>
    </div>

    <!-- 对比结果 -->
    <section class="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
      <div class="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
        <h2 class="text-sm font-medium">
          对比结果
        </h2>
        <div
          v-if="result"
          class="flex flex-wrap gap-2 text-xs"
        >
          <span class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">新增 {{ result.stats.added }} 行</span>
          <span class="rounded-full bg-red-500/10 px-2 py-0.5 text-red-700 dark:text-red-300">删除 {{ result.stats.removed }} 行</span>
          <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">修改 {{ result.stats.modified }} 行</span>
        </div>
        <div class="ml-auto flex items-center gap-3">
          <label class="flex cursor-pointer items-center gap-2 text-sm text-muted select-none">
            <input
              v-model="onlyChanges"
              type="checkbox"
              class="size-4 accent-primary"
            >
            只看差异
          </label>
          <SegmentedControl
            v-model="view"
            :options="views"
            group-label="显示方式"
          />
        </div>
      </div>

      <!-- 空状态 / 相同 / 超时 -->
      <p
        v-if="result === undefined"
        class="px-4 py-12 text-center text-sm text-muted"
      >
        在上方输入两段文本，或点「示例」看看效果
      </p>
      <p
        v-else-if="result === null"
        class="px-4 py-12 text-center text-sm text-red-600 dark:text-red-400"
      >
        两段文本差异太大，无法在合理时间内完成对比，请缩小范围后再试
      </p>
      <p
        v-else-if="result.identical && onlyChanges"
        class="flex items-center justify-center gap-1.5 px-4 py-12 text-sm text-emerald-600 dark:text-emerald-400"
      >
        <Icon
          name="lucide:circle-check"
          class="size-4"
        />
        两段文本完全相同
      </p>

      <template v-else>
        <p
          v-if="result.identical"
          class="flex items-center gap-1.5 border-b border-line px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400"
        >
          <Icon
            name="lucide:circle-check"
            class="size-4"
          />
          两段文本完全相同
        </p>

        <!-- 并排视图 -->
        <div
          v-if="view === 'split'"
          class="max-h-[40rem] overflow-auto"
        >
          <table class="w-full table-fixed border-collapse font-mono text-sm leading-6">
            <colgroup>
              <col class="w-10 sm:w-12">
              <col>
              <col class="w-10 sm:w-12">
              <col>
            </colgroup>
            <tbody>
              <tr
                v-for="(row, index) in rows"
                :key="index"
                class="align-top"
              >
                <!-- 左侧：原文 -->
                <td class="border-r border-line px-2 text-right text-xs leading-6 text-muted select-none">
                  {{ row.left?.lineNo ?? '' }}
                </td>
                <td
                  class="border-r border-line px-2 break-all whitespace-pre-wrap"
                  :class="{
                    'bg-red-500/10': row.type === 'removed',
                    'bg-red-500/5': row.type === 'modified',
                    'bg-surface-2': row.type === 'added',
                  }"
                >
                  <template v-if="row.left?.segments.length">
                    <span
                      v-for="(seg, i) in row.left.segments"
                      :key="i"
                      :class="segmentClass(seg, 'left')"
                    >{{ seg.text }}</span>
                  </template>
                  <template v-else>
                    &nbsp;
                  </template>
                </td>
                <!-- 右侧：新文本 -->
                <td class="border-r border-line px-2 text-right text-xs leading-6 text-muted select-none">
                  {{ row.right?.lineNo ?? '' }}
                </td>
                <td
                  class="px-2 break-all whitespace-pre-wrap"
                  :class="{
                    'bg-emerald-500/10': row.type === 'added',
                    'bg-emerald-500/5': row.type === 'modified',
                    'bg-surface-2': row.type === 'removed',
                  }"
                >
                  <template v-if="row.right?.segments.length">
                    <span
                      v-for="(seg, i) in row.right.segments"
                      :key="i"
                      :class="segmentClass(seg, 'right')"
                    >{{ seg.text }}</span>
                  </template>
                  <template v-else>
                    &nbsp;
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 合并视图 -->
        <div
          v-else
          class="max-h-[40rem] overflow-auto"
        >
          <table class="w-full table-fixed border-collapse font-mono text-sm leading-6">
            <colgroup>
              <col class="w-10 sm:w-12">
              <col class="w-10 sm:w-12">
              <col class="w-6">
              <col>
            </colgroup>
            <tbody>
              <tr
                v-for="(line, index) in unifiedLines"
                :key="index"
                class="align-top"
                :class="{
                  'bg-red-500/10': line.type === 'removed',
                  'bg-emerald-500/10': line.type === 'added',
                }"
              >
                <td class="px-2 text-right text-xs leading-6 text-muted select-none">
                  {{ line.oldNo ?? '' }}
                </td>
                <td class="border-r border-line px-2 text-right text-xs leading-6 text-muted select-none">
                  {{ line.newNo ?? '' }}
                </td>
                <td
                  class="text-center select-none"
                  :class="{
                    'text-red-600 dark:text-red-400': line.type === 'removed',
                    'text-emerald-600 dark:text-emerald-400': line.type === 'added',
                  }"
                >
                  {{ line.type === 'removed' ? '-' : line.type === 'added' ? '+' : '' }}
                </td>
                <td class="pr-2 break-all whitespace-pre-wrap">
                  <template v-if="line.segments.length">
                    <span
                      v-for="(seg, i) in line.segments"
                      :key="i"
                      :class="segmentClass(seg, line.type === 'removed' ? 'left' : 'right')"
                    >{{ seg.text }}</span>
                  </template>
                  <template v-else>
                    &nbsp;
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
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

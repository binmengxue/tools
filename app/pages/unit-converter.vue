<script setup lang="ts">
// 工具页：单位换算
import { getTool } from '~/config/tools'
import {
  checkValue,
  convertAll,
  formatNumber,
  getUnitCategory,
  parseNumber,
  UNIT_CATEGORIES,
} from '~/utils/tools/units'
import type { UnitCategoryId, UnitDef } from '~/utils/tools/units'

const tool = getTool('unit-converter')!

useSeoMeta(toolSeo(tool))

const categoryId = ref<UnitCategoryId>('length')
const category = computed(() => getUnitCategory(categoryId.value))
const fromUnit = ref(category.value.defaultUnit)
const input = ref('1')

/** 切换类别时选中该类别的默认单位，数值保留 */
function selectCategory(id: UnitCategoryId) {
  if (id === categoryId.value) return
  categoryId.value = id
  fromUnit.value = getUnitCategory(id).defaultUnit
}

/** 当前单位不属于当前类别时（如下拉框尚未刷新）退回默认单位，避免换算出错 */
const activeUnit = computed(() =>
  category.value.units.some(u => u.id === fromUnit.value) ? fromUnit.value : category.value.defaultUnit,
)

const parsed = computed(() => parseNumber(input.value))
const valueError = computed(() => (parsed.value.ok ? checkValue(parsed.value.value, activeUnit.value, categoryId.value) : null))
const results = computed(() => {
  if (!parsed.value.ok || valueError.value) return []
  return convertAll(parsed.value.value, activeUnit.value, categoryId.value)
})
const errorText = computed(() => (parsed.value.ok ? valueError.value : parsed.value.error))

/** 点击某个结果：把它设为新的输入 */
function pick(row: { unit: UnitDef, value: number }) {
  input.value = formatNumber(row.value, false)
  fromUnit.value = row.unit.id
}

const tips = [
  '选择类别和单位，输入数值后，下方会同时列出换算成该类别所有单位的结果；点击某一行可以把它设为新的输入。',
  '市制单位：1 里 = 500 米，1 丈 = 10 尺，1 尺 = 1/3 米，1 斤 = 500 克，1 两 = 50 克，1 亩 ≈ 666.67 平方米。',
  '宽带的「100 兆」指 100 Mbps（比特），下载软件里显示的是 MB/s（字节），100 Mbps 约等于 11.92 MB/s。',
  '数据大小按 1024 进制（1 GB = 1024 MB），与 Windows 等系统的显示一致；结果保留 12 位有效数字。',
]
</script>

<template>
  <ToolLayout tool-id="unit-converter">
    <!-- 类别 -->
    <div
      class="mb-4 flex flex-wrap gap-2"
      role="tablist"
      aria-label="单位类别"
    >
      <button
        v-for="item in UNIT_CATEGORIES"
        :key="item.id"
        type="button"
        role="tab"
        :aria-selected="categoryId === item.id"
        class="flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition"
        :class="categoryId === item.id
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-line bg-surface text-muted hover:border-primary/60 hover:text-fg'"
        @click="selectCategory(item.id)"
      >
        <Icon
          :name="item.icon"
          class="size-4"
        />
        {{ item.name }}
      </button>
    </div>

    <!-- 输入 -->
    <section class="rounded-xl border border-line bg-surface p-5">
      <div class="flex flex-wrap gap-3">
        <input
          v-model="input"
          type="text"
          inputmode="decimal"
          aria-label="数值"
          placeholder="输入数值"
          class="h-11 min-w-0 flex-1 rounded-lg border bg-surface px-3 font-mono text-lg outline-none focus:border-primary sm:max-w-xs"
          :class="errorText ? 'border-red-500/60' : 'border-line'"
        >
        <select
          v-model="fromUnit"
          aria-label="单位"
          class="h-11 rounded-lg border border-line bg-surface px-3 text-fg outline-none focus:border-primary"
        >
          <option
            v-for="unit in category.units"
            :key="unit.id"
            :value="unit.id"
          >
            {{ unit.name }}（{{ unit.symbol }}）
          </option>
        </select>
      </div>
      <p
        v-if="errorText"
        class="mt-3 flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400"
        role="alert"
      >
        <Icon
          name="lucide:circle-x"
          class="mt-0.5 size-4 shrink-0"
        />
        {{ errorText }}
      </p>
    </section>

    <!-- 结果 -->
    <ul
      v-if="results.length"
      class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <li
        v-for="row in results"
        :key="row.unit.id"
        class="flex items-center gap-2 rounded-xl border bg-surface p-3 transition"
        :class="row.unit.id === activeUnit ? 'border-primary/60 bg-primary/5' : 'border-line hover:border-primary/40'"
      >
        <button
          type="button"
          class="min-w-0 flex-1 text-left"
          :title="`设为输入：${row.unit.name}`"
          @click="pick(row)"
        >
          <p class="text-xs text-muted">
            {{ row.unit.name }} <span class="ml-1">{{ row.unit.symbol }}</span>
          </p>
          <p class="mt-0.5 truncate font-mono text-lg font-semibold tabular-nums">
            {{ formatNumber(row.value) }}
          </p>
        </button>
        <CopyButton
          :text="formatNumber(row.value, false)"
          label=""
          variant="pane"
        />
      </li>
    </ul>

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

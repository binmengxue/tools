<script setup lang="ts">
// 工具页：时间戳转换
import { getTool } from '~/config/tools'
import { COMMON_TIME_ZONES } from '~/utils/tools/timezone'
import {
  formatInZone,
  formatOffset,
  formatRelative,
  getLocalTimeZone,
  parseDateTime,
  parseTimestamp,
  timeZoneOffset,
} from '~/utils/tools/timestamp'
import type { TimestampUnit } from '~/utils/tools/timestamp'

const tool = getTool('timestamp')!

useSeoMeta(toolSeo(tool))

type UnitOption = TimestampUnit | 'auto'

const unitOptions: { value: UnitOption, label: string }[] = [
  { value: 'auto', label: '自动识别' },
  { value: 's', label: '秒' },
  { value: 'ms', label: '毫秒' },
]

// 当前时间与本地时区只在客户端挂载后读取，保证预渲染 HTML 与首次渲染一致
const now = ref<number | null>(null)
const paused = ref(false)
const localZone = ref('')
const timeZone = ref('Asia/Shanghai')

const timestampInput = ref('')
const unit = ref<UnitOption>('auto')
const dateInput = ref('')

let interval: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  now.value = Date.now()
  localZone.value = getLocalTimeZone()
  timeZone.value = localZone.value
  timestampInput.value = String(Math.floor(now.value / 1000))
  dateInput.value = formatInZone(now.value, timeZone.value).dateTime.slice(0, 19)
  interval = setInterval(() => {
    if (!paused.value) now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => clearInterval(interval))

/** 时区下拉选项：本地时区不在常用列表里时单独加一项 */
const zoneOptions = computed(() => {
  const options = COMMON_TIME_ZONES.map(z => ({ value: z.value, label: `${z.label}（${z.value}）` }))
  if (localZone.value && !COMMON_TIME_ZONES.some(z => z.value === localZone.value)) {
    options.unshift({ value: localZone.value, label: `本地（${localZone.value}）` })
  }
  return options.map(o => (o.value === localZone.value ? { ...o, label: `${o.label} · 本地` } : o))
})

const zoneOffset = computed(() => formatOffset(timeZoneOffset(now.value ?? Date.now(), timeZone.value)))

const current = computed(() => {
  if (now.value === null) return null
  return {
    seconds: String(Math.floor(now.value / 1000)),
    millis: String(now.value),
    dateTime: formatInZone(now.value, timeZone.value).dateTime.slice(0, 19),
  }
})

/** 时间戳 → 日期 */
const toDate = computed(() => {
  if (!timestampInput.value.trim()) return null
  const parsed = parseTimestamp(timestampInput.value, unit.value)
  if (!parsed.ok) return { error: parsed.error, rows: [] }
  const { ms, unit: actual } = parsed.value
  const zoned = formatInZone(ms, timeZone.value)
  const utc = formatInZone(ms, 'UTC')
  return {
    error: null,
    unitLabel: actual === 's' ? '秒（10 位）' : '毫秒（13 位）',
    rows: [
      { label: `${timeZone.value}`, value: zoned.dateTime, extra: `${zoned.weekday} · ${zoned.offset}` },
      { label: 'UTC 时间', value: utc.dateTime, extra: utc.weekday },
      { label: 'ISO 8601', value: zoned.iso, extra: '' },
      { label: '相对现在', value: now.value === null ? '—' : formatRelative(ms, now.value), extra: '' },
    ],
  }
})

/** 日期 → 时间戳 */
const toTimestamp = computed(() => {
  if (!dateInput.value.trim()) return null
  const parsed = parseDateTime(dateInput.value, timeZone.value)
  if (!parsed.ok) return { error: parsed.error, rows: [] }
  const ms = parsed.value
  return {
    error: null,
    rows: [
      { label: '秒（10 位）', value: String(Math.floor(ms / 1000)), extra: '' },
      { label: '毫秒（13 位）', value: String(ms), extra: '' },
      { label: 'UTC 时间', value: formatInZone(ms, 'UTC').dateTime, extra: '' },
    ],
  }
})

function fillNowTimestamp() {
  const ms = Date.now()
  timestampInput.value = unit.value === 'ms' ? String(ms) : String(Math.floor(ms / 1000))
}

function fillNowDate() {
  dateInput.value = formatInZone(Date.now(), timeZone.value).dateTime.slice(0, 19)
}

const tips = [
  '10 位时间戳单位是秒，13 位是毫秒；「自动识别」按数值大小判断，也可以手动指定单位。',
  '同一个时间戳在不同时区显示的日期时间不同，请先确认上方选择的时区；默认使用你电脑或手机的本地时区。',
  '日期转时间戳时，输入的日期按所选时区的当地时间理解；输入带 Z 或 +08:00 的 ISO 8601 格式时，以其自带的时区为准。',
  '所有换算都在浏览器本地完成，不依赖网络。',
]
</script>

<template>
  <ToolLayout tool-id="timestamp">
    <!-- 时区 -->
    <div class="mb-4 flex flex-wrap items-center gap-3 text-sm">
      <label
        for="tz"
        class="text-muted"
      >时区</label>
      <select
        id="tz"
        v-model="timeZone"
        class="h-9 rounded-lg border border-line bg-surface px-3 text-fg outline-none focus:border-primary"
      >
        <option
          v-for="zone in zoneOptions"
          :key="zone.value"
          :value="zone.value"
        >
          {{ zone.label }}
        </option>
      </select>
      <span class="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">{{ zoneOffset }}</span>
    </div>

    <!-- 当前时间 -->
    <section class="rounded-xl border border-line bg-surface p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-medium text-muted">
          当前时间戳
        </h2>
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted transition hover:bg-surface-2 hover:text-fg"
          @click="paused = !paused"
        >
          <Icon
            :name="paused ? 'lucide:play' : 'lucide:pause'"
            class="size-4"
          />
          {{ paused ? '继续' : '暂停' }}
        </button>
      </div>
      <div class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p class="text-xs text-muted">
            秒
          </p>
          <div class="mt-1 flex items-center gap-1">
            <span class="font-mono text-2xl font-semibold tabular-nums">{{ current?.seconds ?? '—' }}</span>
            <CopyButton
              :text="current?.seconds ?? ''"
              label=""
              variant="pane"
              :disabled="!current"
            />
          </div>
        </div>
        <div>
          <p class="text-xs text-muted">
            毫秒
          </p>
          <div class="mt-1 flex items-center gap-1">
            <span class="font-mono text-2xl font-semibold tabular-nums">{{ current?.millis ?? '—' }}</span>
            <CopyButton
              :text="current?.millis ?? ''"
              label=""
              variant="pane"
              :disabled="!current"
            />
          </div>
        </div>
        <div>
          <p class="text-xs text-muted">
            当前时间（{{ zoneOffset }}）
          </p>
          <p class="mt-1 font-mono text-lg tabular-nums">
            {{ current?.dateTime ?? '—' }}
          </p>
        </div>
      </div>
    </section>

    <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- 时间戳 → 日期 -->
      <section class="rounded-xl border border-line bg-surface p-5">
        <h2 class="font-semibold">
          时间戳 → 日期
        </h2>
        <div class="mt-4 flex flex-wrap gap-2">
          <input
            v-model="timestampInput"
            type="text"
            inputmode="numeric"
            placeholder="如 1700000000 或 1700000000000"
            aria-label="时间戳"
            class="h-10 min-w-0 flex-1 rounded-lg border bg-surface px-3 font-mono text-sm outline-none focus:border-primary"
            :class="toDate?.error ? 'border-red-500/60' : 'border-line'"
          >
          <button
            type="button"
            class="h-10 rounded-lg border border-line px-3 text-sm transition hover:border-primary hover:text-primary"
            @click="fillNowTimestamp"
          >
            现在
          </button>
        </div>
        <div class="mt-3">
          <SegmentedControl
            v-model="unit"
            :options="unitOptions"
            group-label="时间戳单位"
          />
        </div>

        <p
          v-if="toDate?.error"
          class="mt-4 flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          <Icon
            name="lucide:circle-x"
            class="mt-0.5 size-4 shrink-0"
          />
          {{ toDate.error }}
        </p>
        <dl
          v-else-if="toDate"
          class="mt-4 divide-y divide-line text-sm"
        >
          <div class="flex items-center justify-between gap-3 py-2">
            <dt class="text-muted">
              识别为
            </dt>
            <dd>{{ toDate.unitLabel }}</dd>
          </div>
          <div
            v-for="row in toDate.rows"
            :key="row.label"
            class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
          >
            <dt class="text-muted">
              {{ row.label }}
            </dt>
            <dd class="flex min-w-0 flex-wrap items-center justify-end gap-x-1">
              <span class="font-mono break-all">{{ row.value }}</span>
              <span
                v-if="row.extra"
                class="text-xs whitespace-nowrap text-muted"
              >{{ row.extra }}</span>
              <CopyButton
                :text="row.value"
                label=""
                variant="pane"
              />
            </dd>
          </div>
        </dl>
      </section>

      <!-- 日期 → 时间戳 -->
      <section class="rounded-xl border border-line bg-surface p-5">
        <h2 class="font-semibold">
          日期 → 时间戳
        </h2>
        <div class="mt-4 flex flex-wrap gap-2">
          <input
            v-model="dateInput"
            type="text"
            placeholder="如 2026-10-16 08:30:00"
            aria-label="日期时间"
            class="h-10 min-w-0 flex-1 rounded-lg border bg-surface px-3 font-mono text-sm outline-none focus:border-primary"
            :class="toTimestamp?.error ? 'border-red-500/60' : 'border-line'"
          >
          <button
            type="button"
            class="h-10 rounded-lg border border-line px-3 text-sm transition hover:border-primary hover:text-primary"
            @click="fillNowDate"
          >
            现在
          </button>
        </div>
        <p class="mt-3 text-xs text-muted">
          支持 2026-10-16 08:30:00、2026/10/16 08:30、2026-10-16，按所选时区（{{ zoneOffset }}）理解
        </p>

        <p
          v-if="toTimestamp?.error"
          class="mt-4 flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          <Icon
            name="lucide:circle-x"
            class="mt-0.5 size-4 shrink-0"
          />
          {{ toTimestamp.error }}
        </p>
        <dl
          v-else-if="toTimestamp"
          class="mt-4 divide-y divide-line text-sm"
        >
          <div
            v-for="row in toTimestamp.rows"
            :key="row.label"
            class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
          >
            <dt class="text-muted">
              {{ row.label }}
            </dt>
            <dd class="flex min-w-0 items-center gap-1">
              <span class="font-mono break-all">{{ row.value }}</span>
              <CopyButton
                :text="row.value"
                label=""
                variant="pane"
              />
            </dd>
          </div>
        </dl>
      </section>
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

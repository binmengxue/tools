<script setup lang="ts">
// 工具页：时区转换（世界时间对照）
import { getTool } from '~/config/tools'
import { formatInZone, getLocalTimeZone, parseDateTime } from '~/utils/tools/timestamp'
import {
  allTimeZones,
  canonicalZone,
  COMMON_TIME_ZONES,
  DEFAULT_ZONES,
  isValidTimeZone,
  searchZones,
  zoneClock,
  zoneLabel,
} from '~/utils/tools/timezone'

const tool = getTool('timezone-converter')!

useSeoMeta(toolSeo(tool))

type Mode = 'now' | 'custom'

const STORAGE_KEY = 'toolbox:timezones'
const modes: { value: Mode, label: string }[] = [
  { value: 'now', label: '现在' },
  { value: 'custom', label: '指定时间' },
]

// 本地时区、当前时间、保存的城市只在客户端挂载后读取，保证预渲染与首次渲染一致
const localZone = ref('')
const now = ref<number | null>(null)
const zones = ref<string[]>([...DEFAULT_ZONES])
const mode = ref<Mode>('now')
const customInput = ref('')
const customZone = ref('Asia/Shanghai')

/** 去掉无效和重复（新旧写法算同一个）的时区 */
function dedupe(list: string[]): string[] {
  const seen = new Set<string>()
  return list.filter((z) => {
    if (!isValidTimeZone(z)) return false
    const key = canonicalZone(z)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function defaultZones(): string[] {
  return dedupe([localZone.value, ...DEFAULT_ZONES].filter(Boolean))
}

let interval: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  localZone.value = getLocalTimeZone()
  now.value = Date.now()
  customZone.value = localZone.value
  customInput.value = formatInZone(now.value, localZone.value).dateTime.slice(0, 16)
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown
    const list = Array.isArray(saved) ? dedupe(saved.filter((z): z is string => typeof z === 'string')) : []
    zones.value = list.length ? list : defaultZones()
  }
  catch {
    zones.value = defaultZones()
  }
  interval = setInterval(() => (now.value = Date.now()), 1000)
})
onBeforeUnmount(() => clearInterval(interval))

watch(zones, (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  }
  catch {
    // 隐私模式等情况下忽略
  }
}, { deep: true })

/** 基准时刻（毫秒）；指定时间格式错误时为 null */
const custom = computed(() => parseDateTime(customInput.value, customZone.value))
const baseMs = computed<number | null>(() => {
  if (mode.value === 'now') return now.value
  return custom.value.ok ? custom.value.value : null
})

const baseZoneForDiff = computed(() => localZone.value || 'Asia/Shanghai')

const cards = computed(() =>
  zones.value.map((zone) => {
    const clock = baseMs.value === null ? null : zoneClock(baseMs.value, zone, baseZoneForDiff.value)
    const isLocal = !!localZone.value && canonicalZone(zone) === canonicalZone(localZone.value)
    return { zone, label: zoneLabel(zone), clock, isLocal }
  }),
)

// 添加城市
const query = ref('')
const searchFocused = ref(false)
const zoneList = computed(() => allTimeZones())
const results = computed(() => {
  const added = new Set(zones.value.map(canonicalZone))
  return searchZones(query.value, zoneList.value, 40).filter(z => !added.has(canonicalZone(z.value))).slice(0, 12)
})

function addZone(zone: string) {
  zones.value = dedupe([...zones.value, zone])
  query.value = ''
}

function removeZone(zone: string) {
  if (zones.value.length <= 1) return
  zones.value = zones.value.filter(z => z !== zone)
}

function resetZones() {
  zones.value = defaultZones()
}

// 失焦时延迟收起，保证能点到下拉里的选项
let blurTimer: ReturnType<typeof setTimeout> | undefined
function onSearchBlur() {
  blurTimer = setTimeout(() => (searchFocused.value = false), 150)
}
onBeforeUnmount(() => clearTimeout(blurTimer))

/** 指定时间所在时区的选项：常用城市 + 本地 + 已添加的城市 */
const customZoneOptions = computed(() => {
  const list = dedupe([localZone.value, ...COMMON_TIME_ZONES.map(z => z.value), ...zones.value].filter(Boolean))
  return list.map(z => ({ value: z, label: `${zoneLabel(z)}（${z}）` }))
})

function fillNow() {
  customInput.value = formatInZone(Date.now(), customZone.value).dateTime.slice(0, 16)
}

function copyText(card: { label: string, clock: ReturnType<typeof zoneClock> | null }) {
  if (!card.clock) return ''
  return `${card.label} ${card.clock.date} ${card.clock.weekday} ${card.clock.time}（${card.clock.offset}）`
}

const tips = [
  '默认显示「现在」各城市的时间；切换到「指定时间」可以输入某个时间，看看它在其他城市是几点，适合约跨国会议。',
  '时差相对你电脑或手机的本地时区计算，夏令时会自动处理，比如纽约冬天比北京慢 13 小时、夏天慢 12 小时。',
  '可以搜索中文城市名或英文时区名（如 Kathmandu）添加城市，添加的城市会保存在本机浏览器里。',
  '所有计算都在浏览器本地完成，不依赖网络。',
]
</script>

<template>
  <ToolLayout tool-id="timezone-converter">
    <!-- 基准时间 -->
    <section class="rounded-xl border border-line bg-surface p-5">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="font-semibold">
          基准时间
        </h2>
        <SegmentedControl
          v-model="mode"
          :options="modes"
          group-label="基准时间"
        />
      </div>
      <div
        v-if="mode === 'custom'"
        class="mt-4 flex flex-wrap items-center gap-2"
      >
        <input
          v-model="customInput"
          type="text"
          aria-label="指定时间"
          placeholder="如 2026-10-16 20:00"
          class="h-10 w-56 rounded-lg border bg-surface px-3 font-mono text-sm outline-none focus:border-primary"
          :class="custom.ok ? 'border-line' : 'border-red-500/60'"
        >
        <select
          v-model="customZone"
          aria-label="指定时间所在的时区"
          class="h-10 max-w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none focus:border-primary"
        >
          <option
            v-for="option in customZoneOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <button
          type="button"
          class="h-10 rounded-lg border border-line px-3 text-sm transition hover:border-primary hover:text-primary"
          @click="fillNow"
        >
          现在
        </button>
        <p
          v-if="!custom.ok"
          class="flex w-full items-start gap-1.5 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          <Icon
            name="lucide:circle-x"
            class="mt-0.5 size-4 shrink-0"
          />
          {{ custom.error }}
        </p>
      </div>
      <p
        v-else
        class="mt-3 text-sm text-muted"
      >
        显示各城市此刻的时间，每秒更新
      </p>
    </section>

    <!-- 添加城市 -->
    <div class="mt-6 flex flex-wrap items-center gap-3">
      <div class="relative min-w-0 flex-1 sm:max-w-sm">
        <Icon
          name="lucide:search"
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        />
        <input
          v-model="query"
          type="search"
          aria-label="搜索并添加城市"
          placeholder="添加城市，如 悉尼、Dubai"
          class="h-10 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-primary"
          @focus="searchFocused = true"
          @blur="onSearchBlur"
          @keydown.enter.prevent="results[0] && addZone(results[0].value)"
        >
        <ul
          v-if="searchFocused && results.length"
          class="absolute inset-x-0 top-11 z-20 max-h-72 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          <li
            v-for="zone in results"
            :key="zone.value"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2"
              @mousedown.prevent="addZone(zone.value)"
            >
              <span>{{ zone.label }}</span>
              <span class="truncate text-xs text-muted">{{ zone.value }}</span>
            </button>
          </li>
        </ul>
      </div>
      <button
        type="button"
        class="text-sm text-primary hover:underline"
        @click="resetZones"
      >
        恢复默认城市
      </button>
    </div>

    <!-- 城市时间 -->
    <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="card in cards"
        :key="card.zone"
        class="relative rounded-xl border bg-surface p-4"
        :class="card.isLocal ? 'border-primary/50' : 'border-line'"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="flex items-center gap-1.5 font-semibold">
              <span class="truncate">{{ card.label }}</span>
              <span
                v-if="card.isLocal"
                class="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary"
              >本地</span>
            </h3>
            <p class="truncate text-xs text-muted">
              {{ card.zone }}
            </p>
          </div>
          <div class="flex shrink-0 items-center">
            <CopyButton
              :text="() => copyText(card)"
              label=""
              variant="pane"
              :disabled="!card.clock"
            />
            <button
              type="button"
              class="flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-red-500 disabled:pointer-events-none disabled:opacity-30"
              :disabled="zones.length <= 1"
              :aria-label="`移除${card.label}`"
              title="移除"
              @click="removeZone(card.zone)"
            >
              <Icon
                name="lucide:x"
                class="size-4"
              />
            </button>
          </div>
        </div>

        <div class="mt-3 flex items-end gap-2">
          <Icon
            v-if="card.clock"
            :name="card.clock.daytime ? 'lucide:sun' : 'lucide:moon'"
            class="mb-1.5 size-5"
            :class="card.clock.daytime ? 'text-amber-500' : 'text-indigo-400'"
          />
          <span class="font-mono text-3xl font-semibold tabular-nums">{{ card.clock?.time ?? '--:--' }}</span>
          <span
            v-if="card.clock && mode === 'now'"
            class="mb-1 font-mono text-sm text-muted tabular-nums"
          >{{ card.clock.seconds }}</span>
          <span
            v-if="card.clock?.day"
            class="mb-1.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300"
          >{{ card.clock.day }}</span>
        </div>
        <p class="mt-1 text-sm text-muted">
          <template v-if="card.clock">
            {{ card.clock.date }} {{ card.clock.weekday }} · {{ card.clock.offset }}
          </template>
          <template v-else>
            &nbsp;
          </template>
        </p>
        <p
          v-if="card.clock"
          class="mt-1 text-xs"
          :class="card.isLocal ? 'text-primary' : 'text-muted'"
        >
          {{ card.isLocal ? '本地时间' : card.clock.diff }}
        </p>
      </article>
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

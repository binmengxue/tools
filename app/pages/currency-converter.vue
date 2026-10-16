<script setup lang="ts">
// 工具页：货币转换（构建时汇率快照 + 浏览器实时刷新）
import { getTool } from '~/config/tools'
import {
  COMMON_CURRENCIES,
  convert,
  currencyName,
  formatMoney,
  formatRate,
  isValidRates,
  parseAmount,
  parseApiResponse,
  QUICK_AMOUNTS,
  RATES_API,
  RATES_SOURCE,
  rateOf,
  sortCurrencies,
} from '~/utils/tools/currency'
import type { RatesData } from '~/utils/tools/currency'
import { formatInZone } from '~/utils/tools/timestamp'

const tool = getTool('currency-converter')!

useSeoMeta({
  ...toolSeo(tool),
  description: '美元兑人民币、欧元、日元、港币等 160 多种货币汇率在线换算，每日更新，输入金额即刻得到结果，免费无需注册。',
})

// 构建时的汇率快照：预渲染时写进页面载荷，首屏就能显示结果
const { data: snapshot } = await useFetch<RatesData>('/rates.json')

// 货币中文名在预渲染时算好并写进页面载荷：Node 与各浏览器内置的地区数据不完全一致，
// 直接在浏览器里重新计算可能和预渲染的 HTML 对不上（水合不一致）
const { data: names } = await useAsyncData('currency-names', async () =>
  Object.fromEntries(Object.keys(snapshot.value?.rates ?? {}).map(code => [code, currencyName(code)])),
)
/** 货币中文名：优先用载荷里的名称，实时汇率里新出现的币种再现算 */
function nameOf(code: string): string {
  return names.value?.[code] ?? currencyName(code)
}

// 浏览器里再取一次最新汇率，失败时继续用快照
type LiveStatus = 'idle' | 'loading' | 'live' | 'failed'
const live = ref<RatesData | null>(null)
const liveStatus = ref<LiveStatus>('idle')

onMounted(async () => {
  liveStatus.value = 'loading'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(RATES_API, { signal: controller.signal })
    const data = parseApiResponse(await response.json())
    if (!data) throw new Error('汇率数据格式不正确')
    if (!snapshot.value || data.updatedAt >= snapshot.value.updatedAt) live.value = data
    liveStatus.value = 'live'
  }
  catch {
    liveStatus.value = 'failed'
  }
  finally {
    clearTimeout(timer)
  }
})

const rates = computed<RatesData | null>(() => {
  const data = live.value ?? snapshot.value
  return isValidRates(data) ? data : null
})

const amountInput = ref('1')
const from = ref('USD')
const to = ref('CNY')

const amount = computed(() => parseAmount(amountInput.value))
const currencies = computed(() => sortCurrencies(Object.keys(rates.value?.rates ?? {})))
const options = computed(() => currencies.value.map((code) => {
  const name = nameOf(code)
  return { code, label: name === code ? code : `${code} ${name}` }
}))

const result = computed(() => {
  if (!rates.value || !amount.value.ok) return null
  return convert(amount.value.value, from.value, to.value, rates.value)
})
const rate = computed(() => (rates.value ? rateOf(from.value, to.value, rates.value) : null))
const inverseRate = computed(() => (rates.value ? rateOf(to.value, from.value, rates.value) : null))

/** 当前金额换算成其他常用币种 */
const others = computed(() => {
  if (!rates.value || !amount.value.ok) return []
  return COMMON_CURRENCIES
    .filter(code => code !== from.value && rates.value!.rates[code])
    .map(code => ({ code, value: convert(amount.value.ok ? amount.value.value : 0, from.value, code, rates.value!)! }))
})

/** 常用金额速查 */
const quickRows = computed(() => {
  if (!rates.value) return []
  return QUICK_AMOUNTS.map(n => ({
    n,
    forward: convert(n, from.value, to.value, rates.value!)!,
    backward: convert(n, to.value, from.value, rates.value!)!,
  }))
})

const updatedText = computed(() => {
  if (!rates.value) return ''
  return `${formatInZone(rates.value.updatedAt * 1000, 'Asia/Shanghai').dateTime.slice(0, 16)}（北京时间）`
})

const statusText = computed(() => {
  if (liveStatus.value === 'loading') return '正在获取最新汇率…'
  if (liveStatus.value === 'failed') return '获取最新汇率失败，正在使用快照数据'
  if (liveStatus.value === 'live') return '已是最新汇率'
  return ''
})

function swap() {
  [from.value, to.value] = [to.value, from.value]
}

function money(value: number | null, code: string) {
  return value === null ? '—' : formatMoney(value, code)
}

const tips = [
  '输入金额后自动换算，例如输入 1 并选择「美元 → 人民币」，就能看到 1 美元等于多少人民币；金额支持 1,000、2.5万、3亿 这样的写法。',
  `汇率来自 ${RATES_SOURCE.name}，每日更新一次，为市场中间价参考，银行实际买入、卖出价会有差异，大额兑换请以银行牌价为准。`,
  '页面会在打开时获取最新汇率；网络不通时使用网站发布时保存的汇率，并在上方标明更新时间。',
  '只会请求公开的汇率数据，你输入的金额不会发送到任何服务器。',
]
</script>

<template>
  <ToolLayout tool-id="currency-converter">
    <section class="rounded-xl border border-line bg-surface p-5">
      <!-- 输入 -->
      <div class="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto_1fr]">
        <label class="block">
          <span class="mb-1 block text-sm text-muted">金额</span>
          <input
            v-model="amountInput"
            type="text"
            inputmode="decimal"
            aria-label="金额"
            placeholder="如 100、2.5万"
            class="h-11 w-full rounded-lg border bg-surface px-3 font-mono text-lg outline-none focus:border-primary"
            :class="amount.ok ? 'border-line' : 'border-red-500/60'"
          >
        </label>
        <label class="block">
          <span class="mb-1 block text-sm text-muted">从</span>
          <select
            v-model="from"
            aria-label="原币种"
            class="h-11 w-full rounded-lg border border-line bg-surface px-3 text-fg outline-none focus:border-primary"
          >
            <option
              v-for="option in options"
              :key="option.code"
              :value="option.code"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="flex h-11 items-center justify-center rounded-lg border border-line px-3 text-muted transition hover:border-primary hover:text-primary"
          title="交换币种"
          aria-label="交换币种"
          @click="swap"
        >
          <Icon
            name="lucide:arrow-left-right"
            class="size-5"
          />
        </button>
        <label class="block">
          <span class="mb-1 block text-sm text-muted">到</span>
          <select
            v-model="to"
            aria-label="目标币种"
            class="h-11 w-full rounded-lg border border-line bg-surface px-3 text-fg outline-none focus:border-primary"
          >
            <option
              v-for="option in options"
              :key="option.code"
              :value="option.code"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <p
        v-if="!amount.ok"
        class="mt-3 flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400"
        role="alert"
      >
        <Icon
          name="lucide:circle-x"
          class="mt-0.5 size-4 shrink-0"
        />
        {{ amount.error }}
      </p>

      <!-- 结果 -->
      <div
        v-if="rates"
        class="mt-6"
      >
        <p class="text-sm text-muted">
          {{ amount.ok ? money(amount.value, from) : '—' }} {{ nameOf(from) }} =
        </p>
        <div class="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span class="font-mono text-4xl font-bold tabular-nums">{{ money(result, to) }}</span>
          <span class="text-lg">{{ nameOf(to) }}</span>
          <CopyButton
            :text="result === null ? '' : money(result, to)"
            label=""
            variant="pane"
            :disabled="result === null"
          />
        </div>
        <p class="mt-2 font-mono text-sm text-muted">
          1 {{ from }} = {{ rate === null ? '—' : formatRate(rate) }} {{ to }}
          <span class="mx-2">·</span>
          1 {{ to }} = {{ inverseRate === null ? '—' : formatRate(inverseRate) }} {{ from }}
        </p>
      </div>
      <p
        v-else
        class="mt-6 text-sm text-red-600 dark:text-red-400"
      >
        暂时无法获取汇率数据，请稍后刷新重试
      </p>

      <!-- 数据来源 -->
      <p
        v-if="rates"
        class="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-xs text-muted"
      >
        <span>汇率更新于 {{ updatedText }}</span>
        <span>·</span>
        <span>
          来源 <a
            :href="RATES_SOURCE.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary hover:underline"
          >{{ RATES_SOURCE.name }}</a>
        </span>
        <span
          v-if="statusText"
          class="rounded-full px-2 py-0.5"
          :class="liveStatus === 'failed' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-surface-2'"
        >{{ statusText }}</span>
      </p>
    </section>

    <div
      v-if="rates"
      class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2"
    >
      <!-- 速查表 -->
      <section class="rounded-xl border border-line bg-surface p-5">
        <h2 class="font-semibold">
          常用金额速查
        </h2>
        <table class="mt-3 w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="py-2 font-normal">
                {{ nameOf(from) }} → {{ nameOf(to) }}
              </th>
              <th class="py-2 text-right font-normal">
                {{ nameOf(to) }} → {{ nameOf(from) }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line font-mono tabular-nums">
            <tr
              v-for="row in quickRows"
              :key="row.n"
            >
              <td class="py-2">
                {{ row.n.toLocaleString('zh-CN') }} {{ from }} = {{ formatMoney(row.forward, to) }} {{ to }}
              </td>
              <td class="py-2 text-right">
                {{ row.n.toLocaleString('zh-CN') }} {{ to }} = {{ formatMoney(row.backward, from) }} {{ from }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 其他币种 -->
      <section class="rounded-xl border border-line bg-surface p-5">
        <h2 class="font-semibold">
          换算成其他常用货币
        </h2>
        <ul class="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <li
            v-for="item in others"
            :key="item.code"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 border-b border-line py-2 text-left text-sm transition hover:text-primary"
              :class="{ 'text-primary': item.code === to }"
              :title="`设为目标币种：${nameOf(item.code)}`"
              @click="to = item.code"
            >
              <span class="truncate">{{ nameOf(item.code) }} <span class="text-xs text-muted">{{ item.code }}</span></span>
              <span class="font-mono tabular-nums">{{ formatMoney(item.value, item.code) }}</span>
            </button>
          </li>
        </ul>
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

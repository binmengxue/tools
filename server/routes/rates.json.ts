/**
 * 汇率快照：/rates.json
 * 只在 nuxt generate 预渲染时运行一次，结果写成静态文件随站点部署；
 * 请求失败时返回仓库里的兜底快照，保证离线也能构建。
 */
import { parseApiResponse, RATES_API } from '../../app/utils/tools/currency'
import type { RatesData } from '../../app/utils/tools/currency'
import fallback from '../data/rates-fallback.json'

// 缓存一小时：预渲染时 /rates.json 和货币页面的载荷会各请求一次，保证两者数据一致
export default defineCachedEventHandler(async (): Promise<RatesData> => {
  try {
    const json = await $fetch<unknown>(RATES_API, { timeout: 8000 })
    const data = parseApiResponse(json)
    if (data) return data
    console.warn('[rates] 汇率接口返回的数据格式不正确，使用兜底快照')
  }
  catch (error) {
    console.warn('[rates] 获取汇率失败，使用兜底快照：', error instanceof Error ? error.message : error)
  }
  return fallback as RatesData
}, { maxAge: 3600, name: 'rates' })

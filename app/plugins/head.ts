/**
 * 全站 head 设置
 * 放在插件里而不是 app.vue：错误页（error.vue）会替换 app.vue，插件对两者都生效。
 */
import { site } from '~/config/site'

export default defineNuxtPlugin(() => {
  useHead({
    titleTemplate: title => (title ? `${title} - ${site.name}` : `${site.name} - 免费中文在线效率工具`),
    meta: [{ name: 'theme-color', content: '#0b0d12' }],
  })

  useSeoMeta({
    description: site.description,
    ogSiteName: site.name,
    ogType: 'website',
  })
})

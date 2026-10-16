/**
 * 全站 head 设置
 * 放在插件里而不是 app.vue：错误页（error.vue）会替换 app.vue，插件对两者都生效。
 */
import { site } from '~/config/site'

export default defineNuxtPlugin(() => {
  useHead({
    titleTemplate: title => (title ? `${title} - ${site.name}` : `${site.name} - ${site.slogan}`),
    meta: [{ name: 'theme-color', content: '#5b4fe0' }],
  })

  useSeoMeta({
    description: site.description,
    ogSiteName: site.name,
    ogType: 'website',
  })
})

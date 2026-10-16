// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'
import { site, THEME_STORAGE_KEY } from './app/config/site'
import { tools } from './app/config/tools'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/icon', '@nuxtjs/sitemap'],

  // 开启 SSR，配合 nuxt generate 预渲染出每个路由的完整 HTML
  ssr: true,

  // 组件按文件名注册，不带目录前缀（如 components/layout/AppHeader.vue -> <AppHeader>）
  components: [{ path: '~/components', pathPrefix: false }],

  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
      link: [{ rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }],
      script: [
        {
          // 首屏渲染前读取已保存的主题，避免浅色用户看到深色闪烁（写在这里，404 等 SPA 兜底页也会包含）
          innerHTML: `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='light')document.documentElement.dataset.theme='light'}catch(e){}`,
        },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  // @nuxtjs/sitemap 等 SEO 模块读取的站点信息
  site: {
    url: site.url,
    name: site.name,
  },
  compatibilityDate: '2025-07-15',

  nitro: {
    prerender: {
      crawlLinks: true,
      // 首页 + 注册表中的全部工具页，每个路由输出 <路由>/index.html
      // （不用扁平的 <路由>.html：同名目录里有 _payload.json，nginx 的 $uri/ 会先命中目录导致 403）
      routes: ['/', ...tools.map(t => t.path)],
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  icon: {
    // 内联 SVG 渲染，便于用 CSS 控制填充色
    mode: 'svg',
    // 纯静态部署没有图标服务端接口，只使用打包进客户端的图标
    provider: 'none',
    clientBundle: {
      // 扫描源码中的字面量图标名（含 config/tools.ts 中的配置）
      scan: {
        globInclude: ['app/**/*.vue', 'app/**/*.ts'],
      },
    },
  },
})

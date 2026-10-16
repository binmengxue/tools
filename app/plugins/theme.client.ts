/**
 * 客户端主题初始化
 * 在 app:mounted（水合完成）之后才同步主题状态，保证预渲染 HTML 与首次客户端渲染一致。
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    nuxtApp.runWithContext(() => useTheme().init())
  })
})

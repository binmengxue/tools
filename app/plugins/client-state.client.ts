/**
 * 客户端状态初始化：主题、收藏、最近使用
 * 在 app:mounted（水合完成）之后才读取 localStorage，保证预渲染 HTML 与首次客户端渲染一致。
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    nuxtApp.runWithContext(() => {
      useTheme().init()
      useFavorites().load()
      useRecent().load()
    })
  })
})

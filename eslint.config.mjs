// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  // 自托管的第三方运行时与模型文件，不做检查
  ignores: ['public/models/**'],
})

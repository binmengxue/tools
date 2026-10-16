import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// 纯函数单测：工具逻辑都放在 app/utils 下，不依赖 Nuxt 运行时
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})

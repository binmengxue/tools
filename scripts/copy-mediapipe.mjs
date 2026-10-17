// 把 MediaPipe 运行时（wasm）从 node_modules 复制到 public/models/，供人像美颜按需加载。
// 国内访问不了 Google 的 CDN，所以自托管；文件较大（约 14 MB），不提交到仓库（见 .gitignore）。
// 在 pnpm dev / pnpm generate 之前自动执行，已存在且大小一致时跳过。
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision')
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
const target = join(root, 'public', 'models', `mediapipe-${version}`)

// 只需要 SIMD 版本：2021 年以后的主流浏览器都支持 WebAssembly SIMD
const files = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']

mkdirSync(target, { recursive: true })
for (const file of files) {
  const from = join(pkgDir, 'wasm', file)
  const to = join(target, file)
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue
  copyFileSync(from, to)
  console.log(`[mediapipe] 已复制 ${file} → public/models/mediapipe-${version}/`)
}

# 第二个项目：中文在线效率工具箱 — tools.sheyinglai.top

## Context
已有站点 https://sheyinglai.top（摄影来，Vue3 + Vite SPA，nginx/1.24 Ubuntu，HTTPS 已通），跑在阿里云轻量服务器 106.14.171.234（2C2G / 40G，Ubuntu 24.04），域名下已有 `@ / www / api / api-test` 四条 A 记录。
目标：两周内做一个参考「极速箱」风格的中文工具箱，作为作品集项目，同时可被搜索引擎收录带来流量。

已确定：
- 访问地址：**tools.sheyinglai.top**（独立子域名，与摄影来完全隔离）
- 技术：**Nuxt 静态生成**（使用当前稳定大版本，`nuxi generate` 产出纯静态文件，每个工具一个独立 HTML，利于 SEO）
- 第一期**纯前端、零后端**；HTTP 请求测试、IP 查询放到二期

> 这是一个**新的独立仓库**（如 `~/projects/toolbox`），与当前 vuen-crossretail 仓库无关。

---

## 一、技术栈
| 方面 | 选择 |
|---|---|
| 框架 | Nuxt（Vue 3 + TS），`ssr: true` + `nuxi generate` 预渲染 |
| 样式 | Tailwind CSS，深色主题为主（参考图风格），CSS 变量做亮/暗切换 |
| 图标 | `@nuxt/icon`（Iconify），按需加载 |
| 状态 | `useState` + localStorage（收藏、最近使用、主题） |
| 编辑器 | 大文本用 `<textarea>`；需要高亮的（JSON 编辑器、代码格式化）懒加载 CodeMirror 6 |
| 质量 | ESLint + Vitest（工具的纯函数逻辑写单测） |
| SEO | `useSeoMeta` 每页 title/description，`@nuxtjs/sitemap` 生成 sitemap.xml |

## 二、核心架构：工具注册表驱动
所有首页卡片、分类 Tab、搜索、收藏都由一份配置驱动，新增工具只需「加一条配置 + 写一个页面」。

```
app/
  config/tools.ts          # 工具注册表：id、name、desc、icon、categories[]、keywords[]、path
  config/categories.ts     # 分类：常用 / JSON / 编码加密 / 时间日期 / 代码 / 文本 / 图像 / 前端开发
  pages/index.vue          # 首页：分类 Tab + 卡片网格 + 搜索过滤
  pages/[tool].vue 或 pages/<tool-id>.vue  # 每个工具一个页面（推荐后者，便于按需拆包）
  components/
    layout/AppHeader.vue   # Logo、全局搜索（Ctrl+K）、收藏入口、主题切换、GitHub
    tool/ToolCard.vue      # 卡片：图标、标签、描述、收藏星标
    tool/ToolLayout.vue    # 工具页通用外壳：标题、说明、输入区/输出区、复制/清空/下载按钮
    common/CopyButton.vue、FileDrop.vue、SplitPane.vue
  composables/
    useFavorites.ts        # 收藏（localStorage，SSR 安全：onMounted 后读取）
    useRecent.ts           # 最近使用
    useClipboard.ts        # 复制 + toast
  utils/tools/*.ts         # 每个工具的纯函数逻辑，配 Vitest 单测
```
关键点：localStorage 只在客户端读（`onMounted` / `<ClientOnly>`），避免预渲染时报错和水合不一致。

## 三、第一期工具清单（14 个，全部纯前端）
| 分类 | 工具 | 依赖 |
|---|---|---|
| JSON | JSON 格式化/校验、JSON 编辑器、JSON ⇄ YAML/XML/CSV | 原生 JSON、`js-yaml`、`fast-xml-parser`、`papaparse` |
| 编码加密 | Base64、URL 编解码、Unicode ⇄ 中文、MD5/SHA/AES、JWT 解析 | 原生 `btoa`/`TextEncoder`、`crypto-js`（MD5/AES）、Web Crypto（SHA）、手写 JWT 解码 |
| 时间日期 | 时间戳转换、日期计算器、时区转换 | `dayjs` + utc/timezone 插件 |
| 文本 | 正则测试（实时高亮匹配）、字数统计、文本对比 | 原生 RegExp、`diff` |
| 图像 | 图片压缩、二维码生成 | `browser-image-compression`、`qrcode` |
| 前端 | 颜色工具（HEX/RGB/HSL）、CSS 渐变生成器 | 手写 |
| 代码 | 代码格式化（HTML/CSS/JS） | `prettier/standalone`（体积大，必须动态 `import()`） |

二期（需要后端）：HTTP 请求测试（代理需限流 + 禁内网地址防 SSRF）、IP 查询（本地 ip2region 库）、文件转 Markdown。

## 四、两周排期
| 天 | 内容 |
|---|---|
| D1 | 初始化 Nuxt + Tailwind + ESLint，配置 DNS/nginx/HTTPS，先部署一个 Hello 页打通上线链路 |
| D2–D3 | 注册表、首页（分类 Tab、卡片网格、搜索、收藏、最近使用）、Header、ToolLayout、主题切换、响应式 |
| D4–D5 | JSON 类 3 个 + 编码类 5 个 |
| D6–D7 | 时间类 3 个 + 文本类 3 个 |
| D8–D9 | 图像 2 个 + 前端 2 个 + 代码格式化 |
| D10 | SEO（每页 meta、sitemap、robots）、404 页、Lighthouse 优化、移动端走查 |
| D11–D12 | Vitest 补单测、交互细节（快捷键、拖拽上传、一键复制 toast） |
| D13–D14 | 缓冲 + README（作品集说明、截图、技术亮点）+ 正式上线、提交百度/Google 站长平台 |

功能超期时砍掉的优先级：代码格式化 → 文本对比 → 时区转换。

## 五、部署方案（服务器上只放静态文件，不在 2G 机器上构建）
1. **DNS**：阿里云域名解析加一条 `tools` → A 记录 → `106.14.171.234`。
2. **服务器目录**：`/var/www/tools`（与摄影来目录分开）。
3. **nginx**：新建 `/etc/nginx/sites-available/tools.sheyinglai.top`，`ln -s` 到 `sites-enabled`：
   - `root /var/www/tools; try_files $uri $uri/ $uri.html /404.html;`
   - `/_nuxt/` 下带 hash 的资源加 `Cache-Control: public, max-age=31536000, immutable`，HTML 不缓存
   - 开启 gzip
   - `nginx -t && systemctl reload nginx`（reload 不中断摄影来）
4. **HTTPS**：现有站点 HTTPS 是在服务器上自己配的（阿里云控制台显示「未设置」），推测为 certbot。沿用：`certbot --nginx -d tools.sheyinglai.top`，自动续期已由 certbot timer 管理。
5. **发布**：本地或 GitHub Actions 执行 `nuxi generate` → `rsync -avz --delete .output/public/ user@106.14.171.234:/var/www/tools/`。推荐 GitHub Actions（push main 自动发布，SSH key 存 Secrets），作品集里也是加分项。
6. **防火墙**：轻量服务器防火墙 80/443 已开（摄影来在用），无需改动。

## 六、注意事项
- **ICP 备案**：子域名沿用主域名备案，无需重新备案；但页脚必须展示**真实备案号**并链接到 beian.miit.gov.cn。目前摄影来页脚是占位符 `苏ICP备XXXXXXXX号`，两个站都要改成真实号。参考图里的备案号/公司名属于别人，不要照搬。
- 内容合规：工具站不涉及用户数据上传，所有处理在浏览器本地完成，可在页面上注明「数据不上传服务器」，这也是卖点。
- 资源占用：静态站对 2G 内存几乎无压力，不影响摄影来和 api。

## 验证
- 本地：`pnpm dev` 走查每个工具；`pnpm test` 跑 Vitest；`pnpm generate && npx serve .output/public` 检查预渲染产物（直接访问 `/json-formatter` 能看到完整 HTML，不是空壳）。
- 线上：`curl -I https://tools.sheyinglai.top` 返回 200 且证书有效；随便一个工具页直接刷新不 404；`https://sheyinglai.top` 和 `api.sheyinglai.top` 照常可用。
- Lighthouse：Performance / SEO ≥ 90；手机宽度下无横向滚动。

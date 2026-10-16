# 效率工具箱

免费、无广告的中文在线效率工具箱，线上地址：<https://tools.sheyinglai.top>

- JSON 格式化、编码加密、时间戳转换、正则测试、图片压缩等常用开发 / 办公小工具
- **纯前端**：所有数据只在浏览器本地处理，不上传服务器
- **静态生成**：每个工具一个独立 HTML 页面，利于搜索引擎收录
- 深色 / 浅色主题、收藏、最近使用、`Ctrl + K` 快速搜索，适配手机

> 当前进度：项目骨架、首页、工具页外壳已完成，各工具页面为「开发中」占位，排期见 [PLAN.md](PLAN.md)。

## 技术栈

| 方面 | 选择 |
|---|---|
| 框架 | Nuxt 4（Vue 3 + TypeScript），`ssr: true` + `nuxt generate` 预渲染 |
| 样式 | Tailwind CSS 4，CSS 变量实现亮 / 暗主题 |
| 图标 | `@nuxt/icon` + Lucide（构建时打包进客户端，无运行时请求） |
| 质量 | ESLint（`@nuxt/eslint`）+ Vitest |
| SEO | 每页 `useSeoMeta`，`@nuxtjs/sitemap` 生成 `sitemap.xml` |

## 目录结构

```
app/
  config/
    categories.ts     # 分类配置
    tools.ts          # 工具注册表（首页卡片、搜索、预渲染路由都由它驱动）
    site.ts           # 站点名称、域名、ICP 备案号
  components/
    layout/           # AppHeader、AppFooter
    tool/             # ToolCard、ToolLayout、ToolPlaceholder
    common/           # CopyButton、AppToast
  composables/        # useFavorites、useRecent、useTheme、useClipboard、useToast、useHomeFilter
  utils/              # 纯函数逻辑（搜索过滤、localStorage 读写等），配 Vitest 单测
  pages/              # index.vue 首页 + 每个工具一个 <tool-id>.vue
  error.vue           # 404 / 错误页
tests/                # Vitest 单元测试
nginx/                # nginx 站点配置示例
scripts/deploy.sh     # rsync 发布脚本
```

### 新增一个工具

1. 在 `app/config/tools.ts` 里加一条配置（`id`、`name`、`desc`、`icon`、`categories`、`keywords`、`path`）。
2. 新建 `app/pages/<id>.vue`，用 `<ToolLayout tool-id="<id>">` 包住工具内容，并调用 `useSeoMeta(toolSeo(tool))`。
3. 工具的核心逻辑写成纯函数放到 `app/utils/`，在 `tests/` 里补单测。

图标名请写成字面量（如 `'lucide:braces'`），`@nuxt/icon` 才能在构建时扫描并打包。

## 本地开发

环境：Node.js 20+（开发时使用 v24），pnpm 9+。

```bash
pnpm install
```

```bash
pnpm dev
```

访问 <http://localhost:3000>。

常用命令：

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 本地开发 |
| `pnpm lint` | ESLint 检查（`pnpm lint:fix` 自动修复） |
| `pnpm test` | 运行 Vitest 单元测试 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm generate` | 预渲染静态站点到 `.output/public` |

## 构建

```bash
pnpm generate
```

产物在 `.output/public`：首页 `index.html`、每个工具一个 `<tool-id>/index.html`、`404.html`、`sitemap.xml`、`robots.txt` 以及 `_nuxt/` 下带 hash 的静态资源。

本地预览构建结果：

```bash
npx serve .output/public
```

直接访问 `/json-formatter` 应能看到完整 HTML（查看网页源代码不是空壳）。

## 部署

服务器上只放静态文件，不在服务器上构建。

### 一、服务器初始化（只需做一次，需手动操作）

1. **DNS 解析**：在阿里云域名解析中为 `sheyinglai.top` 添加一条记录：
   - 记录类型 `A`，主机记录 `tools`，记录值 `106.14.171.234`
2. **创建站点目录**：

   ```bash
   sudo mkdir -p /var/www/tools && sudo chown -R $USER:$USER /var/www/tools
   ```

3. **启用 nginx 站点**：把仓库里的 [nginx/tools.sheyinglai.top.conf](nginx/tools.sheyinglai.top.conf) 上传到服务器的 `/etc/nginx/sites-available/tools.sheyinglai.top`，然后：

   ```bash
   sudo ln -s /etc/nginx/sites-available/tools.sheyinglai.top /etc/nginx/sites-enabled/
   ```

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

   `reload` 不会中断已在运行的 sheyinglai.top。

4. **配置 HTTPS**（DNS 生效后执行）：

   ```bash
   sudo certbot --nginx -d tools.sheyinglai.top
   ```

   certbot 会自动写入证书配置和 http → https 跳转，续期由已有的 certbot timer 负责。

5. **ICP 备案号**：把 `app/config/site.ts` 里的 `icp` 占位符改成真实备案号（子域名沿用主域名备案），页脚会链接到 <https://beian.miit.gov.cn>。

### 二、发布

确认本机可以通过 SSH 免密登录服务器后：

```bash
DEPLOY_HOST=106.14.171.234 DEPLOY_USER=<服务器用户名> ./scripts/deploy.sh
```

脚本会先执行 `pnpm generate`，再用 `rsync -avz --delete` 把 `.output/public/` 同步到服务器 `/var/www/tools/`。已构建过可加 `SKIP_BUILD=1` 跳过构建。Windows 下请在 Git Bash 或 WSL 中运行（需要 `rsync`）。

### 三、上线检查

- `curl -I https://tools.sheyinglai.top` 返回 200 且证书有效
- 直接打开任意工具页（如 `/json-formatter`）并刷新，不出现 404
- `https://sheyinglai.top` 和 `api.sheyinglai.top` 照常可用


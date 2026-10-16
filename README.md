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
deploy.ps1            # Windows 一键发布脚本（检查 → 打包 → 上传）
scripts/deploy.sh     # rsync 发布脚本（需要本机有 rsync）
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

服务器上只放静态文件，不在服务器上构建。做法和 sheyinglai.top 一致：本机用 `scp` + `ssh` 以 root 登录服务器（需先配置好 SSH 免密登录），HTTPS 使用阿里云免费证书。以下命令都在本机项目根目录执行，PowerShell 和 Git Bash 都可以。

### 一、服务器初始化（只需做一次）

1. **DNS 解析**：阿里云云解析 DNS → `sheyinglai.top` → 添加记录：记录类型 `A`，主机记录 `tools`，记录值 `106.14.171.234`。生效后可用 `nslookup tools.sheyinglai.top` 验证。

2. **申请证书**：阿里云「数字证书管理服务」→ SSL 证书 → 免费证书，为 `tools.sheyinglai.top` 申请一张（免费证书只覆盖单个域名，主域名那张不能用）。签发后下载 **Nginx** 格式，把两个文件重命名为 `tools.sheyinglai.top.pem` 和 `tools.sheyinglai.top.key`。

3. **上传证书**（在证书文件所在目录执行）：

   ```bash
   scp tools.sheyinglai.top.pem tools.sheyinglai.top.key root@106.14.171.234:/etc/nginx/cert/
   ```

4. **启用 nginx 站点**：上传 [nginx/tools.sheyinglai.top.conf](nginx/tools.sheyinglai.top.conf)（已包含 80 → 443 跳转和证书配置）：

   ```bash
   scp nginx/tools.sheyinglai.top.conf root@106.14.171.234:/etc/nginx/sites-available/tools
   ```

   ```bash
   ssh root@106.14.171.234 "mkdir -p /var/www/tools && ln -sf /etc/nginx/sites-available/tools /etc/nginx/sites-enabled/tools && nginx -t && systemctl reload nginx"
   ```

   必须先完成第 3 步，否则 `nginx -t` 会因为找不到证书文件而失败。`reload` 不会中断正在运行的 sheyinglai.top。

5. **ICP 备案号**：把 `app/config/site.ts` 里的 `icp` 占位符改成真实备案号（子域名沿用主域名备案），页脚会链接到 <https://beian.miit.gov.cn>。

### 二、发布（每次更新都执行）

在项目根目录的 PowerShell 里执行一条命令，就能完成检查、打包、上传：

```powershell
.\deploy.ps1
```

脚本依次执行 `pnpm lint`、`pnpm test`、`pnpm generate`，再把 `.output/public` 上传到服务器的临时目录，整体替换 `/var/www/tools`。任一步失败都会停止，不会动线上文件。只改了文案之类的小改动时，可以用 `.\deploy.ps1 -SkipCheck` 跳过 lint 和 test。

不用脚本时，等价的手动命令如下：

```bash
pnpm generate
```

```bash
ssh root@106.14.171.234 "rm -rf /tmp/public" ; scp -q -r .output/public root@106.14.171.234:/tmp/
```

```bash
ssh root@106.14.171.234 "rm -rf /var/www/tools/* && cp -r /tmp/public/. /var/www/tools/ && rm -rf /tmp/public"
```

先把构建产物传到服务器的临时目录，再整体替换 `/var/www/tools`，最后清理临时目录。

> `scripts/deploy.sh` 是 rsync 版本的发布脚本，只能在本机装有 `rsync` 的环境（macOS / Linux / WSL）使用。

### 三、证书续期

阿里云免费证书有效期较短（以控制台显示为准，目前为 3 个月），到期前在控制台重新申请，按第 2、3 步下载并覆盖 `/etc/nginx/cert/` 下的同名文件，然后执行：

```bash
ssh root@106.14.171.234 "nginx -t && systemctl reload nginx"
```

### 四、上线检查

- `curl -I https://tools.sheyinglai.top` 返回 200 且证书有效
- `http://tools.sheyinglai.top` 自动跳转到 https
- 直接打开任意工具页（如 `/json-formatter`）并刷新，不出现 404
- `https://sheyinglai.top` 和 `api.sheyinglai.top` 照常可用

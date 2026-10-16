#!/usr/bin/env bash
# 发布脚本：本地构建静态文件后用 rsync 同步到服务器 /var/www/tools
#
# 用法：
#   DEPLOY_HOST=106.14.171.234 DEPLOY_USER=ubuntu ./scripts/deploy.sh
#   SKIP_BUILD=1 ./scripts/deploy.sh   # 已经执行过 pnpm generate 时跳过构建
#
# 前提：本机已配置好到服务器的 SSH 免密登录，且 DEPLOY_USER 对 /var/www/tools 有写权限。
set -euo pipefail

# ===== 按需修改或通过环境变量传入 =====
DEPLOY_HOST="${DEPLOY_HOST:-your.server.ip}"
DEPLOY_USER="${DEPLOY_USER:-your-user}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/tools}"
# =====================================

if [[ "$DEPLOY_HOST" == "your.server.ip" || "$DEPLOY_USER" == "your-user" ]]; then
  echo "请先设置 DEPLOY_HOST 和 DEPLOY_USER，例如：" >&2
  echo "  DEPLOY_HOST=1.2.3.4 DEPLOY_USER=ubuntu ./scripts/deploy.sh" >&2
  exit 1
fi

# 切到项目根目录
cd "$(dirname "$0")/.."

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> 构建静态文件 (pnpm generate)"
  pnpm generate
fi

if [[ ! -f .output/public/index.html ]]; then
  echo "未找到 .output/public/index.html，请先执行 pnpm generate" >&2
  exit 1
fi

echo "==> 同步到 ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
# --delete：删除服务器上已不存在于本地产物中的旧文件
rsync -avz --delete \
  -e "ssh -p ${DEPLOY_PORT}" \
  .output/public/ \
  "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

echo "==> 发布完成：https://tools.sheyinglai.top"

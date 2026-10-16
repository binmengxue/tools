# 一键发布到 https://tools.sheyinglai.top
# 放在项目根目录 E:\liuxueqin\toolbox\ 下，用法：
#   .\deploy.ps1              检查（lint + test）→ 打包 → 上传替换
#   .\deploy.ps1 -SkipCheck   跳过 lint 和 test，直接打包上传（只改了文案等小改动时用）
param([switch]$SkipCheck)

$Remote = "root@106.14.171.234"
$Target = "/var/www/tools"
$Root = $PSScriptRoot

function Check($step) {
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "[失败] $step，已停止发布" -ForegroundColor Red
        exit 1
    }
}

Push-Location $Root

if (-not $SkipCheck) {
    Write-Host ">>> 代码检查 (pnpm lint)..." -ForegroundColor Cyan
    pnpm lint; Check "代码检查"
    Write-Host ">>> 单元测试 (pnpm test)..." -ForegroundColor Cyan
    pnpm test; Check "单元测试"
}

Write-Host ">>> 打包 (pnpm generate)..." -ForegroundColor Cyan
pnpm generate; Check "打包"
if (-not (Test-Path "$Root\.output\public\index.html")) {
    $LASTEXITCODE = 1; Check "未找到 .output\public\index.html"
}

Write-Host ">>> 上传..." -ForegroundColor Cyan
ssh $Remote "rm -rf /tmp/public"; Check "清理临时目录"
scp -q -r "$Root\.output\public" "${Remote}:/tmp/"; Check "上传文件"
ssh $Remote "rm -rf $Target/* && cp -r /tmp/public/. $Target/ && rm -rf /tmp/public"; Check "替换网站文件"

Pop-Location

Write-Host ""
Write-Host "发布完成：https://tools.sheyinglai.top" -ForegroundColor Green

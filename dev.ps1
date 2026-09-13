# 本机没有全局安装 Node，这个脚本用 ganhuo-ai 自带的运行时来跑 npm。
#
#   .\dev.ps1 install          安装依赖
#   .\dev.ps1 run dev          启动开发服务器 (http://localhost:4321)
#   .\dev.ps1 run build        构建静态站到 dist/
#   .\dev.ps1 run sync:assets  重新同步 wasm / 模型
#
# 注意：在任何 npm 命令前加 `run` 才能执行 package.json 里的 script。
# npm 缓存被重定向到项目内的 .npm-cache，避免写工作区外。

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$NpmArgs
)

$nodeDir = 'C:\Users\ikm\AppData\Local\Programs\ganhuo-ai\resources\runtime\win32-x64\node'

if (-not (Test-Path (Join-Path $nodeDir 'npm.cmd'))) {
  Write-Error "找不到 Node 运行时：$nodeDir`n如果 ganhuo-ai 被卸载了，请改装官方 Node.js（>= 22.12）。"
  exit 1
}

$env:Path = "$nodeDir;$env:Path"
$env:npm_config_cache = Join-Path $PSScriptRoot '.npm-cache'
# 浏览器装在项目内，这样重装 Playwright 不需要额外的目录权限
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PSScriptRoot '.playwright-browsers'
$env:NO_COLOR = '1'
Set-Location $PSScriptRoot

& (Join-Path $nodeDir 'npm.cmd') @NpmArgs
exit $LASTEXITCODE

# 校园通 CampusKit · 一键构建脚本
# 作用：获取 WebView2 SDK → 生成图标 → 编译原生外壳 → 打包成绿色版软件
# 用法：在本目录执行  powershell -ExecutionPolicy Bypass -File .\build.ps1
#       可选参数 -Target "E:\AI大赛\校园通" 指定输出目录

param(
    [string]$Target = "E:\AI大赛\校园通",
    [string]$WebView2Version = "1.0.4258.31",
    [switch]$SkipShortcut
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkg = Join-Path $here "_sdk\pkg"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$app = Split-Path -Parent $here        # 网页源码目录（campus-app）

Write-Host "== 1/5 检查编译器 ==" -ForegroundColor Cyan
if (-not (Test-Path $csc)) { throw "未找到 csc.exe（需要 .NET Framework 4.x）" }
Write-Host "   csc: $csc"

Write-Host "== 2/5 检查 WebView2 SDK ==" -ForegroundColor Cyan
$coreDll = Join-Path $pkg "lib\net462\Microsoft.Web.WebView2.Core.dll"
$loaderDll = Join-Path $pkg "runtimes\win-x64\native\WebView2Loader.dll"
if (-not (Test-Path $coreDll) -or -not (Test-Path $loaderDll)) {
    Write-Host "   本地缺少 SDK，正在从 NuGet 下载 $WebView2Version ..."
    New-Item -ItemType Directory -Force -Path (Join-Path $here "_sdk") | Out-Null
    $zip = Join-Path $here "_sdk\webview2.zip"
    $url = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$WebView2Version/microsoft.web.webview2.$WebView2Version.nupkg"
    Invoke-WebRequest $url -OutFile $zip -TimeoutSec 300
    if (Test-Path $pkg) { Remove-Item $pkg -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $pkg -Force
}
Write-Host "   SDK 就绪"

Write-Host "== 3/5 生成图标 ==" -ForegroundColor Cyan
$ico = Join-Path $here "app.ico"
$py = "C:\Users\NS\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
if (Test-Path $py) {
    & $py (Join-Path $here "icon_gen.py") | Out-Null
} elseif (-not (Test-Path $ico)) {
    Write-Host "   跳过（未找到 Python，且已存在 app.ico）" -ForegroundColor Yellow
}
if (-not (Test-Path $ico)) { throw "缺少 app.ico" }

Write-Host "== 4/5 编译原生外壳 ==" -ForegroundColor Cyan
$outExe = Join-Path $here "build\CampusKit.exe"
New-Item -ItemType Directory -Force -Path (Join-Path $here "build") | Out-Null
& $csc /nologo /target:winexe /codepage:65001 /optimize+ /platform:x64 `
    /win32icon:"$ico" /win32manifest:"$here\app.manifest" /out:"$outExe" `
    /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll `
    /reference:"$coreDll" "$here\Program.cs" "$here\LanServer.cs"
if ($LASTEXITCODE -ne 0) { throw "编译失败" }
Write-Host "   编译完成: $outExe"

Write-Host "== 5/5 打包到 $Target ==" -ForegroundColor Cyan
# 正在运行的实例会锁定 exe，先关闭
$running = Get-Process -Name "校园通" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "   检测到运行中的实例，正在关闭 ..."
    $running | Stop-Process -Force
    Start-Sleep -Milliseconds 900
}
New-Item -ItemType Directory -Force -Path $Target, (Join-Path $Target "app") | Out-Null
Copy-Item $outExe (Join-Path $Target "校园通.exe") -Force
Copy-Item (Join-Path $here "app.config") (Join-Path $Target "校园通.exe.config") -Force
Copy-Item $ico (Join-Path $Target "app.ico") -Force
Copy-Item $coreDll $Target -Force
Copy-Item $loaderDll $Target -Force
Copy-Item (Join-Path $here "使用说明.txt") $Target -Force

# app\ 只放运行时资源（网页本体 + PWA 资源 + 自测页），保持干净
foreach ($item in @("index.html", "css", "js", "icons", "img", "tests", "manifest.webmanifest", "sw.js")) {
    $src = Join-Path $app $item
    if (Test-Path $src) { Copy-Item $src (Join-Path $Target "app") -Recurse -Force }
}
# 项目文档与截屏单独放，README 里的 docs/ 相对链接保持一致
$docDir = Join-Path $Target "文档"
New-Item -ItemType Directory -Force -Path $docDir | Out-Null
if (Test-Path (Join-Path $app "README.md")) { Copy-Item (Join-Path $app "README.md") $docDir -Force }
if (Test-Path (Join-Path $app "docs")) { Copy-Item (Join-Path $app "docs") $docDir -Recurse -Force }
# 源码副本，便于二次修改
$srcDir = Join-Path $Target "源码"
New-Item -ItemType Directory -Force -Path $srcDir | Out-Null
foreach ($f in @("Program.cs", "LanServer.cs", "app.manifest", "app.config", "build.ps1", "icon_gen.py", "app.ico")) {
    $src = Join-Path $here $f
    if (Test-Path $src) { Copy-Item $src $srcDir -Force }
}
# 修正脚本编码为 UTF-8 BOM（Windows PowerShell 5.1 需要）
foreach ($f in (Get-ChildItem $Target -Recurse -Filter *.ps1 -ErrorAction SilentlyContinue)) {
    $t = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($f.FullName, $t, (New-Object System.Text.UTF8Encoding($true)))
}

if (-not $SkipShortcut) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Target "tools\install-shortcut.ps1")
}

Write-Host ""
Write-Host "构建完成 → $Target" -ForegroundColor Green
Get-ChildItem $Target | Select-Object Name | Format-Table -AutoSize

# 校园通 Android APK 构建脚本（不使用 Gradle，直接调用 SDK 工具链）
#
# 流程：aapt2 compile → aapt2 link → javac → d8 → 打包 classes.dex → zipalign → apksigner
# 用法：powershell -ExecutionPolicy Bypass -File build.ps1 [-Release]
#   -Release 时使用 release.keystore（若不存在则自动生成并提示妥善保存）

param(
    [switch]$Release,
    [string]$OutApk = ""
)

$ErrorActionPreference = "Continue"   # 原生工具（keytool/javac 等）会把正常信息写到 stderr，
                                      # 若设为 Stop 会被误判为致命错误；统一用 $LASTEXITCODE 判断
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$sdk = Join-Path $here "_sdk"
$web = Split-Path -Parent $here          # campus-app（网页源码）
$build = Join-Path $here "build"

function Find-Tool($name, $root) {
    $f = Get-ChildItem $root -Recurse -Filter $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $f) { throw "未找到 $name（在 $root 下）" }
    return $f.FullName
}

Write-Host "== 0/8 检查 Android SDK（缺失则自动下载，约 300 MB，仅首次） ==" -ForegroundColor Cyan
function Ensure-Component($name, $url, $zipName) {
    $target = Join-Path $sdk $name
    if (Test-Path $target) {
        $has = (Get-ChildItem $target -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
        if ($has -gt 0) { return }
    }
    $dl = Join-Path $here "_dl"
    New-Item -ItemType Directory -Force -Path $dl, $target | Out-Null
    $zip = Join-Path $dl $zipName
    if (-not (Test-Path $zip) -or (Get-Item $zip).Length -lt 1MB) {
        Write-Host "   下载 $zipName ..."
        & curl.exe -L --fail --retry 2 --connect-timeout 25 -s -o $zip $url
        if ($LASTEXITCODE -ne 0) { throw "下载失败: $url" }
    }
    Write-Host "   解压 $zipName ..."
    & tar.exe -xf $zip -C $target
    if ($LASTEXITCODE -ne 0) { throw "解压失败: $zipName" }
}
Ensure-Component "jdk"         "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jdk/x64/windows/OpenJDK17U-jdk_x64_windows_hotspot_17.0.20.1_1.zip" "jdk17.zip"
Ensure-Component "build-tools" "https://dl.google.com/android/repository/build-tools_r34-windows.zip" "build-tools.zip"
Ensure-Component "platform"    "https://dl.google.com/android/repository/platform-34-ext7_r02.zip" "platform-34.zip"
Write-Host "   SDK 就绪"
Write-Host "== 1/8 定位工具链 ==" -ForegroundColor Cyan
$javac = Find-Tool "javac.exe"    (Join-Path $sdk "jdk")
$keytool = Find-Tool "keytool.exe" (Join-Path $sdk "jdk")
$aapt2 = Find-Tool "aapt2.exe"    (Join-Path $sdk "build-tools")
$d8 = Find-Tool "d8.bat"          (Join-Path $sdk "build-tools")
$zipalign = Find-Tool "zipalign.exe" (Join-Path $sdk "build-tools")
$apksigner = Find-Tool "apksigner.bat" (Join-Path $sdk "build-tools")
$androidJar = Find-Tool "android.jar" (Join-Path $sdk "platform")
$javaBin = Split-Path $javac -Parent
# apksigner.bat 是包装脚本，内部要调用 java，因此必须设置 JAVA_HOME 与 PATH
$env:JAVA_HOME = Split-Path $javaBin -Parent
$env:PATH = "$javaBin;$env:PATH"
Write-Host "   JDK        $javaBin"
Write-Host "   build-tools $(Split-Path $aapt2 -Parent)"
Write-Host "   android.jar $androidJar"

Write-Host "== 2/8 同步网页资源到 assets ==" -ForegroundColor Cyan
$assets = Join-Path $here "assets\app"
if (Test-Path (Join-Path $here "assets")) { Remove-Item (Join-Path $here "assets") -Recurse -Force }
New-Item -ItemType Directory -Force -Path $assets | Out-Null
foreach ($item in @("index.html", "css", "js", "icons", "img", "tests", "manifest.webmanifest", "sw.js")) {
    $src = Join-Path $web $item
    if (Test-Path $src) { Copy-Item $src $assets -Recurse -Force }
}
# 清掉开发期残留与 Node 专用脚本，避免打进包里
Get-ChildItem $assets -Recurse -File -Include *.bak, *.cjs, *.map | Remove-Item -Force -ErrorAction SilentlyContinue
$n = (Get-ChildItem $assets -Recurse -File).Count
Write-Host "   已同步 $n 个文件"

Write-Host "== 3/8 aapt2 compile（编译资源） ==" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $build | Out-Null
$resZip = Join-Path $build "res.zip"
if (Test-Path $resZip) { Remove-Item $resZip -Force }
& $aapt2 compile --dir (Join-Path $here "res") -o $resZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile 失败" }

Write-Host "== 4/8 aapt2 link（生成资源 APK） ==" -ForegroundColor Cyan
$baseApk = Join-Path $build "base.apk"
$genDir = Join-Path $build "gen"
if (Test-Path $baseApk) { Remove-Item $baseApk -Force }
if (Test-Path $genDir) { Remove-Item $genDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $genDir | Out-Null
& $aapt2 link `
    -o $baseApk `
    -I $androidJar `
    --manifest (Join-Path $here "AndroidManifest.xml") `
    --java $genDir `
    --min-sdk-version 21 `
    --target-sdk-version 34 `
    --version-code 1 `
    --version-name "1.0" `
    $resZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 link 失败" }

Write-Host "== 5/8 javac 编译 Java 源码 ==" -ForegroundColor Cyan
$classesDir = Join-Path $build "classes"
if (Test-Path $classesDir) { Remove-Item $classesDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $classesDir | Out-Null
$sources = @()
$sources += (Get-ChildItem (Join-Path $here "src") -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$sources += (Get-ChildItem $genDir -Recurse -Filter *.java -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
Write-Host "   源文件 $($sources.Count) 个"
& $javac -source 8 -target 8 -encoding UTF-8 -nowarn `
    -bootclasspath $androidJar -classpath $androidJar `
    -d $classesDir $sources 2>&1 | Where-Object { $_ -notmatch "bootstrap class path|source value 8|target value 8|警告|warning" } | ForEach-Object { Write-Host "   $_" }
if ($LASTEXITCODE -ne 0) { throw "javac 失败" }

Write-Host "== 6/8 d8（转换为 dex） ==" -ForegroundColor Cyan
$dexDir = Join-Path $build "dex"
if (Test-Path $dexDir) { Remove-Item $dexDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dexDir | Out-Null
$classFiles = (Get-ChildItem $classesDir -Recurse -Filter *.class | ForEach-Object { $_.FullName })
# d8 是 .bat，改用 java -cp 直接调用其 jar，避免 cmd 参数转义问题
$d8Jar = Get-ChildItem (Split-Path $d8 -Parent) -Recurse -Filter "d8.jar" | Select-Object -First 1 -ExpandProperty FullName
if (-not $d8Jar) { throw "未找到 d8.jar" }
& (Join-Path $javaBin "java.exe") -cp $d8Jar com.android.tools.r8.D8 `
    --lib $androidJar --min-api 21 --output $dexDir $classFiles
if ($LASTEXITCODE -ne 0) { throw "d8 失败" }
$dex = Join-Path $dexDir "classes.dex"
if (-not (Test-Path $dex)) { throw "未生成 classes.dex" }
Write-Host ("   classes.dex {0:N0} KB" -f ((Get-Item $dex).Length/1KB))

Write-Host "== 7/8 打包 assets + classes.dex 并 zipalign ==" -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
$withDex = Join-Path $build "unsigned.apk"
Copy-Item $baseApk $withDex -Force
$zip = [System.IO.Compression.ZipFile]::Open($withDex, 'Update')
# 以正斜杠条目名写入 assets（见第 4 步注释：aapt2 在 Windows 上会用反斜杠）
$assetsRoot = Join-Path $here "assets"
$assetFiles = Get-ChildItem $assetsRoot -Recurse -File
foreach ($af in $assetFiles) {
    $rel = $af.FullName.Substring($assetsRoot.Length + 1).Replace('\', '/')
    $entryName = "assets/" + $rel
    $old = $zip.Entries | Where-Object { $_.FullName -eq $entryName }
    foreach ($o in $old) { $o.Delete() }
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $af.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal)
}
Write-Host "   已写入 $($assetFiles.Count) 个 assets 条目（正斜杠）"
$existing = $zip.Entries | Where-Object { $_.FullName -eq 'classes.dex' }
foreach ($e in $existing) { $e.Delete() }
[void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $dex, 'classes.dex', [System.IO.Compression.CompressionLevel]::Optimal)
$zip.Dispose()
$aligned = Join-Path $build "aligned.apk"
if (Test-Path $aligned) { Remove-Item $aligned -Force }
& $zipalign -p -f 4 $withDex $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign 失败" }

Write-Host "== 8/8 签名 ==" -ForegroundColor Cyan
$ks = Join-Path $build $(if ($Release) { "release.keystore" } else { "debug.keystore" })
$alias = if ($Release) { "campushub" } else { "androiddebugkey" }
$storePass = if ($Release) { "campushub2026" } else { "android" }
$keyPass = $storePass
if (-not (Test-Path $ks)) {
    Write-Host "   生成密钥库 $([System.IO.Path]::GetFileName($ks))"
    & $keytool -genkeypair -v -keystore $ks -alias $alias -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $storePass -keypass $keyPass `
        -dname "CN=CampusKit, OU=Student Project, O=CampusKit, L=Hangzhou, ST=Zhejiang, C=CN" 2>&1 | Out-Null
    if (-not (Test-Path $ks)) { throw "keytool 失败：密钥库未生成" }
}
if (-not $OutApk) { $OutApk = Join-Path $here "校园通.apk" }
if (Test-Path $OutApk) { Remove-Item $OutApk -Force }
& $apksigner sign --ks $ks --ks-key-alias $alias --ks-pass "pass:$storePass" --key-pass "pass:$keyPass" --out $OutApk $aligned 2>&1 | ForEach-Object { Write-Host "   $_" }
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $OutApk)) { throw "apksigner 失败" }

Write-Host ""
Write-Host "构建完成 → $OutApk" -ForegroundColor Green
Write-Host ("   大小 {0:N1} MB" -f ((Get-Item $OutApk).Length/1MB))
& $apksigner verify --print-certs $OutApk 2>&1 | Select-Object -First 6

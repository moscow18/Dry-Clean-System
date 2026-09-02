# =============================================================================
# build-win7.ps1 -- بناء نسخة Windows 7 (Electron 22.3.27)
# =============================================================================

$ErrorActionPreference = "Stop"
$ProjectPath = "d:\الترزي"
Set-Location $ProjectPath

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  بناء نسخة Windows 7 -- Electron 22.3.27  " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/5] نسخ احتياطي لـ package.json..." -ForegroundColor Yellow
Copy-Item "package.json"      "package.json.bak"      -Force
Copy-Item "package-lock.json" "package-lock.json.bak" -Force

try {
  Write-Host "[2/5] تعديل Electron => 22.3.27 (UTF-8 بدون BOM)..." -ForegroundColor Yellow
  $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
  $pkg.devDependencies.electron = "22.3.27"
  $pkg.build.directories.output = "dist-win7"

  # كتابة JSON بدون BOM (مهم جداً لـ electron-builder)
  $jsonContent = $pkg | ConvertTo-Json -Depth 20
  $utf8NoBOM   = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText("$ProjectPath\package.json", $jsonContent, $utf8NoBOM)

  Write-Host "[3/5] تثبيت Electron 22 بدون compile..." -ForegroundColor Yellow
  npm install --ignore-scripts --legacy-peer-deps
  if ($LASTEXITCODE -ne 0) { throw "npm install فشل" }

  Write-Host "[4/5] تحميل prebuilt binary لـ better-sqlite3 + Electron 22..." -ForegroundColor Yellow
  node node_modules\electron-builder\out\cli\cli.js install-app-deps
  # (تحذير متوقع -- طبيعي)

  Write-Host "[5/5] بناء EXE للـ Windows 7..." -ForegroundColor Yellow
  node node_modules\electron-builder\out\cli\cli.js
  if ($LASTEXITCODE -ne 0) { throw "electron-builder فشل" }

  Write-Host ""
  Write-Host "===============================================" -ForegroundColor Green
  Write-Host "  تم البناء! النسخة في: dist-win7/           " -ForegroundColor Green
  Write-Host "===============================================" -ForegroundColor Green

} catch {
  Write-Host ""
  Write-Host "خطأ في البناء: $_" -ForegroundColor Red
} finally {
  Write-Host ""
  Write-Host "استعادة package.json الأصلي (Electron 29)..." -ForegroundColor Yellow
  Move-Item "package.json.bak"      "package.json"      -Force
  Move-Item "package-lock.json.bak" "package-lock.json" -Force
  npm install --ignore-scripts --legacy-peer-deps | Out-Null
  node node_modules\electron-builder\out\cli\cli.js install-app-deps | Out-Null
  Write-Host "تم استعادة بيئة Electron 29" -ForegroundColor Green
}
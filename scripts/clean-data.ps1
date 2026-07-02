# 清理 care-buddy 应用所有本地数据
# 包括：Rust 端 settings.json、WebView2 端 localStorage、旧版迁移数据
#
# 使用：npm run clean
# 或直接：pwsh scripts/clean-data.ps1

$ErrorActionPreference = 'SilentlyContinue'

$paths = @(
  @{ Path = "$env:APPDATA\care-buddy"; Desc = "Rust settings (current)" }
  @{ Path = "$env:APPDATA\desk-reminder"; Desc = "Rust settings (legacy, migration source)" }
  @{ Path = "$env:LOCALAPPDATA\com.carebuddy.app"; Desc = "WebView2 cache + localStorage" }
)

Write-Host ""
Write-Host "=== care-buddy data cleanup ===" -ForegroundColor Cyan
Write-Host ""

$totalRemoved = 0
foreach ($entry in $paths) {
  $p = $entry.Path
  $desc = $entry.Desc
  if (Test-Path $p) {
    Remove-Item -Recurse -Force $p
    Write-Host "[removed] $p" -ForegroundColor Yellow
    Write-Host "           ($desc)"
    $totalRemoved++
  } else {
    Write-Host "[skip]    $p" -ForegroundColor DarkGray
    Write-Host "           ($desc) - not found"
  }
}

Write-Host ""
if ($totalRemoved -gt 0) {
  Write-Host "Done. Removed $totalRemoved path(s)." -ForegroundColor Green
  Write-Host "Restart dev: npm run tauri dev" -ForegroundColor Cyan
} else {
  Write-Host "Nothing to clean." -ForegroundColor DarkGray
}
Write-Host ""

# 从 git tag 推导版本号
# 输出格式：1.7.0（在 tag 上）或 1.7.0.5（tag 后 5 次提交）
$describe = git describe --tags --match 'v*' --always 2>$null
if (-not $describe) {
  Write-Output "0.0.0"
  exit 0
}
if ($describe -match '^v(\d+\.\d+\.\d+)$') {
  Write-Output $Matches[1]
} elseif ($describe -match '^v(\d+\.\d+\.\d+)-(\d+)-') {
  Write-Output "$($Matches[1]).$($Matches[2])"
} else {
  Write-Output $describe
}

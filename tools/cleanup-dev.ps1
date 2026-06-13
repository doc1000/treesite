# Kill leftover Node/Vite/preview processes and clear preview session.
# Run after stopping Studio (Ctrl+C on npm run studio / studio dev).
# WARNING: stops ALL node.exe on this machine — close other Node apps first.

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "Stopping Node/Vite processes..."

Get-Process node -ErrorAction SilentlyContinue |
    Stop-Process -Force

Remove-Item .treesite\preview-session.json -ErrorAction SilentlyContinue

Write-Host "Done. Ports 5175+ and preview 5180/5199 should be free."

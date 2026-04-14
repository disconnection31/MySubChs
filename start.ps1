#!/usr/bin/env pwsh
# start.ps1 - MySubChs 開発環境起動スクリプト
#
# 処理フロー:
#   1. Docker 動作確認
#   2. git pull origin main
#   3. 全サービス起動済みならスキップ
#   4. db + redis を先行起動してヘルスチェック待機
#   5. ホストから prisma migrate status で未適用マイグレーション確認
#   6. マイグレーションなし → 全サービス起動 / あり → 案内して終了

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# --- Phase 1: Docker 動作確認 ---
try {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
} catch {
    Write-Host "エラー: Docker が起動していません。Docker Desktop を起動してください。" -ForegroundColor Red
    exit 1
}

# --- Phase 2: git pull ---
Write-Host "最新コードを取得中 (git pull origin main)..." -ForegroundColor Cyan
$gitOutput = git pull origin main 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Write-Host "エラー: git pull に失敗しました。" -ForegroundColor Red
    Write-Host $gitOutput
    exit 1
}
Write-Host $gitOutput.Trim()

# --- Phase 3: 起動済みチェック ---
$runningRaw = docker compose ps --status running --format "{{.Service}}" 2>$null
$runningServices = @()
if ($runningRaw) {
    $runningServices = $runningRaw -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
$requiredServices = @("app", "worker", "db", "redis")
$allRunning = $true
foreach ($svc in $requiredServices) {
    if ($runningServices -notcontains $svc) {
        $allRunning = $false
        break
    }
}
if ($allRunning) {
    Write-Host "全サービスは既に起動中です。何もしません。" -ForegroundColor Green
    exit 0
}

# --- Phase 4: db + redis 起動 ---
Write-Host "db と redis を起動中..." -ForegroundColor Cyan
docker compose up -d db redis
if ($LASTEXITCODE -ne 0) {
    Write-Host "エラー: db/redis の起動に失敗しました。" -ForegroundColor Red
    exit 1
}

Write-Host "db の準備完了を待機中..." -ForegroundColor Cyan
$maxRetries = 30
$retryCount = 0
$dbReady = $false
while ($retryCount -lt $maxRetries) {
    $dbContainerId = (docker compose ps -q db 2>$null | Out-String).Trim()
    if ($dbContainerId) {
        $dbHealth = (docker inspect --format "{{.State.Health.Status}}" $dbContainerId 2>$null | Out-String).Trim()
        if ($dbHealth -eq "healthy") {
            $dbReady = $true
            break
        }
    }
    Start-Sleep -Seconds 2
    $retryCount++
}
if (-not $dbReady) {
    Write-Host "エラー: db がヘルスチェックに合格しませんでした（60秒タイムアウト）。" -ForegroundColor Red
    exit 1
}
Write-Host "db 準備完了。" -ForegroundColor Green

# --- Phase 5: マイグレーション確認 ---
Write-Host "マイグレーション状態を確認中..." -ForegroundColor Cyan

# .env の DATABASE_URL は Docker 内部ホスト名 (db) を指すため、ホストからは localhost に書き換える
$originalDbUrlSet = Test-Path Env:\DATABASE_URL
$originalDbUrl = if ($originalDbUrlSet) { $env:DATABASE_URL } else { $null }
$env:DATABASE_URL = "postgresql://mysubchs:mysubchs@localhost:5432/mysubchs"

$migrateOutput = ""
$migrateExitCode = 0
try {
    $migrateOutput = npx prisma migrate status 2>&1 | Out-String
    $migrateExitCode = $LASTEXITCODE
} finally {
    if ($originalDbUrlSet) {
        $env:DATABASE_URL = $originalDbUrl
    } else {
        Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
    }
}

# "Database schema is up to date" が出力に含まれていなければ未適用ありとみなす（prisma自体の失敗も安全側扱い）
$isUpToDate = ($migrateExitCode -eq 0) -and ($migrateOutput -match "Database schema is up to date")

# --- Phase 6: 起動 or マイグレーション案内 ---
if (-not $isUpToDate) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host " 未適用のマイグレーションがあります" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "--- prisma migrate status 出力 ---" -ForegroundColor DarkGray
    Write-Host $migrateOutput.Trim() -ForegroundColor DarkGray
    Write-Host "----------------------------------" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "app/worker の起動をスキップしました。" -ForegroundColor Yellow
    Write-Host "以下の手順でマイグレーションを実行してください:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. バックアップを取る:" -ForegroundColor White
    Write-Host "     ./scripts/backup.sh pre-migration" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. マイグレーションを適用する:" -ForegroundColor White
    Write-Host "     docker compose run --rm app npx prisma migrate deploy" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  3. 全サービスを起動する:" -ForegroundColor White
    Write-Host "     docker compose up -d" -ForegroundColor Gray
    Write-Host ""
    exit 0
}

Write-Host "マイグレーション: 最新です。" -ForegroundColor Green
Write-Host "全サービスを起動中..." -ForegroundColor Cyan
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "エラー: サービスの起動に失敗しました。" -ForegroundColor Red
    exit 1
}
Write-Host "全サービスが起動しました。" -ForegroundColor Green
Write-Host "アプリ: http://localhost:3000" -ForegroundColor Cyan

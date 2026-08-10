# local backup script for Windows environments
$BackupDir = ".\backups"
$DbName = "CHAM_CONG"
$DbUser = "postgres"
$DbPort = "5433" # Windows host port mapping
$DbHost = "localhost"
$RetentionDays = 7

if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = "$BackupDir\${DbName}_backup_$Timestamp.sql"

Write-Host "📅 Starting local DB backup to $BackupFile..."

# Run pg_dump
# Note: assumes pg_dump is in PATH (e.g. from local PostgreSQL install)
& pg_dump -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $BackupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup successfully created!"
    
    # Compress it using PowerShell Compress-Archive
    Compress-Archive -Path $BackupFile -DestinationPath "$BackupFile.zip" -Force
    Remove-Item $BackupFile
    Write-Host "📦 Compressed backup created: $BackupFile.zip"
} else {
    Write-Host "❌ Backup failed!" -ForegroundColor Red
}

# Cleanup older zip backups
Get-ChildItem -Path $BackupDir -Filter "${DbName}_backup_*.zip" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } | Remove-Item -Force
Write-Host "🧹 Cleanup of old backups completed."

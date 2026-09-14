$ErrorActionPreference = "Stop"
$mutex = New-Object System.Threading.Mutex($false, "Local\VoxAssistWhirlpoolRobotSerra")
$locked = $false
$workerDir = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $env:LOCALAPPDATA "VoxAssist\WhirlpoolRobot"
$credentialFile = Join-Path $dataDir "service-key.dpapi"
$logDir = Join-Path $dataDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("robot-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) {
    Add-Content -Path $logFile -Value ("[" + (Get-Date -Format o) + "] Execução ignorada: outra instância está ativa.")
    exit 0
  }
  if (-not (Test-Path $credentialFile)) { throw "Credencial protegida não encontrada. Execute npm.cmd run install-automation." }
  $secure = (Get-Content $credentialFile -Raw) | ConvertTo-SecureString
  $env:VOXASSIST_SUPABASE_SERVICE_ROLE_KEY = [Net.NetworkCredential]::new("", $secure).Password
  $env:WHIRLPOOL_BATCH_LIMIT = "3"
  Add-Content -Path $logFile -Value ("[" + (Get-Date -Format o) + "] Iniciando ciclo.")
  Push-Location $workerDir
  try {
    & node "$PSScriptRoot\run-import-batch.mjs" 2>&1 | Tee-Object -FilePath $logFile -Append
    if ($LASTEXITCODE -ne 0) { throw "Worker encerrou com código $LASTEXITCODE." }
  } finally { Pop-Location }
  Add-Content -Path $logFile -Value ("[" + (Get-Date -Format o) + "] Ciclo concluído.")
}
catch {
  Add-Content -Path $logFile -Value ("[" + (Get-Date -Format o) + "] ERRO: " + $_.Exception.Message)
  exit 1
}
finally {
  Remove-Item Env:\VOXASSIST_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:\WHIRLPOOL_BATCH_LIMIT -ErrorAction SilentlyContinue
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}

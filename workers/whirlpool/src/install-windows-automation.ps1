$ErrorActionPreference = "Stop"
$taskName = "VoxAssist - Robo Whirlpool Serra"
$workerDir = Split-Path $PSScriptRoot -Parent
$runner = Join-Path $PSScriptRoot "scheduled-runner.ps1"
$dataDir = Join-Path $env:LOCALAPPDATA "VoxAssist\WhirlpoolRobot"
$credentialFile = Join-Path $dataDir "service-key.dpapi"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

Write-Host "CONFIGURAÇÃO ÚNICA DO ROBÔ WHIRLPOOL"
$segredo = Read-Host "Cole a NOVA Secret key do Supabase" -AsSecureString
$plain = [Net.NetworkCredential]::new("", $segredo).Password
if ([string]::IsNullOrWhiteSpace($plain)) { throw "A chave ficou vazia." }
$segredo | ConvertFrom-SecureString | Set-Content -Path $credentialFile -Encoding UTF8
$plain = $null
$segredo = $null

$actionArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File "' + $runner + '"'
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs -WorkingDirectory $workerDir
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 15)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "ROBÔ AUTOMÁTICO INSTALADO E INICIADO"
Write-Host "Ele executará sozinho a cada 15 minutos enquanto este usuário estiver conectado."
Write-Host ("Logs: " + (Join-Path $dataDir "logs"))

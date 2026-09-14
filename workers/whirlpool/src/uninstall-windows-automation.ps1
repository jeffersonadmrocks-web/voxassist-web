$taskName = "VoxAssist - Robo Whirlpool Serra"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Agendamento automático removido. A credencial protegida foi preservada."

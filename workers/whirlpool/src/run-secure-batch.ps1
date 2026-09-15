$ErrorActionPreference = "Stop"
Write-Host "LOTE AUTOMÁTICO CONTROLADO: máximo de 3 OS ativas."
$segredo = Read-Host "Cole a Secret key do Supabase" -AsSecureString
try {
  $env:VOXASSIST_SUPABASE_SERVICE_ROLE_KEY = [Net.NetworkCredential]::new("", $segredo).Password
  $env:WHIRLPOOL_BATCH_LIMIT = "3"
  if ([string]::IsNullOrWhiteSpace($env:VOXASSIST_SUPABASE_SERVICE_ROLE_KEY)) { throw "A chave ficou vazia." }
  & node "$PSScriptRoot\run-import-batch.mjs"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Remove-Item Env:\VOXASSIST_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:\WHIRLPOOL_BATCH_LIMIT -ErrorAction SilentlyContinue
  $segredo = $null
}

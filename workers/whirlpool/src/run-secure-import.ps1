$ErrorActionPreference = "Stop"
$confirmacao = Read-Host "Digite 7015718045 para confirmar a importação real desta OS"
if ($confirmacao -ne "7015718045") { throw "Confirmação incorreta. Nada foi importado." }
$segredo = Read-Host "Cole a Secret key do Supabase" -AsSecureString
try {
  $env:VOXASSIST_SUPABASE_SERVICE_ROLE_KEY = [Net.NetworkCredential]::new("", $segredo).Password
  if ([string]::IsNullOrWhiteSpace($env:VOXASSIST_SUPABASE_SERVICE_ROLE_KEY)) { throw "A chave ficou vazia." }
  & node "$PSScriptRoot\import-pdf-sample.mjs" $confirmacao
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Remove-Item Env:\VOXASSIST_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  $segredo = $null
}

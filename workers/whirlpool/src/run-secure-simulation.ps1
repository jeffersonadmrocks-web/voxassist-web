$ErrorActionPreference = "Stop"
$segredo = Read-Host "Cole a Secret key do Supabase" -AsSecureString
try {
  $env:VOXASSIST_SUPABASE_SERVICE_ROLE_KEY = [Net.NetworkCredential]::new("", $segredo).Password
  if ([string]::IsNullOrWhiteSpace($env:VOXASSIST_SUPABASE_SERVICE_ROLE_KEY)) {
    throw "A chave informada ficou vazia."
  }
  & node "$PSScriptRoot\simulate-pdf-import.mjs"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
  Remove-Item Env:\VOXASSIST_SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  $segredo = $null
}

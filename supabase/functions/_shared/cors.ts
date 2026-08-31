// CORS compartilhado por toda edge function chamada direto do navegador
// (o frontend fica em voxassist-web.vercel.app, as functions em
// *.supabase.co — sempre cross-origin). Extraído em 2026-08-28 do que
// foi corrigido/comprovado em digisac-test (achado real: sem
// Access-Control-Allow-Origin em toda resposta — incluindo o preflight
// OPTIONS e cada caso de erro — o navegador bloqueia o fetch antes dele
// sair, mesmo com autenticação/CORS corretos no resto). Allowlist
// explícita, nunca "*".
export const ALLOWED_ORIGINS = ["https://voxassist-web.vercel.app"];

export function buildCorsHeaders(origin: string | null, allowedOrigins: string[] = ALLOWED_ORIGINS): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ARTIFACT_DIR } from "./config.mjs";

const supabaseUrl =
  process.env.VOXASSIST_SUPABASE_URL || "https://dgasmtvpgifceyqufcfg.supabase.co";
const serviceKey = process.env.VOXASSIST_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  throw new Error(
    "Defina VOXASSIST_SUPABASE_SERVICE_ROLE_KEY somente neste PowerShell. Não envie a chave aqui.",
  );
}
const url = new URL(supabaseUrl);
if (url.protocol !== "https:" || url.hostname !== "dgasmtvpgifceyqufcfg.supabase.co") {
  throw new Error("Projeto Supabase diferente do VoxAssist autorizado.");
}

const catalogPath = path.join(ARTIFACT_DIR, "catalogo-whirlpool-serra.json");
const payload = JSON.parse(await readFile(catalogPath, "utf8"));
if (payload.filial !== "SERRA" || !Array.isArray(payload.items) || payload.items.length === 0) {
  throw new Error("Lote local inválido ou vazio.");
}

console.log("Enviando catálogo sanitizado. Nenhum cliente, equipamento ou OS será criado...");
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/whirlpool_ingest_catalog`, {
  method: "POST",
  headers: {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    p_filial: payload.filial,
    p_items: payload.items,
    p_full_scan: Boolean(payload.fullScan),
    p_limit_reached: Boolean(payload.limitReached),
  }),
});

const text = await response.text();
if (!response.ok) {
  throw new Error(`Supabase recusou o lote (HTTP ${response.status}): ${text.slice(0, 500)}`);
}
const result = JSON.parse(text);
console.log("CATÁLOGO ENVIADO COM SUCESSO");
console.log(JSON.stringify(result));
console.log("A fila contém referências; nenhuma OS completa foi criada.");

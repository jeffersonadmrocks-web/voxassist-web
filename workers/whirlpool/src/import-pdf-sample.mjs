import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ARTIFACT_DIR } from "./config.mjs";

const expected = String(process.argv[2] || "").replace(/\D/g, "");
if (expected !== "7015718045") {
  throw new Error("Homologação bloqueada: informe exatamente a OS 7015718045.");
}
const supabaseUrl = process.env.VOXASSIST_SUPABASE_URL || "https://dgasmtvpgifceyqufcfg.supabase.co";
const serviceKey = process.env.VOXASSIST_SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error("Chave temporária não configurada.");
const u = new URL(supabaseUrl);
if (u.hostname !== "dgasmtvpgifceyqufcfg.supabase.co") throw new Error("Projeto Supabase não autorizado.");

const parsedPath = path.join(ARTIFACT_DIR, "parsed", `${expected}.json`);
const pdfPath = path.join(ARTIFACT_DIR, "pdfs", `${expected}.pdf`);
const envelope = JSON.parse(await readFile(parsedPath, "utf8"));
const payload = envelope.parsed || envelope;
if (String(payload.externalOrderId || "").replace(/\D/g, "") !== expected) throw new Error("JSON e OS de homologação não correspondem.");
const pdf = await readFile(pdfPath);
if (pdf.length < 4096 || pdf.subarray(0, 5).toString() !== "%PDF-" || !pdf.subarray(-2048).toString().includes("%%EOF")) {
  throw new Error("PDF inválido, vazio ou incompleto.");
}
const hash = createHash("sha256").update(pdf).digest("hex").slice(0, 16);
const storagePath = `whirlpool/${expected}/${hash}.pdf`;
const authHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };
let uploaded = false;

const objectUrl = new URL(`/storage/v1/object/voxassist-files/${storagePath.split("/").map(encodeURIComponent).join("/")}`, supabaseUrl);
const upload = await fetch(objectUrl, {
  method: "POST",
  headers: { ...authHeaders, "content-type": "application/pdf", "x-upsert": "false" },
  body: pdf,
});
if (upload.ok) uploaded = true;
else {
  const error = await upload.text();
  if (upload.status !== 400 && upload.status !== 409) throw new Error(`Falha ao armazenar PDF (HTTP ${upload.status}): ${error.slice(0, 200)}`);
}

try {
  const rpc = await fetch(new URL("/rest/v1/rpc/whirlpool_import_pdf", supabaseUrl), {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ p_filial: "SERRA", p_payload: payload, p_storage_path: storagePath }),
  });
  const text = await rpc.text();
  if (!rpc.ok) throw new Error(`Importação recusada (HTTP ${rpc.status}): ${text.slice(0, 500)}`);
  const result = JSON.parse(text);
  console.log("HOMOLOGAÇÃO IMPORTADA COM SUCESSO");
  console.log(JSON.stringify(result));
} catch (error) {
  if (uploaded) await fetch(objectUrl, { method: "DELETE", headers: authHeaders }).catch(() => {});
  throw error;
}

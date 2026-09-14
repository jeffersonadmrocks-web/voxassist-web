import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ARTIFACT_DIR } from "./config.mjs";

const ACTIVE_STATUSES = new Set(["Agendar", "Em processo AT", "Agendado"]);

function parseDate(value) {
  const match = String(value || "").match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

await mkdir(ARTIFACT_DIR, { recursive: true });
const files = (await readdir(ARTIFACT_DIR))
  .filter((name) => /^resultado-os-.*\.json$/i.test(name))
  .sort()
  .reverse();

if (!files.length) throw new Error("Nenhum resultado-os-*.json encontrado em .artifacts.");

const inputPath = path.join(ARTIFACT_DIR, files[0]);
const scan = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(scan.orders)) throw new Error("Arquivo de levantamento inválido.");

const cutoff = scan.cancellationCutoff;
if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff || "")) {
  throw new Error("O levantamento não possui cancellationCutoff válido.");
}

const seen = new Set();
const items = scan.orders.map((row) => {
  if (!/^7015\d{6}$/.test(row.externalOrderId || "")) {
    throw new Error(`Número externo inválido: ${row.externalOrderId || "(vazio)"}`);
  }
  if (seen.has(row.externalOrderId)) throw new Error(`OS duplicada: ${row.externalOrderId}`);
  seen.add(row.externalOrderId);

  const entryDate = parseDate(row.entryDate);
  const recentCancelled =
    row.serviceStatus === "Cancelado" && entryDate && entryDate >= cutoff;
  const active = ACTIVE_STATUSES.has(row.serviceStatus);

  return {
    externalOrderId: row.externalOrderId,
    serviceStatus: row.serviceStatus,
    entryDate,
    disposition: active
      ? "IMPORTAR_ATIVA"
      : recentCancelled
        ? "REVISAR_CANCELADA_30_DIAS"
        : "HISTORICO_EXTERNO",
    queueReason: active
      ? "ATIVA_NOVA"
      : recentCancelled
        ? "CANCELADA_30_DIAS"
        : null,
  };
});

const counts = items.reduce((acc, item) => {
  acc[item.disposition] = (acc[item.disposition] || 0) + 1;
  return acc;
}, {});

const payload = {
  version: 1,
  filial: "SERRA",
  sourceFile: files[0],
  preparedAt: new Date().toISOString(),
  fullScan: true,
  cancellationCutoff: cutoff,
  counts,
  total: items.length,
  items,
};

const outputPath = path.join(ARTIFACT_DIR, "catalogo-whirlpool-serra.json");
await writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

console.log("LOTE LOCAL PREPARADO — nenhum dado foi enviado ao Supabase.");
console.log(JSON.stringify({ total: payload.total, ...counts }));
console.log(`Arquivo: ${outputPath}`);

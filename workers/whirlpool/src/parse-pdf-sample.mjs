import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ARTIFACT_DIR } from "./config.mjs";
import { extractPdfText, parseWhirlpoolPdf } from "./pdf-parser.mjs";

const pdfDir = path.join(ARTIFACT_DIR, "pdfs");
const parsedDir = path.join(ARTIFACT_DIR, "parsed");
await mkdir(parsedDir, { recursive: true });

const files = (await readdir(pdfDir)).filter((name) => /\.pdf$/i.test(name)).sort().reverse();
if (!files.length) throw new Error("Nenhum PDF capturado em .artifacts/pdfs.");

const pdfPath = path.join(pdfDir, files[0]);
const text = await extractPdfText(await readFile(pdfPath));
const parsed = parseWhirlpoolPdf(text);
const expectedId = path.basename(files[0], path.extname(files[0]));

if (!parsed.externalOrderId) throw new Error("Número da OS não foi reconhecido no PDF.");
if (parsed.externalOrderId !== expectedId) {
  throw new Error(`PDF pertence à OS ${parsed.externalOrderId}, mas era esperada ${expectedId}.`);
}

const required = {
  externalOrderId: Boolean(parsed.externalOrderId),
  manufacturer: ["BRASTEMP", "CONSUL"].includes(parsed.manufacturer),
  entryDate: Boolean(parsed.entryDate),
  customerName: Boolean(parsed.customer.name),
  customerDocument: Boolean(parsed.customer.document),
  customerPhone: Boolean(parsed.customer.phone),
  customerAddress: Boolean(parsed.customer.address),
  equipmentProduct: Boolean(parsed.equipment.productLine),
  reportedDefect: Boolean(parsed.service.reportedDefect || parsed.service.complaint),
};
const missing = Object.entries(required).filter(([, ok]) => !ok).map(([field]) => field);
const outputPath = path.join(parsedDir, `${parsed.externalOrderId}.json`);
await writeFile(outputPath, JSON.stringify({
  version: 1,
  sourcePdf: files[0],
  parsedAt: new Date().toISOString(),
  parsed,
}, null, 2), "utf8");

console.log("PDF LIDO — nenhum dado foi enviado ao VoxAssist.");
console.log(JSON.stringify({
  externalOrderId: parsed.externalOrderId,
  manufacturer: parsed.manufacturer,
  entryDate: parsed.entryDate,
  hasAppointment: Boolean(parsed.appointmentDate),
  appointmentPeriod: parsed.appointmentPeriod || null,
  requiredFieldsFound: Object.values(required).filter(Boolean).length,
  requiredFieldsTotal: Object.keys(required).length,
  missing,
}));
console.log(`Dados completos mantidos localmente em: ${outputPath}`);

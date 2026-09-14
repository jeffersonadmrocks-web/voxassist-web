import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ARTIFACT_DIR, PORTAL_URL, PROFILE_DIR, assertWhirlpoolUrl } from "./config.mjs";

assertWhirlpoolUrl(PORTAL_URL);
const catalogPath = path.join(ARTIFACT_DIR, "catalogo-whirlpool-serra.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const sample = catalog.items.find(
  (item) => item.disposition === "IMPORTAR_ATIVA" && item.serviceStatus === "Agendar",
) || catalog.items.find((item) => item.disposition === "IMPORTAR_ATIVA");
if (!sample) throw new Error("Nenhuma OS ativa disponível no lote local.");

const pdfDir = path.join(ARTIFACT_DIR, "pdfs");
await mkdir(pdfDir, { recursive: true });
const pdfPath = path.join(pdfDir, `${sample.externalOrderId}.pdf`);

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chromium",
  headless: false,
  viewport: null,
  acceptDownloads: true,
  args: ["--start-maximized"],
});
const rl = readline.createInterface({ input, output });
let captured = false;

async function savePdf(bytes) {
  if (captured || !bytes?.length) return;
  await writeFile(pdfPath, bytes);
  captured = true;
}

context.on("response", async (response) => {
  try {
    const contentType = (response.headers()["content-type"] || "").toLowerCase();
    if (contentType.includes("application/pdf") || response.url().includes("/crm/crm_pdf_print")) {
      await savePdf(await response.body());
    }
  } catch {
    // O evento download abaixo cobre navegadores que não liberam response.body().
  }
});

function attachDownloads(page) {
  page.on("download", async (download) => {
    try {
      if (!captured) {
        await download.saveAs(pdfPath);
        captured = true;
      }
    } catch {
      // A validação final informará se o PDF não foi capturado.
    }
  });
}
for (const page of context.pages()) attachDownloads(page);
context.on("page", attachDownloads);

async function inspectAndMaybeOpen(frame, externalOrderId) {
  return frame.evaluate((targetId) => {
    const clean = (value = "") => value.replace(/\s+/g, " ").trim();
    const tables = [...document.querySelectorAll('table[id$="_ResultTable_TableHeader"]')];
    for (const table of tables) {
      const header = table.tHead?.rows?.[0];
      if (!header) continue;
      const headers = [...header.cells];
      const osIndex = headers.findIndex((cell) => /-OBJECT_ID-TH$/i.test(cell.id));
      if (osIndex < 0) continue;
      for (const tbody of table.tBodies) {
        for (const row of tbody.rows) {
          const cell = row.cells[osIndex];
          if (!cell || clean(cell.innerText || cell.textContent) !== targetId) continue;
          const action = cell.querySelector("a,button");
          if (!action) return "FOUND_NO_ACTION";
          action.click();
          return "OPENED";
        }
      }
    }
    return "NOT_FOUND";
  }, externalOrderId);
}

async function clickNext(frame) {
  return frame.evaluate(() => {
    const norm = (value = "") =>
      value.replace(/\s+/g, " ").trim().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const target = [...document.querySelectorAll("a,button")].find((element) => {
      const style = getComputedStyle(element);
      return norm(element.innerText || element.textContent) === "avancar" &&
        style.display !== "none" && style.visibility !== "hidden" &&
        element.getAttribute("aria-disabled") !== "true";
    });
    if (!target) return false;
    target.click();
    return true;
  });
}

try {
  let page = context.pages()[0] || (await context.newPage());
  if (!page.url() || page.url() === "about:blank") await page.goto(PORTAL_URL);

  console.log("\nHOMOLOGAÇÃO PDF — SOMENTE LEITURA");
  console.log(`OS selecionada: ${sample.externalOrderId} (${sample.serviceStatus})`);
  console.log("Abra a busca, informe 1000 resultados, clique em Procurar e aguarde.");
  await rl.question("Com a primeira página visível, pressione somente ENTER... ");

  page = context.pages().at(-1) || page;
  let opened = false;
  for (let pageNumber = 1; pageNumber <= 100 && !opened; pageNumber += 1) {
    for (const frame of page.frames()) {
      try {
        const result = await inspectAndMaybeOpen(frame, sample.externalOrderId);
        if (result === "FOUND_NO_ACTION") throw new Error("OS encontrada sem link de abertura.");
        if (result === "OPENED") {
          opened = true;
          break;
        }
      } catch (error) {
        if (error.message.includes("sem link")) throw error;
      }
    }
    if (opened) break;
    let advanced = false;
    for (const frame of page.frames()) {
      try {
        if (await clickNext(frame)) {
          advanced = true;
          break;
        }
      } catch {
        // Ignora frames transitórios.
      }
    }
    if (!advanced) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (!opened) throw new Error(`OS ${sample.externalOrderId} não foi localizada nas 100 páginas.`);
  console.log("\nOS aberta. Aguarde a tela terminar de carregar.");
  console.log("No portal, use Visualização e gere o PDF da OS.");
  await rl.question("Quando o PDF estiver visível ou baixado, pressione somente ENTER... ");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  if (!captured) {
    throw new Error("O PDF não foi capturado. Não prossiga; repetiremos o mapeamento da Visualização.");
  }
  console.log(`PDF ORIGINAL CAPTURADO: ${pdfPath}`);
  console.log("Feche a visualização, volte para a OS e clique em Encerrar.");
  await rl.question("Quando estiver novamente na tela inicial do CRM, pressione somente ENTER... ");
} finally {
  rl.close();
  await context.close();
}

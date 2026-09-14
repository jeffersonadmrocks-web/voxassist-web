import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ARTIFACT_DIR, PORTAL_URL, PROFILE_DIR, assertWhirlpoolUrl } from "./config.mjs";

assertWhirlpoolUrl(PORTAL_URL);
await mkdir(ARTIFACT_DIR, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chromium",
  headless: false,
  viewport: null,
  args: ["--start-maximized"],
});
const rl = readline.createInterface({ input, output });

async function readFrame(frame) {
  return frame.evaluate(() => {
    const clean = (value = "") => value.replace(/\s+/g, " ").trim();
    const norm = (value = "") =>
      clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const directCells = (tr) =>
      [...tr.children].filter((element) => element.tagName === "TH" || element.tagName === "TD");
    const cellValue = (cell) => {
      const visible = clean(cell.innerText);
      if (visible) return visible;
      const text = clean(cell.textContent);
      if (text) return text;
      const control = cell.querySelector("input:not([type=hidden]), select, textarea");
      if (control && clean(control.value)) return clean(control.value);
      const titled = cell.querySelector("[title]");
      return titled ? clean(titled.getAttribute("title")) : "";
    };

    for (const table of document.querySelectorAll('table[id$="_ResultTable_TableHeader"]')) {
      const headerRow = table.tHead?.rows?.[0];
      if (!headerRow) continue;
      const headers = directCells(headerRow);
      const fieldName = (cell) => {
        const match = cell.id.match(/_col_\d+-([A-Z0-9_]+)-TH$/i);
        return match ? match[1].toUpperCase() : "";
      };
      const osIndex = headers.findIndex((cell) => fieldName(cell) === "OBJECT_ID");
      const typeIndex = headers.findIndex((cell) => fieldName(cell) === "PROCESS_TYPE_TXT");
      const statusIndex = headers.findIndex((cell) => fieldName(cell) === "ZZSTATUS_ITEM_SERV");
      if (osIndex < 0 || typeIndex < 0 || statusIndex < 0) continue;

      const rows = [...table.tBodies].flatMap((tbody) =>
        [...tbody.rows].flatMap((tr) => {
          const cells = directCells(tr);
          if (cells.length !== headers.length) return [];
          const externalOrderId = cellValue(cells[osIndex]);
          if (!/^\d{10}$/.test(externalOrderId)) return [];
          return [{
            externalOrderId,
            processType: cellValue(cells[typeIndex]),
            processTypeNormalized: norm(cellValue(cells[typeIndex])),
            serviceStatus: cellValue(cells[statusIndex]),
          }];
        }),
      );
      if (rows.length) return rows;
    }
    return [];
  });
}

async function findResultFrame(page) {
  for (const frame of page.frames()) {
    try {
      const rows = await readFrame(frame);
      if (rows.length) return { frame, rows };
    } catch {
      // Ignora frames transitórios.
    }
  }
  return null;
}

async function clickNext(frame) {
  return frame.evaluate(() => {
    const clean = (value = "") => value.replace(/\s+/g, " ").trim();
    const norm = (value = "") =>
      clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const candidates = [...document.querySelectorAll("a,button")].filter(
      (element) => norm(element.innerText || element.textContent) === "avancar",
    );
    const target = candidates.find((element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" &&
        element.getAttribute("aria-disabled") !== "true" &&
        !norm(element.className).includes("disabled");
    });
    if (!target) return false;
    target.click();
    return true;
  });
}

function fingerprint(rows) {
  return rows.map((row) => row.externalOrderId).join("|");
}

try {
  let page = context.pages()[0] || (await context.newPage());
  if (!page.url() || page.url() === "about:blank") await page.goto(PORTAL_URL);

  console.log("\nMODO SOMENTE LEITURA — nenhuma OS será aberta ou alterada.");
  console.log("No portal, abra a busca, clique em Procurar e aguarde a lista carregar.");
  await rl.question("Com a primeira página da lista visível, pressione somente ENTER... ");

  page = context.pages().at(-1) || page;
  const collected = [];
  const observedTypes = new Map();
  let ignoredAutEspecial = 0;
  let unclassifiedRows = 0;
  let scannedPages = 0;

  for (let pageNumber = 1; pageNumber <= 100; pageNumber += 1) {
    const result = await findResultFrame(page);
    if (!result) break;
    scannedPages += 1;

    for (const row of result.rows) {
      const observedType = row.processType || "(vazio)";
      observedTypes.set(observedType, (observedTypes.get(observedType) || 0) + 1);
      if (row.processTypeNormalized.includes("aut especial")) {
        ignoredAutEspecial += 1;
        continue;
      }
      if (row.processTypeNormalized.includes("br ordem de s")) {
        collected.push({
          externalOrderId: row.externalOrderId,
          serviceStatus: row.serviceStatus,
        });
        continue;
      }
      unclassifiedRows += 1;
    }

    const before = fingerprint(result.rows);
    if (!(await clickNext(result.frame))) break;

    let changed = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const next = await findResultFrame(page);
      if (next && fingerprint(next.rows) !== before) {
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  const orders = [...new Map(collected.map((row) => [row.externalOrderId, row])).values()];
  const summary = {
    mode: "READ_ONLY",
    scannedPages,
    ignoredAutEspecial,
    unclassifiedRows,
    observedTypes: Object.fromEntries(observedTypes),
    count: orders.length,
    orders,
  };

  const fileName = `resultado-os-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const outputPath = path.join(ARTIFACT_DIR, fileName);
  await writeFile(outputPath, JSON.stringify(summary, null, 2), "utf8");

  const compactSummary = {
    mode: summary.mode,
    scannedPages: summary.scannedPages,
    ignoredAutEspecial: summary.ignoredAutEspecial,
    unclassifiedRows: summary.unclassifiedRows,
    observedTypes: summary.observedTypes,
    count: summary.count,
  };

  console.log("\nRESUMO SANITIZADO:");
  console.log(JSON.stringify(compactSummary));
  console.log(`\nResultado completo salvo em: ${outputPath}`);
  console.log("Anexe esse arquivo aqui; não é necessário copiar a lista inteira.");
  await rl.question("\nPressione somente ENTER para fechar o navegador... ");
} finally {
  rl.close();
  await context.close();
}

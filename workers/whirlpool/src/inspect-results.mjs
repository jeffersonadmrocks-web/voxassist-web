import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
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

function normalize(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function readFrame(frame) {
  return frame.evaluate(() => {
    const clean = (value = "") => value.replace(/\s+/g, " ").trim();
    const norm = (value = "") =>
      clean(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const directCells = (tr) =>
      [...tr.children].filter((element) => element.tagName === "TH" || element.tagName === "TD");

    const rows = [];
    for (const table of document.querySelectorAll("table")) {
      const trs = [...table.querySelectorAll("tr")];
      const headerRow = trs.find((tr) => {
        const headers = directCells(tr).map((cell) => norm(cell.innerText));
        return (
          headers.some((text) => text.includes("id ordem de servico")) &&
          headers.some((text) => text === "status do servico" || text.startsWith("status do servico"))
        );
      });
      if (!headerRow) continue;

      const headers = directCells(headerRow).map((cell) => norm(cell.innerText));
      const osIndex = headers.findIndex((text) => text.includes("id ordem de servico"));
      const statusIndex = headers.findIndex(
        (text) => text === "status do servico" || text.startsWith("status do servico"),
      );
      if (osIndex < 0 || statusIndex < 0) continue;

      const group = headerRow.parentElement;
      const candidateRows = group ? [...group.children].filter((element) => element.tagName === "TR") : trs;
      for (const tr of candidateRows.slice(candidateRows.indexOf(headerRow) + 1)) {
        const cells = directCells(tr);
        if (cells.length !== headers.length) continue;
        const osText = clean(cells[osIndex].innerText);
        const osMatch = osText.match(/^\D*(\d{10})\D*$/);
        if (!osMatch) continue;
        rows.push({
          externalOrderId: osMatch[1],
          serviceStatus: clean(cells[statusIndex].innerText),
        });
      }
    }
    return rows;
  });
}

try {
  let page = context.pages()[0] || (await context.newPage());
  if (!page.url() || page.url() === "about:blank") await page.goto(PORTAL_URL);

  console.log("\nMODO SOMENTE LEITURA — nenhuma OS será aberta ou alterada.");
  console.log("No portal, abra a busca, clique em Procurar e aguarde a lista carregar.");
  await rl.question("Com a primeira página da lista visível, pressione ENTER... ");

  page = context.pages().at(-1) || page;
  const found = [];
  for (const frame of page.frames()) {
    try {
      found.push(...(await readFrame(frame)));
    } catch {
      // Frames de outra origem ou transitórios são ignorados.
    }
  }

  const unique = [...new Map(found.map((row) => [row.externalOrderId, row])).values()];
  unique.sort((a, b) => a.externalOrderId.localeCompare(b.externalOrderId));

  const summary = {
    mode: "READ_ONLY",
    page: 1,
    count: unique.length,
    orders: unique,
  };

  console.log("\nRESULTADO SANITIZADO:");
  console.log(JSON.stringify(summary));
  console.log("\nCopie somente a linha JSON acima e envie aqui.");
  if (!unique.length) {
    console.log("Nenhuma OS foi reconhecida. Não prossiga para paginação; usaremos um mapa da grade.");
  }
  await rl.question("\nPressione ENTER para fechar o navegador... ");
} finally {
  rl.close();
  await context.close();
}

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

    const rows = [];
    for (const table of document.querySelectorAll("table")) {
      const trs = [...table.querySelectorAll("tr")];
      const headerRow = trs.find((tr) => norm(tr.innerText).includes("status do servico"));
      if (!headerRow) continue;

      const headers = [...headerRow.querySelectorAll("th,td")].map((cell) => norm(cell.innerText));
      const osIndex = headers.findIndex((text) => text.includes("id ordem de servico"));
      const statusIndex = headers.findIndex((text) => text.includes("status do servico"));
      if (osIndex < 0 || statusIndex < 0) continue;

      for (const tr of trs.slice(trs.indexOf(headerRow) + 1)) {
        const cells = [...tr.querySelectorAll(":scope > th, :scope > td")];
        if (cells.length <= Math.max(osIndex, statusIndex)) continue;
        const osMatch = clean(cells[osIndex].innerText).match(/\b\d{10}\b/);
        if (!osMatch) continue;
        rows.push({
          externalOrderId: osMatch[0],
          serviceStatus: clean(cells[statusIndex].innerText) || "ABERTO",
        });
      }
    }

    if (rows.length) return rows;

    // Fallback para tabelas SAP sem cabeçalho semântico no mesmo elemento.
    for (const link of document.querySelectorAll("a")) {
      const externalOrderId = clean(link.textContent);
      if (!/^\d{10}$/.test(externalOrderId)) continue;
      const tr = link.closest("tr");
      if (!tr) continue;
      const text = clean(tr.innerText);
      const match = text.match(/\b(Cancelado|Liquidado)\b/i);
      rows.push({
        externalOrderId,
        serviceStatus: match ? match[1] : "ABERTO",
      });
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

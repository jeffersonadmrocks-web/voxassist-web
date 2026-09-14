import { chromium } from "playwright";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PORTAL_URL, PROFILE_DIR, assertWhirlpoolUrl } from "./config.mjs";

assertWhirlpoolUrl(PORTAL_URL);

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chromium",
  headless: false,
  viewport: null,
  args: ["--start-maximized"],
});
const rl = readline.createInterface({ input, output });

async function inspectFrame(frame, frameIndex) {
  return frame.evaluate((index) => {
    const clean = (value = "") => value.replace(/\s+/g, " ").trim();
    const norm = (value = "") =>
      clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const safeElement = (element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      className: typeof element.className === "string" ? element.className : "",
      role: element.getAttribute("role") || "",
      childTags: [...element.children].slice(0, 20).map((child) => child.tagName.toLowerCase()),
      childCount: element.children.length,
    });

    const matches = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const ownText = [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join(" ");
        const value = norm(ownText);
        return value.includes("id ordem de servico") || value === "status do servico";
      })
      .slice(0, 20)
      .map((element) => {
        const chain = [];
        let current = element;
        for (let level = 0; current && level < 9; level += 1, current = current.parentElement) {
          chain.push(safeElement(current));
        }
        return {
          header: norm(
            [...element.childNodes]
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent)
              .join(" "),
          ),
          chain,
        };
      });

    const resultTableElements = [...document.querySelectorAll('[id*="ResultTable"], [id*="resultTable"]')]
      .slice(0, 30)
      .map(safeElement);

    return { frameIndex: index, matches, resultTableElements };
  }, frameIndex);
}

try {
  let page = context.pages()[0] || (await context.newPage());
  if (!page.url() || page.url() === "about:blank") await page.goto(PORTAL_URL);

  console.log("\nDIAGNÓSTICO SANITIZADO DA GRADE — nenhuma OS será lida ou alterada.");
  console.log("Abra a busca, clique em Procurar e aguarde a grade carregar.");
  await rl.question("Com a primeira página visível, pressione somente ENTER... ");

  page = context.pages().at(-1) || page;
  const frames = [];
  for (const [index, frame] of page.frames().entries()) {
    try {
      const result = await inspectFrame(frame, index);
      if (result.matches.length || result.resultTableElements.length) frames.push(result);
    } catch {
      // Ignora frames transitórios ou inacessíveis.
    }
  }

  console.log("\nESTRUTURA SANITIZADA:");
  console.log(JSON.stringify({ version: 1, frames }));
  console.log("\nCopie somente a linha JSON acima e envie aqui.");
  await rl.question("\nPressione somente ENTER para fechar o navegador... ");
} finally {
  rl.close();
  await context.close();
}

import fs from "node:fs/promises";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";
import { PORTAL_URL, PROFILE_DIR, ARTIFACT_DIR, assertWhirlpoolUrl } from "./config.mjs";

assertWhirlpoolUrl(PORTAL_URL);
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chromium",
  headless: false,
  viewport: null,
  args: ["--start-maximized"],
});

const page = context.pages()[0] || (await context.newPage());
await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });

const prompt = readline.createInterface({ input, output });
console.log("\nNavegue manualmente até a tela que deseja mapear.");
console.log("A captura não guarda valores dos campos, linhas das OS, cookies ou credenciais.\n");
const answer = await prompt.question(
  "Digite agora o nome curto da tela (ex.: busca-os ou detalhe-os) e pressione ENTER: "
);
const mapName =
  answer.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "pagina";
await prompt.question(
  `Tela selecionada: ${mapName}. Com a tela pronta no portal, volte aqui e pressione ENTER...`
);
prompt.close();

assertWhirlpoolUrl(page.url());

const frames = page.frames();
const mappedFrames = [];
for (let index = 0; index < frames.length; index += 1) {
  const frame = frames[index];
  try {
    // SAP CRM legado altera componentes usados pelos seletores injetados do
    // Playwright. frame.evaluate usa apenas APIs nativas do documento e evita
    // essa incompatibilidade sem coletar valores de campos ou linhas de OS.
    const structure = await frame.evaluate(() => {
      const text = (value) =>
        String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
      const controls = Array.from(
        document.querySelectorAll("input,select,textarea,button,a,[role]")
      ).map((element) => {
        const id = element.getAttribute("id") || "";
        let explicitLabel = "";
        if (id) {
          try {
            explicitLabel =
              document.querySelector(
                `label[for="${CSS.escape(id)}"]`
              )?.textContent || "";
          } catch {
            explicitLabel = "";
          }
        }
        const actionText = ["BUTTON", "A"].includes(element.tagName)
          ? text(element.textContent)
          : "";
        return {
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role") || "",
          type: element.getAttribute("type") || "",
          id,
          name: element.getAttribute("name") || "",
          ariaLabel: text(element.getAttribute("aria-label")),
          title: text(element.getAttribute("title")),
          placeholder: text(element.getAttribute("placeholder")),
          label: text(explicitLabel),
          actionText,
        };
      });
      const columnHeaders = Array.from(
        document.querySelectorAll("th,[role=columnheader]")
      ).map((element) => text(element.textContent));
      return { controls, columnHeaders };
    });

    let frameOrigin = "";
    try {
      frameOrigin = new URL(frame.url() || page.url()).origin;
    } catch {
      frameOrigin = "opaque-frame";
    }

    mappedFrames.push({
      index,
      urlOrigin: frameOrigin,
      controls: structure.controls,
      columnHeaders: structure.columnHeaders,
    });
  } catch (error) {
    mappedFrames.push({
      index,
      urlOrigin: "unreadable-frame",
      controls: [],
      columnHeaders: [],
      mappingError: String(error?.message || error).slice(0, 200),
    });
  }
}

const outputPath = `${ARTIFACT_DIR}/${mapName}.json`;
await fs.writeFile(
  outputPath,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      portalOrigin: new URL(page.url()).origin,
      title: await page.title(),
      frames: mappedFrames,
    },
    null,
    2
  )
);

console.log(`Mapa sanitizado criado em: ${outputPath}`);
await context.close();

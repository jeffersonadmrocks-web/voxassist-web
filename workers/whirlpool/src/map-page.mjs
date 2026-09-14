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
const mapName = (await prompt.question("Nome curto da tela (ex.: busca-os ou detalhe-os): "))
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, "-") || "pagina";
await prompt.question("Com a tela pronta, pressione ENTER para criar o mapa sanitizado...");
prompt.close();

assertWhirlpoolUrl(page.url());

const frames = page.frames();
const mappedFrames = [];
for (let index = 0; index < frames.length; index += 1) {
  const frame = frames[index];
  const controls = await frame.locator("input,select,textarea,button,a,[role]").evaluateAll((elements) =>
    elements.map((element) => {
      const id = element.getAttribute("id") || "";
      const explicitLabel = id
        ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() || ""
        : "";
      const ownText = ["BUTTON", "A"].includes(element.tagName)
        ? (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)
        : "";
      return {
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role") || "",
        type: element.getAttribute("type") || "",
        id,
        name: element.getAttribute("name") || "",
        ariaLabel: element.getAttribute("aria-label") || "",
        title: element.getAttribute("title") || "",
        placeholder: element.getAttribute("placeholder") || "",
        label: explicitLabel.slice(0, 120),
        actionText: ownText,
      };
    })
  );
  const columnHeaders = await frame.locator("th,[role=columnheader]").allTextContents();
  mappedFrames.push({
    index,
    urlOrigin: new URL(frame.url() || page.url()).origin,
    controls,
    columnHeaders: columnHeaders.map((text) => text.replace(/\s+/g, " ").trim().slice(0, 120)),
  });
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

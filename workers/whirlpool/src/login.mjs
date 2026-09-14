import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";
import { PORTAL_URL, PROFILE_DIR, assertWhirlpoolUrl } from "./config.mjs";

assertWhirlpoolUrl(PORTAL_URL);

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chromium",
  headless: false,
  viewport: null,
  args: ["--start-maximized"],
});

const page = context.pages()[0] || (await context.newPage());
await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });

console.log("\nFaça o login diretamente na janela da Whirlpool.");
console.log("Não informe usuário ou senha no terminal nem salve a senha no navegador.");
console.log("Quando a página inicial autenticada estiver visível, volte aqui.\n");

const prompt = readline.createInterface({ input, output });
await prompt.question("Pressione ENTER para validar e preservar a sessão local...");
prompt.close();

assertWhirlpoolUrl(page.url());

const passwordVisible = await page.locator('input[type="password"]:visible').count();
if (passwordVisible) {
  console.error("A tela de login ainda está visível. A sessão não foi confirmada.");
  await context.close();
  process.exit(1);
}

const cookies = await context.cookies("https://larcrm7.whirlpool.com");
if (!cookies.length) {
  console.error("Nenhum cookie Whirlpool foi criado. Revise o bloqueio de cookies do navegador.");
  await context.close();
  process.exit(1);
}

console.log(`Sessão local validada. ${cookies.length} cookie(s) presentes no perfil Serra.`);
await context.close();

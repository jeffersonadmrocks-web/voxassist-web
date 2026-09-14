import fs from "node:fs/promises";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";
import {
  PORTAL_URL,
  PROFILE_DIR,
  ARTIFACT_DIR,
  assertWhirlpoolUrl,
} from "./config.mjs";

assertWhirlpoolUrl(PORTAL_URL);
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

const prompt = readline.createInterface({ input, output });
const scenarioAnswer = await prompt.question(
  "Nome da ação a capturar (ex.: procurar-todas, abrir-os ou gerar-pdf): "
);
const scenario =
  scenarioAnswer.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") ||
  "acao";

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chromium",
  headless: false,
  viewport: null,
  args: ["--start-maximized"],
});

let recording = false;
let sequence = 0;
const events = [];
const startedAt = Date.now();

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    const queryKeys = [...new Set([...url.searchParams.keys()])].sort();
    const pathname = url.pathname.replace(/sap\([^)]*\)/gi, "sap(<redacted>)");
    return {
      origin: url.origin,
      pathname,
      queryKeys,
    };
  } catch {
    return { origin: "", pathname: "<invalid-url>", queryKeys: [] };
  }
}

function jsonShape(value, depth = 0) {
  if (depth > 4) return "nested";
  if (Array.isArray(value)) {
    return { type: "array", item: value.length ? jsonShape(value[0], depth + 1) : "unknown" };
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .slice(0, 100)
        .map((key) => [key, jsonShape(value[key], depth + 1)])
    );
  }
  return value === null ? "null" : typeof value;
}

function bodyShape(request) {
  const body = request.postData();
  if (!body) return null;
  const headers = request.headers();
  const contentType = String(headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  try {
    if (contentType === "application/json") {
      return { contentType, shape: jsonShape(JSON.parse(body)) };
    }
    if (contentType === "application/x-www-form-urlencoded") {
      return {
        contentType,
        parameterKeys: [...new Set([...new URLSearchParams(body).keys()])].sort(),
      };
    }
    if (contentType === "multipart/form-data") {
      const keys = [...body.matchAll(/name="([^"]+)"/g)].map((match) => match[1]);
      return { contentType, parameterKeys: [...new Set(keys)].sort() };
    }
  } catch {
    // Nunca persistir o corpo bruto se o parser falhar.
  }

  const probableKeys = [...body.matchAll(/(?:^|[&\n])([A-Za-z0-9_.:-]{1,100})=/g)]
    .map((match) => match[1]);
  return {
    contentType: contentType || "unknown",
    length: body.length,
    parameterKeys: [...new Set(probableKeys)].sort(),
  };
}

function isBackgroundNoise(value) {
  const path = sanitizeUrl(value).pathname;
  return (
    path.includes("/webcuif/notify/polling/") ||
    path.includes("/eumcollector/")
  );
}

function push(event) {
  if (!recording) return;
  events.push({
    sequence: ++sequence,
    elapsedMs: Date.now() - startedAt,
    ...event,
  });
}

function attachPage(page) {
  page.on("request", (request) => {
    if (isBackgroundNoise(request.url())) return;
    const type = request.resourceType();
    if (!["document", "xhr", "fetch", "other"].includes(type)) return;
    push({
      event: "request",
      method: request.method(),
      resourceType: type,
      url: sanitizeUrl(request.url()),
      body: bodyShape(request),
    });
  });

  page.on("response", (response) => {
    const request = response.request();
    if (isBackgroundNoise(response.url())) return;
    const type = request.resourceType();
    if (!["document", "xhr", "fetch", "other"].includes(type)) return;
    const headers = response.headers();
    const contentType = String(headers["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    push({
      event: "response",
      method: request.method(),
      resourceType: type,
      status: response.status(),
      url: sanitizeUrl(response.url()),
      contentType,
      isDownload:
        contentType === "application/pdf" ||
        Boolean(headers["content-disposition"]),
    });
  });

  page.on("requestfailed", (request) => {
    if (isBackgroundNoise(request.url())) return;
    push({
      event: "requestfailed",
      method: request.method(),
      resourceType: request.resourceType(),
      url: sanitizeUrl(request.url()),
      failure: request.failure()?.errorText || "unknown",
    });
  });
}

context.on("page", attachPage);
for (const existingPage of context.pages()) attachPage(existingPage);

const page = context.pages()[0] || (await context.newPage());
await page.goto(PORTAL_URL, {
  waitUntil: "domcontentloaded",
  timeout: 120_000,
});

console.log("\nA janela Whirlpool foi aberta com o perfil Serra.");
console.log("Este capturador não registra cookies, cabeçalhos, valores ou conteúdo das OS.");
await prompt.question(
  "Navegue até a tela imediatamente anterior à ação e pressione ENTER para iniciar..."
);

recording = true;
const captureStartedAt = new Date().toISOString();
console.log(`\nCAPTURANDO: ${scenario}`);
console.log("Execute somente essa ação no portal e aguarde o resultado carregar.");
await prompt.question("Depois, volte aqui e pressione ENTER para encerrar a captura...");
recording = false;
prompt.close();

const outputPath = `${ARTIFACT_DIR}/rede-${scenario}.json`;
await fs.writeFile(
  outputPath,
  JSON.stringify(
    {
      version: 1,
      scenario,
      captureStartedAt,
      captureFinishedAt: new Date().toISOString(),
      portalOrigin: new URL(PORTAL_URL).origin,
      privacy: {
        cookies: false,
        headerValues: false,
        bodyValues: false,
        responseBodies: false,
      },
      events,
    },
    null,
    2
  )
);

console.log(`Captura de rede sanitizada criada em: ${outputPath}`);
await context.close();

import path from "node:path";
import { fileURLToPath } from "node:url";

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PORTAL_URL =
  process.env.WHIRLPOOL_PORTAL_URL ||
  "https://larcrm7.whirlpool.com/sap(bD1wdCZjPTAwMSZkPW1pbg==)/bc/bsp/sap/crm_ui_start/default.htm?sap-languange=PT";

export const PROFILE_DIR = path.join(workerDir, ".playwright-profile", "serra");
export const ARTIFACT_DIR = path.join(workerDir, ".artifacts");

export function assertWhirlpoolUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "larcrm7.whirlpool.com") {
    throw new Error("URL fora do portal Whirlpool autorizado.");
  }
  return url;
}

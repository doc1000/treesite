import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const LOG_DIR = path.join(REPO_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "studio-session.ndjson");

/** Append one NDJSON event line (sync). Ensures logs/ exists. */
export function appendLog(event) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const line = `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`;
  fs.appendFileSync(LOG_FILE, line, "utf8");
}

export const SESSION_LOG_PATH = LOG_FILE;

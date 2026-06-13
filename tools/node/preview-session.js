import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const PREVIEW_SESSION_PATH = path.join(REPO_ROOT, ".treesite", "preview-session.json");
export const HANDLER_DIST = path.join(REPO_ROOT, "handler", "dist");
export const SERVE_ARTIFACT_SCRIPT = path.join(REPO_ROOT, "tools", "node", "serve-artifact.js");
export const SERVE_HANDLER_DIST_SCRIPT = path.join(REPO_ROOT, "tools", "node", "serve-handler-dist.js");

/** Artifact port — override via TREESITE_ARTIFACT_PORT */
export function getArtifactPort() {
  const env = process.env.TREESITE_ARTIFACT_PORT;
  if (env) {
    const n = Number(env);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return 5199;
}

export const HANDLER_VIEW_PORT = 5180;

export function readPreviewSession() {
  if (!fs.existsSync(PREVIEW_SESSION_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(PREVIEW_SESSION_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function writePreviewSession(session) {
  fs.mkdirSync(path.dirname(PREVIEW_SESSION_PATH), { recursive: true });
  fs.writeFileSync(PREVIEW_SESSION_PATH, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

export function removePreviewSession() {
  if (fs.existsSync(PREVIEW_SESSION_PATH)) {
    fs.unlinkSync(PREVIEW_SESSION_PATH);
  }
}

export function isPidAlive(pid) {
  if (pid == null || !Number.isFinite(Number(pid))) return false;
  const n = Number(pid);
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

export function sessionPidsAlive(session) {
  const pids = session?.pids;
  if (!pids) return false;
  const artifact = isPidAlive(pids.artifact);
  const handler = isPidAlive(pids.handler);
  return artifact && handler;
}

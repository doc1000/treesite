import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../..");
export const HANDLER_DIST = path.resolve(REPO_ROOT, "handler/dist");
export const ARTIFACTS_BASE = path.resolve(REPO_ROOT, "artifacts");

export const HANDLER_PREVIEW_BUILD_MSG =
  "Handler preview build missing. Run npm --prefix handler run build:studio-preview.";

export function validateArtifactName(name) {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) return false;
  return true;
}

export function buildPreviewUrl(artifactName) {
  const artifactPath = `/artifact/${artifactName}/`;
  return `/preview/?artifact=${encodeURIComponent(artifactPath)}`;
}

export function artifactDirForName(artifactName) {
  if (!validateArtifactName(artifactName)) return null;
  const artifactPath = path.resolve(path.join(ARTIFACTS_BASE, artifactName));
  const baseResolved = path.resolve(ARTIFACTS_BASE);
  if (
    artifactPath !== baseResolved
    && !artifactPath.startsWith(baseResolved + path.sep)
  ) {
    return null;
  }
  return artifactPath;
}

export async function artifactExists(artifactName) {
  const dir = artifactDirForName(artifactName);
  if (!dir) return false;
  try {
    await fs.access(path.join(dir, "artifact.json"));
    return true;
  } catch {
    return false;
  }
}

/** @returns {Promise<{ ready: boolean, wrongBase: boolean }>} */
export async function handlerDistReady() {
  const indexPath = path.join(HANDLER_DIST, "index.html");
  try {
    const html = await fs.readFile(indexPath, "utf8");
    if (!html.includes("/preview/assets/")) {
      return { ready: false, wrongBase: true };
    }
    return { ready: true, wrongBase: false };
  } catch {
    return { ready: false, wrongBase: false };
  }
}

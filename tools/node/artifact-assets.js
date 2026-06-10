import fs from "node:fs/promises";
import path from "node:path";
import { itemFilePath } from "./tool-runner.js";

export function artifactAssetRel(...parts) {
  return `assets/${parts.join("/")}`;
}

export function resolveArtifactAssetPath(artifactPath, ref) {
  if (typeof ref !== "string") return null;
  const normalized = ref.trim().replace(/^\//, "");
  if (!normalized.startsWith("assets/")) return null;
  return path.join(artifactPath, normalized);
}

export async function safeUnlink(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") return;
    throw err;
  }
}

export async function removeAssociatedAssets(artifactPath, item, slug) {
  if (item.type === "htmlCard") {
    const dir = path.join(artifactPath, "assets", "html", slug);
    await fs.rm(dir, { recursive: true, force: true });
    return;
  }

  if (item.type === "pdf") {
    const pdfRef = item.pdf || item.source;
    const pdfPath = resolveArtifactAssetPath(artifactPath, pdfRef);
    if (pdfPath) await safeUnlink(pdfPath);
    const previewPath = resolveArtifactAssetPath(artifactPath, item.previewImage);
    if (previewPath) await safeUnlink(previewPath);
    return;
  }

  if (item.type === "website") {
    const previewPath = resolveArtifactAssetPath(artifactPath, item.previewImage);
    if (previewPath) await safeUnlink(previewPath);
  }
}

export async function renameItemFile(artifactPath, oldSlug, newSlug) {
  if (oldSlug === newSlug) return;
  const from = itemFilePath(artifactPath, oldSlug);
  const to = itemFilePath(artifactPath, newSlug);
  await fs.rename(from, to);
}

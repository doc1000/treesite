import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import {
  appRoot,
  contentItemPath,
  parseArgs,
  readContentItem,
  rebuildGeneratedContent,
  requireArg
} from "./content-utils.js";

function assetPathFromPublicUrl(url) {
  if (typeof url !== "string" || !url.startsWith("/assets/")) return null;
  return path.join(appRoot, "public", url.replace(/^\//, ""));
}

async function safeUnlink(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
}

async function removeAssociatedAssets(item, slug) {
  if (item.type === "htmlCard") {
    const dir = path.join(appRoot, "public", "assets", "html", slug);
    await fs.rm(dir, { recursive: true, force: true });
    return;
  }

  if (item.type === "pdf") {
    const pdfRef = item.pdf || item.source;
    const pdfPath = assetPathFromPublicUrl(pdfRef);
    if (pdfPath) await safeUnlink(pdfPath);
    const previewPath = assetPathFromPublicUrl(item.previewImage);
    if (previewPath) await safeUnlink(previewPath);
    return;
  }

  if (item.type === "website") {
    const previewPath = assetPathFromPublicUrl(item.previewImage);
    if (previewPath) await safeUnlink(previewPath);
  }
}

async function confirmDelete({ slug, item, skipConfirm }) {
  if (skipConfirm) return;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Cannot confirm deletion in a non-interactive environment. Pass --yes to delete without prompting."
    );
  }

  if (item.type === "section") {
    console.warn(
      "Warning: This is a section. Other items may still reference its path; consider moving them first.\n"
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const line = await rl.question(
      `Delete "${item.name}" (slug: ${slug}, type: ${item.type})? Type yes to confirm: `
    );
    const answer = String(line).trim().toLowerCase();
    if (answer !== "yes") {
      console.log("Cancelled (you must type exactly: yes).");
      process.exit(0);
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs();
  const slug = requireArg(args, "slug");
  const skipConfirm = args.yes === true;

  let item;
  try {
    item = await readContentItem(slug);
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new Error(`No content item found for slug "${slug}".`, { cause: err });
    }
    throw err;
  }

  await confirmDelete({ slug, item, skipConfirm });

  await removeAssociatedAssets(item, slug);
  await fs.unlink(contentItemPath(slug));

  const count = await rebuildGeneratedContent();

  console.log(`Deleted "${item.name}" (${slug}).`);
  console.log(`Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

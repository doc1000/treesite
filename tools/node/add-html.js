import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { artifactAssetRel } from "./artifact-assets.js";
import { parseValue, slugify } from "./content-utils.js";
import { ErrorCodes } from "./error-codes.js";
import { mergeDescriptionArgs } from "./merge-description-arg.js";
import { fail, parseToolArgs, rebuildManifest, success, writeItem } from "./tool-runner.js";

async function captureHtmlPreview({ pagePath, outputPath }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1
    });
    await page.goto(pathToFileURL(pagePath).href, { waitUntil: "load", timeout: 60000 });
    await page.screenshot({ path: outputPath, fullPage: false });
  } finally {
    await browser.close();
  }
}

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const args = { ...input };
  await mergeDescriptionArgs(args);

  const name = typeof args.name === "string" ? args.name.trim() : "";
  const section = typeof args.section === "string" ? args.section.trim() : "";
  const filePath = path.resolve(
    typeof args.sourcePath === "string"
      ? args.sourcePath
      : typeof args.file === "string"
        ? args.file
        : ""
  );

  if (!name) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include "name".');
  if (!section) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include "section".');
  if (!filePath) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include "sourcePath" (or legacy "file").');

  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".html" && ext !== ".htm") {
    fail(1, ErrorCodes.INVALID_INPUT, "sourcePath must be an .html or .htm file.");
  }

  await fs.access(filePath);

  const slug = slugify(
    typeof args.slug === "string" && args.slug.trim() ? args.slug : name
  );
  if (!slug) fail(1, ErrorCodes.INVALID_INPUT, "Could not create a slug.");

  const destDir = path.join(artifactPath, "assets", "html", slug);
  await fs.mkdir(destDir, { recursive: true });

  if (typeof args.assets === "string" && args.assets.trim()) {
    const assetsDir = path.resolve(args.assets);
    const st = await fs.stat(assetsDir);
    if (!st.isDirectory()) {
      fail(1, ErrorCodes.INVALID_INPUT, "assets must be a directory path.");
    }
    await fs.cp(assetsDir, destDir, { recursive: true });
  }

  const indexPath = path.join(destDir, "index.html");
  await fs.copyFile(filePath, indexPath);

  const previewFilename = "preview.png";
  const previewOutputPath = path.join(destDir, previewFilename);
  const htmlRel = artifactAssetRel("html", slug, "index.html");
  const previewRel = artifactAssetRel("html", slug, previewFilename);

  if (typeof args.image === "string" && args.image.trim()) {
    await fs.copyFile(path.resolve(args.image), previewOutputPath);
  } else {
    await captureHtmlPreview({ pagePath: indexPath, outputPath: previewOutputPath });
  }

  const item = {
    id: randomUUID(),
    name,
    slug,
    section,
    type: "htmlCard",
    description: typeof args.description === "string" ? args.description : "",
    source: htmlRel,
    url: htmlRel,
    previewImage: previewRel,
    value: parseValue(args.value)
  };

  if (args.kicker) item.kicker = String(args.kicker);

  const written = await writeItem(artifactPath, item);
  await rebuildManifest(artifactPath);

  success({ id: written.id, slug: written.slug, manifestRebuilt: true });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

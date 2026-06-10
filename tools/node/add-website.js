import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { artifactAssetRel } from "./artifact-assets.js";
import { parseValue, slugify } from "./content-utils.js";
import { ErrorCodes } from "./error-codes.js";
import { mergeDescriptionArgs } from "./merge-description-arg.js";
import { fail, parseToolArgs, rebuildManifest, success, writeItem } from "./tool-runner.js";

async function captureWebsitePreview({ url, outputPath }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
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
  const urlRaw = typeof args.url === "string" ? args.url.trim() : "";

  if (!name) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include "name".');
  if (!section) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include "section".');
  if (!urlRaw) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include "url".');

  const url = new URL(urlRaw).toString();
  const slug = slugify(
    typeof args.slug === "string" && args.slug.trim() ? args.slug : name
  );
  if (!slug) fail(1, ErrorCodes.INVALID_INPUT, "Could not create a slug.");

  const previewFilename = `${slug}.png`;
  const previewOutputPath = path.join(artifactPath, "assets", "previews", previewFilename);
  const previewRel = artifactAssetRel("previews", previewFilename);

  await captureWebsitePreview({ url, outputPath: previewOutputPath });

  const item = {
    id: randomUUID(),
    name,
    slug,
    section,
    type: "website",
    description: typeof args.description === "string" ? args.description : "",
    source: url,
    url,
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

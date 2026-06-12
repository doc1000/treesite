import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { artifactAssetRel } from "./artifact-assets.js";
import { parseValue, slugify } from "./content-utils.js";
import { ErrorCodes } from "./error-codes.js";
import { mergeDescriptionArgs } from "./merge-description-arg.js";
import { fail, parseToolArgs, rebuildManifest, success, writeItem } from "./tool-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HANDLER_PKG = path.resolve(__dirname, "../../handler/package.json");

/**
 * Screenshot a live URL using Playwright.
 * Returns { ok: true } on success, { ok: false, warning: string } on any failure.
 */
async function captureWebsitePreview({ url, outputPath }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  let chromium;
  try {
    const req = createRequire(HANDLER_PKG);
    ({ chromium } = req("playwright"));
  } catch (err) {
    return {
      ok: false,
      warning: `Preview skipped — Playwright unavailable. ` +
        `Run: cd handler && npx playwright install chromium. (${err.message})`
    };
  }

  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.screenshot({ path: outputPath, fullPage: false });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      warning: `Preview generation failed: ${err.message}. ` +
        `The card was created without a preview image — re-run this tool or re-deploy to regenerate.`
    };
  } finally {
    try { await browser?.close(); } catch { /* ignore */ }
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

  // Attempt preview — non-fatal. Card is created regardless.
  // Preview regenerates automatically on next deploy if skipped now.
  const previewResult = await captureWebsitePreview({ url, outputPath: previewOutputPath });

  const item = {
    id: randomUUID(),
    name,
    slug,
    section,
    type: "website",
    description: typeof args.description === "string" ? args.description : "",
    source: url,
    url,
    value: parseValue(args.value)
  };

  if (previewResult.ok) {
    item.previewImage = previewRel;
  }

  if (args.kicker) item.kicker = String(args.kicker);

  const written = await writeItem(artifactPath, item);
  await rebuildManifest(artifactPath);

  const result = { id: written.id, slug: written.slug, manifestRebuilt: true };
  if (!previewResult.ok) {
    result.previewPending = true;
    result.warning = previewResult.warning;
  }

  success(result);
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

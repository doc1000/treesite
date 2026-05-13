import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import {
  appRoot,
  parseArgs,
  parseValue,
  publicPath,
  rebuildGeneratedContent,
  requireArg,
  slugify,
  writeContentItem
} from "./content-utils.js";

async function captureWebsitePreview({ url, outputPath }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1
    });

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 45000
    });

    await page.screenshot({
      path: outputPath,
      fullPage: false
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs();
  const url = new URL(requireArg(args, "url")).toString();
  const section = requireArg(args, "section");
  const title = requireArg(args, "title");
  const slug = slugify(args.slug || title);

  if (!slug) {
    throw new Error("Could not create a slug from the supplied title.");
  }

  const previewFilename = `${slug}.png`;
  const previewOutputPath = path.join(appRoot, "public", "assets", "previews", previewFilename);
  const previewPublicPath = publicPath("previews", previewFilename);

  await captureWebsitePreview({ url, outputPath: previewOutputPath });

  const item = {
    name: title,
    slug,
    section,
    type: "website",
    description: args.description || "",
    source: url,
    url,
    previewImage: previewPublicPath,
    value: parseValue(args.value)
  };

  if (args.kicker) item.kicker = String(args.kicker);

  const itemPath = await writeContentItem(slug, item);
  const count = await rebuildGeneratedContent();

  console.log(`Added website item: ${title}`);
  console.log(`  item: ${path.relative(appRoot, itemPath)}`);
  console.log(`  url: ${url}`);
  console.log(`  preview: ${previewPublicPath}`);
  console.log(`Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

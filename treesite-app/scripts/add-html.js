import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

async function captureHtmlPreview({ pagePath, outputPath }) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1
    });

    await page.goto(pathToFileURL(pagePath).href, {
      waitUntil: "load",
      timeout: 60000
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
  const file = path.resolve(requireArg(args, "file"));
  const section = requireArg(args, "section");
  const title = requireArg(args, "title");
  const slug = slugify(args.slug || title);

  if (!slug) {
    throw new Error("Could not create a slug from the supplied title.");
  }

  const ext = path.extname(file).toLowerCase();
  if (ext !== ".html" && ext !== ".htm") {
    throw new Error("--file must point to an .html or .htm file.");
  }

  await fs.access(file);

  if (args.assets !== undefined && typeof args.assets !== "string") {
    throw new Error("--assets requires a directory path.");
  }

  if (args.image !== undefined && typeof args.image !== "string") {
    throw new Error("--image requires a file path.");
  }

  const destDir = path.join(appRoot, "public", "assets", "html", slug);
  await fs.mkdir(destDir, { recursive: true });

  if (args.assets) {
    const assetsDir = path.resolve(args.assets);
    await fs.access(assetsDir);
    const st = await fs.stat(assetsDir);
    if (!st.isDirectory()) {
      throw new Error("--assets must be a directory.");
    }
    await fs.cp(assetsDir, destDir, { recursive: true });
  }

  const indexPath = path.join(destDir, "index.html");
  await fs.copyFile(file, indexPath);

  const previewFilename = "preview.png";
  const previewOutputPath = path.join(destDir, previewFilename);
  const htmlPublicPath = publicPath("html", slug, "index.html");
  const previewPublicPath = publicPath("html", slug, previewFilename);

  if (args.image) {
    const imagePath = path.resolve(args.image);
    await fs.access(imagePath);
    await fs.copyFile(imagePath, previewOutputPath);
  } else {
    await captureHtmlPreview({ pagePath: indexPath, outputPath: previewOutputPath });
  }

  const item = {
    name: title,
    slug,
    section,
    type: "htmlCard",
    description: args.description || "",
    source: htmlPublicPath,
    url: htmlPublicPath,
    previewImage: previewPublicPath,
    value: parseValue(args.value)
  };

  if (args.kicker) item.kicker = String(args.kicker);

  const itemPath = await writeContentItem(slug, item);
  const count = await rebuildGeneratedContent();

  console.log(`Added HTML card: ${title}`);
  console.log(`  item: ${path.relative(appRoot, itemPath)}`);
  console.log(`  html: ${htmlPublicPath}`);
  console.log(`  preview: ${previewPublicPath}`);
  console.log(`Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

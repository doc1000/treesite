import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { chromium } from "playwright";
import { applyContentItems, minimalSiteRoot } from "../src/contentItems.js";
import { readContentItems } from "./content-utils.js";

const appRoot = process.cwd();
const siteDataPath = path.join(appRoot, "src", "siteData.js");
const previewDir = path.join(appRoot, "public", "assets", "site-previews");
const publicPreviewBase = "/assets/site-previews";

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function loadSiteData() {
  const source = await fs.readFile(siteDataPath, "utf8");
  const withoutImports = source.replace(
    /^import\s+([A-Za-z_$][\w$]*)\s+from\s+["'][^"']+["'];\s*$/gm,
    (_, name) => {
      return `const ${name} = "";`;
    }
  ).replace(/^import\s+.*;\s*$/gm, "");
  const evaluable = withoutImports.replace(
    /export\s+const\s+siteData\s*=/,
    "const siteData ="
  );

  const context = {
    applyContentItems,
    minimalSiteRoot,
    generatedContentItems: await readContentItems()
  };
  vm.createContext(context);
  return vm.runInContext(`${evaluable}\nsiteData;`, context, {
    filename: siteDataPath
  });
}

function collectWebsiteNodes(node, trail = [], results = []) {
  const nextTrail = [...trail, node.name].filter(Boolean);

  if (node.type === "website" && node.url) {
    const slug = slugify(node.slug || node.name || node.title || node.url);
    const previewImage = node.previewImage || `${publicPreviewBase}/${slug}.png`;
    results.push({
      node,
      title: node.title || node.name || node.url,
      url: node.url,
      slug,
      previewImage,
      outputPath: path.join(appRoot, "public", previewImage.replace(/^\//, "")),
      trail: nextTrail.join(" / ")
    });
  }

  for (const child of node.children || []) {
    collectWebsiteNodes(child, nextTrail, results);
  }

  return results;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function snapshotWebsite(page, website) {
  await page.goto(website.url, {
    waitUntil: "networkidle",
    timeout: 45000
  });

  await page.screenshot({
    path: website.outputPath,
    fullPage: false
  });
}

async function main() {
  const siteData = await loadSiteData();
  const websites = collectWebsiteNodes(siteData);

  if (websites.length === 0) {
    console.log("No website nodes found.");
    return;
  }

  await fs.mkdir(previewDir, { recursive: true });

  const missing = [];
  for (const website of websites) {
    if (!(await fileExists(website.outputPath))) {
      missing.push(website);
    }
  }

  if (missing.length === 0) {
    console.log(`All ${websites.length} website previews already exist.`);
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });

  try {
    for (const website of missing) {
      console.log(`Snapshotting ${website.title}`);
      console.log(`  ${website.url}`);
      await snapshotWebsite(page, website);
      console.log(`  saved ${website.previewImage}`);
    }
  } finally {
    await browser.close();
  }

  const missingPreviewFields = websites.filter(website => !website.node.previewImage);
  if (missingPreviewFields.length > 0) {
    console.log("\nAdd these previewImage paths to siteData:");
    for (const website of missingPreviewFields) {
      console.log(`- ${website.trail}: previewImage: "${website.previewImage}"`);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

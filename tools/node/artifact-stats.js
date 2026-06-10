import fs from "node:fs/promises";
import path from "node:path";
import { ErrorCodes } from "./error-codes.js";
import { fail, loadArtifact, loadItems, parseToolArgs, success } from "./tool-runner.js";

async function countDirFiles(dir) {
  let count = 0;
  let bytes = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await countDirFiles(full);
        count += nested.count;
        bytes += nested.bytes;
      } else {
        count += 1;
        const stat = await fs.stat(full);
        bytes += stat.size;
      }
    }
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return { count: 0, bytes: 0 };
    }
    throw err;
  }
  return { count, bytes };
}

async function main() {
  const { artifactPath } = await parseToolArgs();
  const meta = await loadArtifact(artifactPath);
  const items = await loadItems(artifactPath);

  const typeBreakdown = {};
  let sectionCount = 0;
  let leafCount = 0;
  let hiddenCount = 0;

  for (const item of items) {
    typeBreakdown[item.type] = (typeBreakdown[item.type] || 0) + 1;
    if (item.type === "section") sectionCount += 1;
    else leafCount += 1;
    if (item.hidden) hiddenCount += 1;
  }

  const assetRoots = {
    pdfs: path.join(artifactPath, "assets", "pdfs"),
    html: path.join(artifactPath, "assets", "html"),
    previews: path.join(artifactPath, "assets", "previews"),
    images: path.join(artifactPath, "assets", "images")
  };

  const assetCounts = {};
  let assetTotalBytes = 0;
  for (const [key, dir] of Object.entries(assetRoots)) {
    const { count, bytes } = await countDirFiles(dir);
    assetCounts[key] = count;
    assetTotalBytes += bytes;
  }

  const assetsDir = path.join(artifactPath, "assets");
  const other = await countDirFiles(assetsDir);
  assetTotalBytes = other.bytes;

  success({
    schemaVersion: meta.schemaVersion,
    itemCount: items.length,
    sectionCount,
    leafCount,
    typeBreakdown,
    assetCounts,
    assetTotalBytes,
    hiddenCount
  });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

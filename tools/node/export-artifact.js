import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { applyContentItems } from "../../treesite-app/src/contentItems.js";

const ASSET_PATH_FIELDS = ["pdf", "source", "url", "previewImage", "image", "embed", "href"];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.trim();
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function requireArg(args, name) {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required --${name} value.`);
  }
  return value.trim();
}

function rewriteAssetPath(value) {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (t.startsWith("/assets/")) {
    return t.slice(1);
  }
  return value;
}

function rewriteItemAssetPaths(item) {
  const next = { ...item };
  for (const field of ASSET_PATH_FIELDS) {
    if (field in next) {
      next[field] = rewriteAssetPath(next[field]);
    }
  }
  return next;
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function countFiles(dir) {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(full);
    } else {
      count += 1;
    }
  }
  return count;
}

async function copyDir(src, dest) {
  if (!(await pathExists(src))) return;
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

async function main() {
  const args = parseArgs();
  const source = path.resolve(requireArg(args, "source"));
  const dest = path.resolve(requireArg(args, "dest"));
  const name = requireArg(args, "name");

  const itemsSourceDir = path.join(source, "content", "items");
  const entries = await fs.readdir(itemsSourceDir, { withFileTypes: true });
  const warnings = [];
  const items = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const itemPath = path.join(itemsSourceDir, entry.name);
    const raw = await fs.readFile(itemPath, "utf8");
    const item = JSON.parse(raw);
    item.slug ||= path.basename(entry.name, ".json");

    if (!item.id) {
      item.id = randomUUID();
      await fs.writeFile(itemPath, `${JSON.stringify(item, null, 2)}\n`);
      console.log(`Back-filled id for ${entry.name}: ${item.id}`);
    }

    items.push(item);
  }

  await fs.mkdir(path.join(dest, "items"), { recursive: true });
  for (const item of items) {
    const rewritten = rewriteItemAssetPaths(item);
    await fs.writeFile(
      path.join(dest, "items", `${item.slug}.json`),
      `${JSON.stringify(rewritten, null, 2)}\n`
    );
  }

  const artifactMeta = {
    name,
    schemaVersion: 1,
    displayName: "Knowledge Algorithms",
    tagline: "Unify data. Evaluate models. Visualize results.",
    defaultSchemeId: "brand-slate"
  };
  await fs.writeFile(path.join(dest, "artifact.json"), `${JSON.stringify(artifactMeta, null, 2)}\n`);

  await copyDir(path.join(source, "public", "assets"), path.join(dest, "assets"));
  await copyDir(path.join(source, "public", "color-schemes"), path.join(dest, "schemes"));
  await fs.mkdir(path.join(dest, "migrations"), { recursive: true });

  const siteRoot = {
    name: "Home",
    displayName: artifactMeta.displayName,
    description: artifactMeta.tagline,
    children: []
  };
  const manifest = applyContentItems(siteRoot, items.map(rewriteItemAssetPaths));
  await fs.writeFile(path.join(dest, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const ids = new Set();
  for (const item of items) {
    for (const field of ["id", "name", "slug", "section", "type"]) {
      if (typeof item[field] !== "string" || !item[field].trim()) {
        throw new Error(`Item ${item.slug} missing required field ${field}`);
      }
    }
    if (ids.has(item.id)) {
      throw new Error(`Duplicate id: ${item.id}`);
    }
    ids.add(item.id);

    for (const field of ASSET_PATH_FIELDS) {
      const val = item[field];
      if (typeof val !== "string" || !val.startsWith("assets/")) continue;
      const assetPath = path.join(dest, val);
      if (!(await pathExists(assetPath))) {
        warnings.push(`Missing asset for ${item.slug}: ${val}`);
      }
    }
  }

  let assetCount = 0;
  const assetsDir = path.join(dest, "assets");
  if (await pathExists(assetsDir)) {
    assetCount = await countFiles(assetsDir);
  }

  const result = {
    ok: true,
    artifactPath: dest,
    itemCount: items.length,
    assetCount,
    warnings
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(err.message || err);
  process.exitCode = 1;
});

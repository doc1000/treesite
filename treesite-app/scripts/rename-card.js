import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { applyContentItems, minimalSiteRoot } from "../src/contentItems.js";
import {
  appRoot,
  contentItemPath,
  parseArgs,
  readContentItem,
  readContentItems,
  rebuildGeneratedContent,
  requireArg,
  slugify,
  writeContentItem
} from "./content-utils.js";
import { applyCardFields } from "./card-fields.js";
import { mergeDescriptionArgs } from "./merge-description-arg.js";
import {
  buildSlugMaterializedMap,
  replaceLastSegment,
  rewriteSectionPath
} from "./tree-path-utils.js";

/** Rewrite slug segments in /assets/ paths so previews and PDF paths stay consistent after re-slugging. */
function rewriteAssetPathsForSlug(item, oldSlug, newSlug) {
  if (oldSlug === newSlug) return;
  const keys = ["previewImage", "pdf", "image", "source", "url"];
  for (const key of keys) {
    const v = item[key];
    if (typeof v !== "string" || !v.includes(oldSlug)) continue;
    if (!v.includes("/assets/") && !v.startsWith("/assets/")) continue;
    item[key] = v.split(oldSlug).join(newSlug);
  }
}

async function renameLeafCard(args, fromSlug, toSlug, skipRewrite) {
  const item = await readContentItem(fromSlug);

  const cardArgs = { ...args };
  delete cardArgs.from;
  delete cardArgs.to;
  delete cardArgs["new-slug"];
  delete cardArgs["rewrite-paths"];
  delete cardArgs.slug;

  applyCardFields(item, cardArgs, { allowIdentity: true });
  item.slug = toSlug;

  if (!skipRewrite) {
    rewriteAssetPathsForSlug(item, fromSlug, toSlug);
  }

  await writeContentItem(toSlug, item);

  if (toSlug !== fromSlug) {
    await fs.unlink(contentItemPath(fromSlug));
  }

  const count = await rebuildGeneratedContent();

  if (toSlug === fromSlug) {
    console.log(`Updated card: ${toSlug}`);
  } else {
    console.log(`Renamed card: ${fromSlug} → ${toSlug}`);
  }
  console.log(`  item: ${path.relative(appRoot, contentItemPath(toSlug))}`);
  if (item.name) console.log(`  name: ${item.name}`);
  console.log(
    `Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`
  );
  if (toSlug !== fromSlug && !skipRewrite) {
    console.log(
      "Tip: If filenames still use the old slug, rename files under public/assets/ to match."
    );
  }
}

async function renameSectionFolder(args, fromSlug, toSlug, skipRewrite) {
  const items = await readContentItems();
  const idx = items.findIndex(i => i.slug === fromSlug);
  if (idx < 0) {
    throw new Error(`No item with slug "${fromSlug}".`);
  }

  const tree = applyContentItems(minimalSiteRoot, items);
  const slugMap = {};
  buildSlugMaterializedMap(tree, [], slugMap);

  const oldMat = slugMap[fromSlug];
  if (oldMat === undefined) {
    throw new Error(
      `Slug "${fromSlug}" not found in merged tree (cannot resolve materialized path).`
    );
  }

  const item = structuredClone(items[idx]);

  const cardArgs = { ...args };
  delete cardArgs.from;
  delete cardArgs.to;
  delete cardArgs["new-slug"];
  delete cardArgs["rewrite-paths"];
  delete cardArgs.slug;

  applyCardFields(item, cardArgs, { allowIdentity: true });
  item.slug = toSlug;

  if (!skipRewrite) {
    rewriteAssetPathsForSlug(item, fromSlug, toSlug);
  }

  const newMat = replaceLastSegment(oldMat, item.name);
  const cascadePaths = oldMat !== newMat;

  const nextItems = items.map(row => {
    const base =
      row.slug === fromSlug ? structuredClone(item) : structuredClone(row);
    if (cascadePaths) {
      base.section = rewriteSectionPath(base.section, oldMat, newMat);
    }
    return base;
  });

  for (const row of nextItems) {
    await writeContentItem(row.slug, row);
  }

  if (toSlug !== fromSlug) {
    await fs.unlink(contentItemPath(fromSlug));
  }

  const count = await rebuildGeneratedContent();

  if (toSlug === fromSlug) {
    console.log(`Updated section folder: ${toSlug}`);
  } else {
    console.log(`Renamed section folder: ${fromSlug} → ${toSlug}`);
  }
  console.log(`  item: ${path.relative(appRoot, contentItemPath(toSlug))}`);
  if (item.name) console.log(`  name: ${item.name}`);
  if (cascadePaths) {
    console.log(`  cascaded section paths: "${oldMat}" → "${newMat}"`);
  }
  console.log(
    `Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`
  );
  if (toSlug !== fromSlug && !skipRewrite) {
    console.log(
      "Tip: If filenames still use the old slug, rename files under public/assets/ to match."
    );
  }
}

async function main() {
  const args = parseArgs();
  await mergeDescriptionArgs(args);
  const fromSlug = requireArg(args, "from");

  const toSlugRaw = args.to ?? args["new-slug"];
  const toSlug =
    toSlugRaw !== undefined && String(toSlugRaw).trim() !== ""
      ? slugify(String(toSlugRaw).trim())
      : fromSlug;

  if (!toSlug) {
    throw new Error("Invalid target slug after slugify.");
  }

  if (toSlug !== fromSlug) {
    const targetPath = contentItemPath(toSlug);
    try {
      await fs.access(targetPath);
      throw new Error(
        `Refusing to overwrite: ${path.relative(appRoot, targetPath)} already exists. Pick another --to slug.`
      );
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  const skipRewrite =
    args["rewrite-paths"] === "false" || args["rewrite-paths"] === false;

  const sourceItem = await readContentItem(fromSlug);

  if (sourceItem.type === "section") {
    await renameSectionFolder(args, fromSlug, toSlug, skipRewrite);
  } else {
    await renameLeafCard(args, fromSlug, toSlug, skipRewrite);
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

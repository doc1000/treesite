import fs from "node:fs/promises";
import path from "node:path";
import { applyContentItems, minimalSiteRoot } from "../../handler/src/contentItems.js";
import { applyCardFields } from "./card-fields.js";
import { slugify } from "./content-utils.js";
import { ErrorCodes } from "./error-codes.js";
import {
  fail,
  itemFilePath,
  loadItems,
  parseToolArgs,
  rebuildManifest,
  resolveItemTarget,
  success,
  writeItem
} from "./tool-runner.js";
import {
  buildSlugMaterializedMap,
  replaceLastSegment,
  rewriteSectionPath
} from "./tree-path-utils.js";

function rewriteAssetPathsForSlug(item, oldSlug, newSlug) {
  if (oldSlug === newSlug) return;
  const keys = ["previewImage", "pdf", "image", "source", "url"];
  for (const key of keys) {
    const v = item[key];
    if (typeof v !== "string" || !v.includes(oldSlug)) continue;
    if (!v.includes("assets/")) continue;
    item[key] = v.split(oldSlug).join(newSlug);
  }
}

async function renameLeafCard(artifactPath, args, fromSlug, toSlug, skipRewrite, existing) {
  const item = { ...existing };
  applyCardFields(item, args, { allowIdentity: true });
  item.slug = toSlug;
  item.id = existing.id;

  if (!skipRewrite) {
    rewriteAssetPathsForSlug(item, fromSlug, toSlug);
  }

  await writeItem(artifactPath, item);
  if (toSlug !== fromSlug) {
    await fs.unlink(itemFilePath(artifactPath, fromSlug));
  }
}

async function renameSectionFolder(artifactPath, args, fromSlug, toSlug, skipRewrite, existing) {
  const items = await loadItems(artifactPath);
  const tree = applyContentItems(minimalSiteRoot, items);
  const slugMap = {};
  buildSlugMaterializedMap(tree, [], slugMap);

  const oldMat = slugMap[fromSlug];
  if (oldMat === undefined) {
    fail(3, ErrorCodes.ITEM_NOT_FOUND, `Slug "${fromSlug}" not found in merged tree.`);
  }

  const item = structuredClone(existing);
  applyCardFields(item, args, { allowIdentity: true });
  item.slug = toSlug;
  item.id = existing.id;

  if (!skipRewrite) {
    rewriteAssetPathsForSlug(item, fromSlug, toSlug);
  }

  const newMat = replaceLastSegment(oldMat, item.name);
  const cascadePaths = oldMat !== newMat;

  const nextItems = items.map(row => {
    const base = row.id === existing.id ? structuredClone(item) : structuredClone(row);
    if (cascadePaths) {
      base.section = rewriteSectionPath(base.section, oldMat, newMat);
    }
    return base;
  });

  for (const row of nextItems) {
    await writeItem(artifactPath, row);
  }

  if (toSlug !== fromSlug) {
    await fs.unlink(itemFilePath(artifactPath, fromSlug));
  }
}

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const items = await loadItems(artifactPath);
  const existing = await resolveItemTarget(items, input);

  const name =
    typeof input.name === "string" && input.name.trim()
      ? input.name.trim()
      : existing.name;
  const toSlug = slugify(
    typeof input.slug === "string" && input.slug.trim() ? input.slug : name
  );
  if (!toSlug) {
    fail(1, ErrorCodes.INVALID_INPUT, "Invalid target slug after slugify.");
  }

  const fromSlug = existing.slug;
  const skipRewrite = input.rewritePaths === false;

  if (toSlug !== fromSlug) {
    try {
      await fs.access(itemFilePath(artifactPath, toSlug));
      fail(3, ErrorCodes.INVALID_INPUT, `Refusing to overwrite existing slug "${toSlug}".`);
    } catch (err) {
      if (!(err && typeof err === "object" && "code" in err && err.code === "ENOENT")) {
        fail(4, ErrorCodes.FILESYSTEM_ERROR, String(err));
      }
    }
  }

  const cardArgs = { ...input, name, slug: toSlug };

  if (existing.type === "section") {
    await renameSectionFolder(artifactPath, cardArgs, fromSlug, toSlug, skipRewrite, existing);
  } else {
    await renameLeafCard(artifactPath, cardArgs, fromSlug, toSlug, skipRewrite, existing);
  }

  await rebuildManifest(artifactPath);
  success({ id: existing.id, slug: toSlug, manifestRebuilt: true });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

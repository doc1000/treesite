import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  appRoot,
  contentItemPath,
  parseArgs,
  readContentItem,
  rebuildGeneratedContent,
  requireArg,
  slugify,
  writeContentItem
} from "./content-utils.js";
import { applyCardFields } from "./card-fields.js";

/** Rewrite slug segments in /assets/ paths so previews and PDF paths stay consistent after re-slugging. */
function rewriteAssetPathsForSlug(item, oldSlug, newSlug) {
  if (oldSlug === newSlug) return;
  const keys = ["previewImage", "pdf", "image", "source"];
  for (const key of keys) {
    const v = item[key];
    if (typeof v !== "string" || !v.includes(oldSlug)) continue;
    if (!v.includes("/assets/") && !v.startsWith("/assets/")) continue;
    item[key] = v.split(oldSlug).join(newSlug);
  }
}

async function main() {
  const args = parseArgs();
  const fromSlug = requireArg(args, "from");

  const item = await readContentItem(fromSlug);

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

  const cardArgs = { ...args };
  delete cardArgs.from;
  delete cardArgs.to;
  delete cardArgs["new-slug"];
  delete cardArgs["rewrite-paths"];
  delete cardArgs.slug;

  applyCardFields(item, cardArgs, { allowIdentity: true });
  item.slug = toSlug;

  const skipRewrite =
    args["rewrite-paths"] === "false" || args["rewrite-paths"] === false;
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

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

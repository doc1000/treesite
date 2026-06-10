/**
 * Reparent a subtree root by slug: updates its section and rewrites descendant section paths.
 */
import fs from "node:fs/promises";
import process from "node:process";
import { applyContentItems, minimalSiteRoot } from "../../handler/src/contentItems.js";
import {
  contentItemsDir,
  parseArgs,
  readContentItems,
  rebuildGeneratedContent,
  requireArg,
  writeContentItem
} from "./content-utils.js";
import { buildSlugMaterializedMap, rewriteSectionPath } from "./tree-path-utils.js";

async function main() {
  await fs.mkdir(contentItemsDir, { recursive: true });

  const args = parseArgs();
  const slug = requireArg(args, "slug");
  const parentUnder = requireArg(args, "under-section");

  const items = await readContentItems();
  const moved = items.find(i => i.slug === slug);
  if (!moved) {
    throw new Error(`No item with slug "${slug}".`);
  }

  const tree = applyContentItems(minimalSiteRoot, items);
  const slugMap = {};
  buildSlugMaterializedMap(tree, [], slugMap);

  const oldMat = slugMap[slug];
  if (oldMat === undefined) {
    throw new Error(`Slug "${slug}" not found in merged tree (cannot resolve materialized path).`);
  }

  const parentSection = parentUnder.trim();
  const newMat =
    parentSection === "Home" ? moved.name : `${parentSection}/${moved.name}`;

  const nextItems = items.map(item => {
    if (item.slug === slug) {
      return { ...item, section: parentSection };
    }
    return {
      ...item,
      section: rewriteSectionPath(item.section, oldMat, newMat)
    };
  });

  for (const item of nextItems) {
    await writeContentItem(item.slug, item);
  }

  const count = await rebuildGeneratedContent();
  console.log(`Moved subtree root ${slug}`);
  console.log(`  old materialized path: ${oldMat}`);
  console.log(`  new materialized path: ${newMat}`);
  console.log(`  parent section field: ${parentSection}`);
  console.log(`Rebuilt generated content with ${count} items.`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exitCode = 1;
});

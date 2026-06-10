/**
 * Reparent a subtree root by id: updates its section and rewrites descendant section paths.
 */
import { applyContentItems, minimalSiteRoot } from "../../handler/src/contentItems.js";
import { ErrorCodes } from "./error-codes.js";
import {
  fail,
  loadItems,
  parseToolArgs,
  rebuildManifest,
  resolveItemTarget,
  success,
  writeItem
} from "./tool-runner.js";
import { buildSlugMaterializedMap, rewriteSectionPath } from "./tree-path-utils.js";

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const parentSection =
    typeof input.section === "string" ? input.section.trim() : "";
  if (!parentSection) {
    fail(1, ErrorCodes.INVALID_INPUT, 'Input must include non-empty "section" (parent).');
  }

  const items = await loadItems(artifactPath);
  const moved = await resolveItemTarget(items, input);

  const tree = applyContentItems(minimalSiteRoot, items);
  const slugMap = {};
  buildSlugMaterializedMap(tree, [], slugMap);

  const oldMat = slugMap[moved.slug];
  if (oldMat === undefined) {
    fail(3, ErrorCodes.ITEM_NOT_FOUND, `Item "${moved.slug}" not found in merged tree.`);
  }

  const newMat =
    parentSection === "Home" ? moved.name : `${parentSection}/${moved.name}`;

  const nextItems = items.map(item => {
    if (item.id === moved.id) {
      return { ...item, section: parentSection, id: item.id };
    }
    return {
      ...item,
      section: rewriteSectionPath(item.section, oldMat, newMat),
      id: item.id
    };
  });

  for (const item of nextItems) {
    await writeItem(artifactPath, item);
  }

  await rebuildManifest(artifactPath);
  success({ id: moved.id, section: parentSection, manifestRebuilt: true });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

import { ErrorCodes } from "./error-codes.js";
import { findManifestNodeById } from "./manifest-tree-utils.js";
import {
  fail,
  loadItems,
  loadManifest,
  parseToolArgs,
  success
} from "./tool-runner.js";

function resolveChildItems(manifestChildren, itemsById) {
  const children = [];
  for (const node of manifestChildren || []) {
    if (node.id && itemsById.has(node.id)) {
      children.push(itemsById.get(node.id));
    } else {
      children.push(node);
    }
  }
  return children;
}

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const parentId =
    input.id === null || input.id === undefined ? null : String(input.id).trim();

  if (parentId !== null && !parentId) {
    fail(1, ErrorCodes.INVALID_INPUT, 'Input "id" must be a UUID, null, or omitted for root.');
  }

  const manifest = await loadManifest(artifactPath);
  const parent = findManifestNodeById(manifest, parentId);
  if (!parent) {
    fail(3, ErrorCodes.ITEM_NOT_FOUND, `No manifest node with id '${input.id}' found.`);
  }

  const items = await loadItems(artifactPath);
  const itemsById = new Map(items.map(item => [item.id, item]));
  const children = resolveChildItems(parent.children, itemsById);

  success({ children });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

import { ErrorCodes } from "./error-codes.js";
import { findManifestNodeById, pruneSubtree } from "./manifest-tree-utils.js";
import { fail, loadManifest, parseToolArgs, success } from "./tool-runner.js";

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  if (typeof input.id !== "string" || !input.id.trim()) {
    fail(1, ErrorCodes.INVALID_INPUT, 'Input must include non-empty "id".');
  }

  const maxDepth =
    typeof input.maxDepth === "number" && input.maxDepth > 0
      ? Math.floor(input.maxDepth)
      : 3;

  const manifest = await loadManifest(artifactPath);
  const node = findManifestNodeById(manifest, input.id.trim());
  if (!node) {
    fail(3, ErrorCodes.ITEM_NOT_FOUND, `No manifest node with id '${input.id}' found.`);
  }

  success({ subtree: pruneSubtree(node, maxDepth) });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

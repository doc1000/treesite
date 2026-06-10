import { ErrorCodes } from "./error-codes.js";
import {
  fail,
  findItemById,
  loadItems,
  parseToolArgs,
  success
} from "./tool-runner.js";

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  if (typeof input.id !== "string" || !input.id.trim()) {
    fail(1, ErrorCodes.INVALID_INPUT, 'Input must include non-empty "id".');
  }

  const items = await loadItems(artifactPath);
  const item = findItemById(items, input.id.trim());
  if (!item) {
    fail(3, ErrorCodes.ITEM_NOT_FOUND, `No item with id '${input.id}' found in artifact.`);
  }

  success({ item });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

import { ErrorCodes } from "./error-codes.js";
import { removeAssociatedAssets } from "./artifact-assets.js";
import {
  deleteItem,
  fail,
  loadItems,
  parseToolArgs,
  rebuildManifest,
  resolveItemTarget,
  success
} from "./tool-runner.js";

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const confirm = input.confirm === true || input.yes === true;

  if (!confirm) {
    fail(
      1,
      ErrorCodes.INVALID_INPUT,
      'Deletion requires JSON input {"id":"…","confirm":true}.'
    );
  }

  const items = await loadItems(artifactPath);
  const item = await resolveItemTarget(items, input);
  const slug = item.slug;

  await removeAssociatedAssets(artifactPath, item, slug);
  await deleteItem(artifactPath, slug);
  await rebuildManifest(artifactPath);

  success({ id: item.id, slug, manifestRebuilt: true });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

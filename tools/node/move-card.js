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

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const section = typeof input.section === "string" ? input.section.trim() : "";
  if (!section) {
    fail(1, ErrorCodes.INVALID_INPUT, 'Input must include non-empty "section".');
  }

  const items = await loadItems(artifactPath);
  const existing = await resolveItemTarget(items, input);
  const item = { ...existing, section, id: existing.id };

  await writeItem(artifactPath, item);
  await rebuildManifest(artifactPath);

  success({ id: item.id, section: item.section, manifestRebuilt: true });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

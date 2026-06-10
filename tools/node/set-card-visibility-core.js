import process from "node:process";
import { canonicalSectionSubtreePrefix } from "../../handler/src/contentItems.js";
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

export async function setCardHidden(hidden) {
  const { artifactPath, input } = await parseToolArgs();
  const items = await loadItems(artifactPath);
  const existing = await resolveItemTarget(items, input);
  const item = { ...existing, hidden, id: existing.id };

  await writeItem(artifactPath, item);
  await rebuildManifest(artifactPath);

  if (item.type === "section") {
    const path = canonicalSectionSubtreePrefix(item, "Home");
    if (path) {
      process.stderr.write(
        hidden
          ? `Subtree paths under "${path}" are omitted from the site until this section is visible again.\n`
          : `Subtree paths under "${path}" can appear again.\n`
      );
    }
  }

  success({ id: item.id, hidden: item.hidden, manifestRebuilt: true });
}

export async function runVisibilityCli(hidden) {
  try {
    await setCardHidden(hidden);
  } catch (err) {
    fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
  }
}

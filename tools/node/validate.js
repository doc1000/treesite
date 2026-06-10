import fs from "node:fs/promises";
import path from "node:path";
import { applyContentItems } from "../../handler/src/contentItems.js";
import { ErrorCodes } from "./error-codes.js";
import { resolveArtifactAssetPath } from "./artifact-assets.js";
import {
  KNOWN_SCHEMA_VERSION,
  buildSiteRootFromArtifact,
  fail,
  loadArtifact,
  loadManifest,
  parseToolArgs,
  success,
  itemSchemaErrors
} from "./tool-runner.js";

const ASSET_PATH_FIELDS = ["pdf", "source", "url", "previewImage", "image", "embed", "href"];

function stableStringify(value) {
  return JSON.stringify(value);
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const strict = input.strict === true;

  const errors = [];
  const warnings = [];

  let meta;
  try {
    meta = await loadArtifact(artifactPath);
  } catch {
    return;
  }

  if (meta.schemaVersion > KNOWN_SCHEMA_VERSION) {
    fail(2, ErrorCodes.SCHEMA_VERSION_UNKNOWN, `Unknown schemaVersion ${meta.schemaVersion}.`, {
      schemaVersion: meta.schemaVersion
    });
  }

  if (meta.schemaVersion < KNOWN_SCHEMA_VERSION) {
    warnings.push({
      code: "SCHEMA_VERSION_UNKNOWN",
      message: `schemaVersion ${meta.schemaVersion} is below current ${KNOWN_SCHEMA_VERSION}`
    });
  }

  const itemsDir = path.join(artifactPath, "items");
  const entries = await fs.readdir(itemsDir, { withFileTypes: true });
  const items = [];
  const seenIds = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    let item;
    try {
      item = JSON.parse(await fs.readFile(path.join(itemsDir, entry.name), "utf8"));
    } catch (err) {
      errors.push({
        code: ErrorCodes.ARTIFACT_MALFORMED,
        file: entry.name,
        message: `Invalid JSON: ${err}`
      });
      continue;
    }

    const schemaErrs = itemSchemaErrors(item, entry.name);
    if (schemaErrs.length) {
      errors.push({
        code: ErrorCodes.ARTIFACT_MALFORMED,
        file: entry.name,
        message: schemaErrs.join("; ")
      });
      continue;
    }

    if (seenIds.has(item.id)) {
      errors.push({
        code: ErrorCodes.DUPLICATE_ID,
        itemId: item.id,
        message: `Duplicate id also used in ${seenIds.get(item.id)}`
      });
    } else {
      seenIds.set(item.id, entry.name);
    }

    items.push(item);

    for (const field of ASSET_PATH_FIELDS) {
      const val = item[field];
      if (typeof val !== "string" || !val.startsWith("assets/")) continue;
      const assetPath = resolveArtifactAssetPath(artifactPath, val);
      if (assetPath && !(await pathExists(assetPath))) {
        const issue = {
          code: ErrorCodes.ASSET_NOT_FOUND,
          itemId: item.id,
          field,
          path: val
        };
        if (strict) errors.push(issue);
        else warnings.push(issue);
      }
    }

    if (typeof item.section !== "string" || !item.section.trim()) {
      warnings.push({
        code: ErrorCodes.INVALID_INPUT,
        itemId: item.id,
        field: "section",
        message: "Missing or empty section"
      });
    }
  }

  let manifest;
  try {
    manifest = await loadManifest(artifactPath);
  } catch {
    return;
  }

  const siteRoot = buildSiteRootFromArtifact(meta);
  const expected = applyContentItems(siteRoot, items);

  if (stableStringify(expected) !== stableStringify(manifest)) {
    fail(2, ErrorCodes.MANIFEST_DRIFT, "manifest.json does not match rebuild_manifest on current items/.", {
      diffSummary: "manifest tree differs from derived tree"
    });
  }

  const valid = errors.length === 0;

  success({
    valid,
    errors,
    warnings
  });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

/**
 * Tree inspection: JSON contract on stdout; human-readable tree on stderr with --human.
 */
import {
  applyContentItems,
  collectHiddenSectionSubtreePrefixes,
  isContentItemExcludedFromSite,
  minimalSiteRoot
} from "../../handler/src/contentItems.js";
import { ErrorCodes } from "./error-codes.js";
import {
  buildSiteRootFromArtifact,
  fail,
  loadArtifact,
  loadItems,
  parseToolArgs,
  success
} from "./tool-runner.js";
import { buildSlugMaterializedMap } from "./tree-path-utils.js";

function emitCompactLines(tree) {
  /** @type {Array<{ depth: number, id: string | null, slug: string | null, name: string, type: string | null }>} */
  const out = [];
  function walk(node, depth) {
    if (node.slug || node.id) {
      out.push({
        depth,
        id: node.id ?? null,
        slug: node.slug ?? null,
        name: node.name,
        type: node.type ?? null
      });
    }
    for (const child of node.children || []) {
      walk(child, depth + 1);
    }
  }
  walk(tree, 0);
  return out;
}

function printText(node, indent = 0) {
  const pad = "  ".repeat(indent);
  const tag = node.slug
    ? `${node.name} (${node.slug}) [${node.type || "node"}]`
    : `${node.name}`;
  process.stderr.write(`${pad}${tag}\n`);
  for (const child of node.children || []) {
    printText(child, indent + 1);
  }
}

function checkFlat(items, slugMap, hiddenSubtreePrefixes) {
  const errors = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.slug)) errors.push(`duplicate slug in flat items: ${item.slug}`);
    seen.add(item.slug);
  }

  for (const item of items) {
    if (!item.slug || isContentItemExcludedFromSite(item, hiddenSubtreePrefixes)) continue;
    if (slugMap[item.slug] === undefined) {
      errors.push(`slug missing from merged tree: ${item.slug}`);
    }
  }

  return errors;
}

async function main() {
  const { artifactPath, input, flags } = await parseToolArgs();
  const meta = await loadArtifact(artifactPath);
  const items = await loadItems(artifactPath);
  const siteRoot = buildSiteRootFromArtifact(meta);
  const rootName = siteRoot.name;
  const hiddenSubtreePrefixes = collectHiddenSectionSubtreePrefixes(items, rootName);
  const tree = applyContentItems(siteRoot, items);
  const slugMap = {};
  buildSlugMaterializedMap(tree, [], slugMap);

  if (flags.has("check")) {
    const errs = checkFlat(items, slugMap, hiddenSubtreePrefixes);
    if (errs.length) {
      fail(3, ErrorCodes.INVALID_INPUT, "inspect-tree --check failed.", { errors: errs });
    }
    success({ check: "OK", lines: [] });
    return;
  }

  if (flags.has("card-index")) {
    const lines = emitCompactLines(tree).filter(line => line.slug);
    success({ lines });
    return;
  }

  const lines = emitCompactLines(tree);

  if (flags.has("human")) {
    process.stderr.write(`${tree.name}\n`);
    for (const child of tree.children || []) {
      printText(child, 1);
    }
  }

  success({ lines });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

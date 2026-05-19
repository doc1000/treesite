/**
 * Derivative tree snapshot: merges flat JSON items into minimal Home root (same as app).
 */
import process from "node:process";
import {
  applyContentItems,
  collectHiddenSectionSubtreePrefixes,
  isContentItemExcludedFromSite,
  minimalSiteRoot
} from "../src/contentItems.js";
import { readContentItems } from "./content-utils.js";
import { buildSlugMaterializedMap } from "./tree-path-utils.js";

function emitCardIndexFlat(tree) {
  /** @type {Array<{ slug: string, materializedPath: string, name: string, type: string | null }>} */
  const out = [];
  function walk(node, trailParts) {
    const parts = [...trailParts];
    if (node.slug) {
      out.push({
        slug: node.slug,
        materializedPath: parts.join("/"),
        name: node.name,
        type: node.type ?? null
      });
    }
    for (const child of node.children || []) {
      walk(child, [...parts, child.name]);
    }
  }
  walk(tree, []);
  out.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  return out;
}

function summarize(node, trailParts) {
  const parts = [...trailParts];
  const materializedPath = parts.join("/");
  const summary = {
    slug: node.slug ?? null,
    type: node.type ?? null,
    name: node.name,
    materializedPath,
    value: node.value ?? null,
    children: []
  };

  for (const child of node.children || []) {
    summary.children.push(summarize(child, [...parts, child.name]));
  }

  return summary;
}

function printText(node, indent = 0) {
  const pad = "  ".repeat(indent);
  const tag = node.slug
    ? `${node.name} (${node.slug}) [${node.type || "node"}] v=${node.value}`
    : `${node.name}`;
  console.log(`${pad}${tag}`);
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
  const args = process.argv.slice(2);
  const textMode = args.includes("--text") || args.includes("--human");
  const checkMode = args.includes("--check");
  const cardIndexMode = args.includes("--card-index");

  const items = await readContentItems();
  const rootName = minimalSiteRoot.name;
  const hiddenSubtreePrefixes = collectHiddenSectionSubtreePrefixes(items, rootName);
  const tree = applyContentItems(minimalSiteRoot, items);
  const slugMap = {};
  buildSlugMaterializedMap(tree, [], slugMap);

  const summary = summarize(tree, []);

  if (cardIndexMode) {
    const flat = emitCardIndexFlat(tree);
    console.log(JSON.stringify(flat, null, 2));
    return;
  }

  if (checkMode) {
    const errs = checkFlat(items, slugMap, hiddenSubtreePrefixes);
    if (errs.length) {
      console.error(errs.join("\n"));
      process.exitCode = 1;
      return;
    }
    console.log("inspect-tree --check: OK");
    return;
  }

  if (textMode) {
    console.log(`${tree.name}`);
    for (const child of tree.children || []) {
      printText(child, 1);
    }
    return;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(err.message || err);
  process.exitCode = 1;
});

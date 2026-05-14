# Scaffold migration (generated sections + Home root)

This document describes how navigational folders (“sections”) moved from hard-coded [`treesite-app/src/siteData.js`](treesite-app/src/siteData.js) into flat JSON under [`treesite-app/content/items/`](treesite-app/content/items), how the merged tree is built, and which CLI pathways operate on it.

## Authoritative vs derivative

| Layer | Role |
|-------|------|
| **`content/items/*.json`** | Authoritative records (cards + structural `section` rows). |
| **`treesite-app/src/generatedContentItems.js`** | Generated bundle from JSON (do not hand-edit). |
| **Merged tree** from [`applyContentItems`](treesite-app/src/contentItems.js) | Derivative runtime structure consumed by [`TreeSite`](treesite-app/src/TreeSite.jsx). |
| **`npm run inspect:tree`** output | Derivative snapshot for debugging and validation—never edited as source of truth. |

The visual root node is **`Home`** ([`minimalSiteRoot`](treesite-app/src/contentItems.js)). Items attached directly under Home use **`section: "Home"`** (the leading segment matching `Home` is stripped when resolving paths).

## Content type: `section`

Structural folders use **`type: "section"`** with required **`slug`**, **`name`**, **`section`** (parent path), optional **`description`**, **`value`** (ordering + weight), **`color`**, **`hidden`**. No URL fields.

Sibling order at **all depths** follows **`value`** descending, then **`name`** (see [`compareSiblingOrder`](treesite-app/src/contentItems.js) and [`TreeSite.jsx`](treesite-app/src/TreeSite.jsx) `siblingSortComparator`). There is **no** separate `rootOrder` array.

## Merge algorithm (`applyContentItems`)

1. Clone [`minimalSiteRoot`](treesite-app/src/contentItems.js).
2. Insert all **`section`** rows first, sorted by parent-path depth, then `value`, then name.
3. Insert leaf rows (PDFs, websites, text, etc.).
4. When placing a section on an existing stub with the same **`name`** or **`slug`**, **preserve existing `children`** so nested content is kept.
5. Recursively sort each node’s **`children`** array by `value` then name.

Folder tiles render via [`MinimalTile`](treesite-app/src/tileTemplates.jsx) when **`node.type === "section"`**.

## CLI pathways

| Script | Purpose |
|--------|---------|
| **`npm run migrate:scaffold`** | One-time (or skip-if-present) emitter for legacy scaffold rows from embedded tree snapshot. Safe to re-run: skips JSON files that already exist. |
| **`npm run rebuild:site-data`** | Regenerate `generatedContentItems.js` from `content/items`. |
| **`npm run inspect:tree`** | Print merged tree JSON (default). **`--text`** / **`--human`**: indented outline. **`--check`**: duplicate slugs / missing slug map → exit `1`. |
| **`npm run move:subtree -- --slug <slug> --under-section "<ParentPath>|Home"`** | Repositions subtree root + rewrites descendant **`section`** prefixes using materialized paths from merge. |
| **`npm run move:card`** | Single-card **`section`** update only (no subtree rewrite). |
| **`npm run rename:card`** | **`type: "section"`**: resolves materialized path from merge, replaces **last segment** with new **`--name`** when it changes, and **rewrites every item’s `section`** with boundary-safe prefix replace (`tree-path-utils.js`, same rules as **`move-subtree`**). Slug/file rename + **`rewrite-paths`** asset URL rewrite unchanged. **Non-section** cards: single-file rename/update only (no cascade). **`rewrite-paths=false`** skips **asset** rewrites only; section cascade still runs when the folder **`name`** changes. |
| **`npm run add:card`** / **`npm run edit:card`** | Include **`--type section`**, **`--color ...`**, **`--value ...`** as needed. |

## Risks

- **`section`** paths are strings; subtree moves rely on boundary-safe prefix replacement (`move-subtree.js`, [`tree-path-utils.js`](treesite-app/scripts/tree-path-utils.js)).
- **`value`** simultaneously affects treemap sibling sort and authored ordering—adjust deliberately.
- If a **`section`** folder **`name`** was updated earlier **without** cascading **`section`** paths, merge **`oldMat`** follows **today’s `name`** while descendants may still use an **older path prefix**, so **`rename:card`** might not fix orphans automatically. Recover by briefly **`edit:card`** back to the **old title**, then **`rename:card`** again with the desired **`--name`**, or bulk-edit **`section`** strings under **`content/items/`**.

## Related files

- [`treesite-app/src/contentItems.js`](treesite-app/src/contentItems.js) — merge + `minimalSiteRoot`
- [`treesite-app/scripts/migrate-scaffold-from-site-data.js`](treesite-app/scripts/migrate-scaffold-from-site-data.js)
- [`treesite-app/scripts/inspect-tree.js`](treesite-app/scripts/inspect-tree.js)
- [`treesite-app/scripts/move-subtree.js`](treesite-app/scripts/move-subtree.js)
- [`treesite-app/scripts/tree-path-utils.js`](treesite-app/scripts/tree-path-utils.js) — shared **`rewriteSectionPath`** / **`buildSlugMaterializedMap`**
- [`treesite-app/scripts/rename-card.js`](treesite-app/scripts/rename-card.js)
- [`treesite-app/scripts/content-utils.js`](treesite-app/scripts/content-utils.js) — validation (`section` type)

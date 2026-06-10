/**
 * Materialized paths under Home (no leading "Home/" segment).
 * Consumed by the app bundle and scripts (see scripts/tree-path-utils.js).
 */

/** Mutates `out` map slug -> materialized path from tree root (omit Home name). */
export function buildSlugMaterializedMap(node, trailParts, out) {
  const parts = [...trailParts];
  if (node.slug) {
    out[node.slug] = parts.join("/");
  }
  for (const child of node.children || []) {
    buildSlugMaterializedMap(child, [...parts, child.name], out);
  }
}

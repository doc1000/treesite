/**
 * Materialized paths under Home (no leading "Home/" segment).
 */

export function rewriteSectionPath(section, oldMat, newMat) {
  if (!oldMat || oldMat === newMat) return section;
  if (section === oldMat) return newMat;
  const prefix = `${oldMat}/`;
  if (section.startsWith(prefix)) {
    return `${newMat}/${section.slice(prefix.length)}`;
  }
  return section;
}

/** Replace the last segment of a slash-separated path with newLeafName. */
export function replaceLastSegment(materializedPath, newLeafName) {
  const trimmed = materializedPath.trim();
  if (!trimmed) return newLeafName;
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 0) return newLeafName;
  parts[parts.length - 1] = newLeafName;
  return parts.join("/");
}

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

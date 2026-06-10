/**
 * Materialized paths under Home (no leading "Home/" segment).
 * Re-exports slug map from shared app source — keep imports via this file so scripts resolve once.
 */

export { buildSlugMaterializedMap } from "../../handler/src/treePaths.js";

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

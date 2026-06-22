/**
 * Pure helpers for mini-map layout and navigation (testable without React).
 */

export function defaultGetNodeId(data) {
  return data?.id ?? data?.name ?? "";
}

export function findNodeInTree(node, id, getNodeId = defaultGetNodeId) {
  if (!node || id == null || id === "") return null;
  if (getNodeId(node) === id) return node;
  for (const child of node.children ?? []) {
    const found = findNodeInTree(child, id, getNodeId);
    if (found) return found;
  }
  return null;
}

/** Tree root used for squarified layout at the current mini-map drill. */
export function layoutTreeAtDrill(fullTree, drillId, getNodeId = defaultGetNodeId) {
  if (!fullTree) return null;
  if (!drillId) return fullTree;
  const node = findNodeInTree(fullTree, drillId, getNodeId);
  if (!node) return fullTree;
  if (node.children?.length) return node;
  return node;
}

export function nodeDisplayName(data) {
  if (!data) return "";
  return data.title || data.displayName || data.name || data.slug || "Untitled";
}

/**
 * In explore mode, first activation must not open the main map (only Go does).
 */
export function shouldNavigateMainOnCellClick(navMode, isRepeatClick) {
  if (navMode === "explore") return false;
  return isRepeatClick;
}

export function captionForModes({ labelMode, hoverName, selectedName }) {
  if (labelMode === "off") return "";
  if (labelMode === "hover") return hoverName || selectedName || "";
  if (labelMode === "select") return selectedName || "";
  return hoverName || selectedName || "";
}

/**
 * Traverse manifest trees produced by applyContentItems (nodes may include `id` from items).
 */

export function findManifestNodeById(tree, id) {
  if (id === null || id === undefined) {
    return tree;
  }
  const target = String(id);
  let found = null;
  function walk(node) {
    if (found) return;
    if (node.id === target) {
      found = node;
      return;
    }
    for (const child of node.children || []) {
      walk(child);
    }
  }
  walk(tree);
  return found;
}

export function pruneSubtree(node, maxDepth, depth = 0) {
  if (maxDepth <= 0 || depth >= maxDepth) {
    const { children, ...rest } = node;
    return { ...rest, children: [] };
  }
  return {
    ...node,
    children: (node.children || []).map(child => pruneSubtree(child, maxDepth, depth + 1))
  };
}

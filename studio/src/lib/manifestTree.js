export function findParentId(root, targetId) {
  if (!root || !targetId) return null;
  function walk(node, parentId) {
    if (node.id === targetId) return parentId;
    const nextParent = node.id ?? parentId;
    for (const child of node.children ?? []) {
      const found = walk(child, nextParent);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const result = walk(root, null);
  return result === undefined ? null : result;
}

export function findNodeById(node, id) {
  if (!node || !id) return null;
  if (node.id === id) return node;
  const kids = node.children ?? [];
  for (const child of kids) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

export function buildBreadcrumb(manifest, nodeId) {
  const parts = [];
  const target = nodeId ? findNodeById(manifest, nodeId) : null;
  if (manifest.displayName || manifest.name) {
    parts.push(manifest.displayName || manifest.name);
  }
  if (target?.section) {
    const segs = target.section.split("/").filter(Boolean);
    for (const seg of segs) {
      if (!parts.includes(seg)) parts.push(seg);
    }
  }
  if (target?.name && !parts.includes(target.name)) {
    parts.push(target.name);
  }
  return parts.join(" / ");
}

export function typeBadgeClass(type) {
  switch (type) {
    case "section":
      return "b-purple";
    case "text":
      return "b-green";
    case "website":
      return "b-blue";
    case "pdf":
      return "b-orange";
    case "html":
      return "b-yellow";
    default:
      return "b-blue";
  }
}

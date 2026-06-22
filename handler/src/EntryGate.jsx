import "./treesite.css";

/** Full-viewport landing before treemap when an item has entryGate. */
export default function EntryGate({ meta, entryNode, onEnter }) {
  const title = meta?.displayName || entryNode?.name || "Welcome";
  const tagline = meta?.tagline || "";
  const body =
    entryNode?.description ||
    entryNode?.abstract ||
    "Click anywhere to enter.";

  return (
    <div
      className="treesite-entry-gate"
      role="button"
      tabIndex={0}
      onClick={onEnter}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEnter();
        }
      }}
    >
      <div className="treesite-entry-gate__inner">
        <h1>{title}</h1>
        {tagline ? <p className="treesite-entry-gate__tagline">{tagline}</p> : null}
        <p className="treesite-entry-gate__body">{body}</p>
        <p className="treesite-entry-gate__hint">Click anywhere to enter</p>
      </div>
    </div>
  );
}

export function findEntryGateNode(siteData) {
  if (!siteData) return null;
  let found = null;
  function walk(node, depth) {
    if (found || !node) return;
    if (node.entryGate && depth <= 2) {
      found = node;
      return;
    }
    for (const child of node.children ?? []) {
      walk(child, depth + 1);
    }
  }
  walk(siteData, 0);
  return found;
}

export function entryGateStorageKey(artifactBase) {
  const base = String(artifactBase || "default").replace(/\/$/, "");
  return `treesite.entryGate.dismiss:${base}`;
}

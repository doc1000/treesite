/**
 * Studio MiniMap — thin wrapper around the shared TreesiteMap component.
 *
 * The shared module does all layout + rendering. This wrapper adapts the
 * studio's manifest format and selection model to the shared interface.
 */
import TreesiteMap from "treesite-map";

export default function MiniMap({
  manifest,
  focusNodeId,
  selectedNodeId,
  onSelectNode,
  onSetFocus,
}) {
  if (!manifest?.children?.length) {
    return (
      <section className="minimap-wrap">
        <div className="minimap-title">Mini-map</div>
        <div className="minimap" style={{ display: "grid", placeItems: "center", height: 72, fontSize: 11, color: "var(--muted)" }}>
          No sections yet
        </div>
      </section>
    );
  }

  function handleSelect(id) {
    if (id === null) {
      // Star / home clicked
      onSetFocus?.(null);
      onSelectNode?.(null);
    } else {
      onSelectNode?.(id);
      // If the node has children, also set focus
      const node = findNodeById(manifest, id);
      if (node?.children?.length) onSetFocus?.(id);
    }
  }

  function handleOpen(id) {
    // Second activation: focus into this node
    onSetFocus?.(id);
  }

  return (
    <section className="minimap-wrap">
      <div className="minimap-title">Mini-map</div>
      <TreesiteMap
        tree={manifest}
        getNodeId={(data) => data.id}
        selectedId={selectedNodeId}
        focusId={focusNodeId}
        goldenPath={[]}
        labels={false}
        onSelect={handleSelect}
        onOpen={handleOpen}
        width={220}
        height={72}
      />
      <div className="mini-controls">
        <button type="button" onClick={() => onSetFocus?.(null)}>⌂ Root</button>
        {focusNodeId && (
          <span style={{ fontSize: 11 }}>
            {findNodeById(manifest, focusNodeId)?.name || focusNodeId}
          </span>
        )}
      </div>
    </section>
  );
}

function findNodeById(node, id) {
  if (!id) return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

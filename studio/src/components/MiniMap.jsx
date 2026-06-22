/**
 * Studio MiniMap — thin wrapper around the shared TreesiteMap component.
 */
import { useCallback, useState } from "react";
import TreesiteMap from "treesite-map";
import {
  readMinimapLabelMode,
  readMinimapNavMode,
  writeMinimapLabelMode,
  writeMinimapNavMode,
  NAV_MODES,
  LABEL_MODES,
} from "treesite-map/minimap-prefs.js";

export default function MiniMap({
  manifest,
  focusNodeId,
  selectedNodeId,
  onSelectNode,
  onSetFocus,
}) {
  const [navMode, setNavMode] = useState(() => readMinimapNavMode());
  const [labelMode, setLabelMode] = useState(() => readMinimapLabelMode());
  const [minimapDrillId, setMinimapDrillId] = useState(null);
  const [minimapSelectedId, setMinimapSelectedId] = useState(null);

  const effectiveSelected =
    navMode === "explore" ? minimapSelectedId ?? selectedNodeId : selectedNodeId;

  const handleSelect = useCallback(
    (id) => {
      if (id === null) {
        setMinimapDrillId(null);
        setMinimapSelectedId(null);
        onSetFocus?.(null);
        onSelectNode?.(null);
        return;
      }
      if (navMode === "explore") {
        setMinimapSelectedId(id);
        onSelectNode?.(id);
        return;
      }
      onSelectNode?.(id);
    },
    [navMode, onSelectNode, onSetFocus],
  );

  const handleOpen = useCallback(
    (id) => {
      if (navMode === "click-jump") {
        onSetFocus?.(id);
      }
    },
    [navMode, onSetFocus],
  );

  const handleGo = useCallback(
    (id) => {
      onSelectNode?.(id);
      onSetFocus?.(id);
    },
    [onSelectNode, onSetFocus],
  );

  const handleDrill = useCallback((id) => {
    setMinimapDrillId(id);
  }, []);

  if (!manifest?.children?.length) {
    return (
      <section className="minimap-wrap">
        <div className="minimap-title">Mini-map</div>
        <div
          className="minimap"
          style={{
            display: "grid",
            placeItems: "center",
            height: 72,
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          No sections yet
        </div>
      </section>
    );
  }

  return (
    <section className="minimap-wrap">
      <div className="minimap-title">Mini-map</div>
      <div className="minimap" style={{ position: "relative" }}>
        <TreesiteMap
          tree={manifest}
          getNodeId={(data) => data.id}
          selectedId={effectiveSelected}
          focusId={focusNodeId}
          drillId={navMode === "explore" ? minimapDrillId : null}
          onDrillChange={handleDrill}
          navMode={navMode}
          labelMode={labelMode}
          onSelect={handleSelect}
          onOpen={handleOpen}
          onGo={handleGo}
          onHome={() => {
            setMinimapDrillId(null);
            setMinimapSelectedId(null);
          }}
          goldenPath={[]}
          labels={false}
          width={220}
          height={72}
        />
      </div>
      <div className="mini-controls mini-controls--prefs">
        <label style={{ fontSize: 10, color: "var(--muted)", display: "flex", gap: 4, alignItems: "center" }}>
          Nav
          <select
            value={navMode}
            onChange={(e) => {
              const v = e.target.value;
              if (!NAV_MODES.includes(v)) return;
              setNavMode(v);
              writeMinimapNavMode(v);
              setMinimapDrillId(null);
            }}
            style={{ fontSize: 10, maxWidth: 100 }}
          >
            <option value="explore">Explore + Go</option>
            <option value="click-jump">Click-jump</option>
          </select>
        </label>
        <label style={{ fontSize: 10, color: "var(--muted)", display: "flex", gap: 4, alignItems: "center" }}>
          Label
          <select
            value={labelMode}
            onChange={(e) => {
              const v = e.target.value;
              if (!LABEL_MODES.includes(v)) return;
              setLabelMode(v);
              writeMinimapLabelMode(v);
            }}
            style={{ fontSize: 10, maxWidth: 72 }}
          >
            <option value="hover">Hover</option>
            <option value="select">Select</option>
            <option value="off">Off</option>
          </select>
        </label>
      </div>
      <div className="mini-controls">
        <button type="button" onClick={() => handleSelect(null)}>
          ⌂ Root
        </button>
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

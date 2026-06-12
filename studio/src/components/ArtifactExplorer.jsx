import { useCallback, useEffect, useRef, useState } from "react";
import { INTENTS } from "../nav/intents.js";
import ManifestTreeView from "./ManifestTreeView.jsx";

function FileTree({ files, focusIndex, onFocusIndex }) {
  if (!files?.length) {
    return (
      <p style={{ color: "var(--muted)", padding: "8px 4px", fontSize: 12 }}>
        No files loaded.
      </p>
    );
  }
  return (
    <ul className="file-list">
      {files.map((entry, index) => (
        <li
          key={entry.path}
          role="button"
          tabIndex={index === focusIndex ? 0 : -1}
          className={index === focusIndex ? "nav-focus" : ""}
          onFocus={() => onFocusIndex?.(index)}
          style={{ paddingLeft: entry.type === "dir" ? 0 : 12, fontSize: 12 }}
        >
          {entry.type === "dir" ? `📁 ${entry.path}` : `📄 ${entry.path}`}
        </li>
      ))}
    </ul>
  );
}

export default function ArtifactExplorer({
  manifest,
  explorerView,
  onExplorerViewChange,
  selectedNodeId,
  onSelectNode,
  expandedNodeIds,
  onToggleExpanded,
  artifacts,
  selectedArtifact,
  onSelectArtifact,
  files,
  hiddenItems,
  navigation,
}) {
  const explorerBodyRef = useRef(null);
  const [fileFocusIndex, setFileFocusIndex] = useState(0);

  const focusFileRow = useCallback(
    (index) => {
      const items = explorerBodyRef.current?.querySelectorAll(".file-list li[tabindex]");
      if (!items?.length) return;
      const i = ((index % items.length) + items.length) % items.length;
      setFileFocusIndex(i);
      items[i]?.focus?.({ preventScroll: true });
    },
    [],
  );

  const handleFilesystemIntent = useCallback(
    (intent) => {
      const items = explorerBodyRef.current?.querySelectorAll(".file-list li[tabindex]");
      const count = items?.length ?? 0;
      if (!count) return;
      if (intent === INTENTS.UP) focusFileRow(fileFocusIndex - 1);
      if (intent === INTENTS.DOWN) focusFileRow(fileFocusIndex + 1);
    },
    [fileFocusIndex, focusFileRow],
  );

  useEffect(() => {
    if (!navigation || explorerView !== "filesystem") return undefined;
    navigation.registerZone("explorer", {
      onIntent: handleFilesystemIntent,
      focus: () => focusFileRow(fileFocusIndex),
    });
    return () => navigation.unregisterZone("explorer");
  }, [navigation, explorerView, handleFilesystemIntent, focusFileRow, fileFocusIndex]);

  return (
    <>
      <div className="panel-header">
        <h2>View</h2>
        <span aria-hidden="true">↻ ⌖</span>
      </div>

      {artifacts?.length > 0 && (
        <select
          value={selectedArtifact || ""}
          onChange={(e) => onSelectArtifact?.(e.target.value)}
          style={{
            width: "100%",
            background: "var(--bg2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "3px 6px",
            marginBottom: 6,
            fontSize: 12,
          }}
        >
          {artifacts.map((a) => (
            <option key={a.name} value={a.name}>
              {a.displayName || a.name}
              {a.itemCount ? ` (${a.itemCount})` : ""}
            </option>
          ))}
        </select>
      )}

      <div className="toggle">
        <button
          type="button"
          className={explorerView === "filesystem" ? "active" : ""}
          onClick={() => onExplorerViewChange("filesystem")}
        >
          File System
        </button>
        <button
          type="button"
          className={explorerView === "json" ? "active" : ""}
          onClick={() => onExplorerViewChange("json")}
        >
          JSON Tree
        </button>
      </div>

      <input className="search" placeholder="Search artifacts or manifest..." readOnly />

      <div className="explorer-body" ref={explorerBodyRef}>
        {explorerView === "filesystem" ? (
          <FileTree files={files} focusIndex={fileFocusIndex} onFocusIndex={setFileFocusIndex} />
        ) : (
          <ManifestTreeView
            manifest={manifest}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            expandedNodeIds={expandedNodeIds}
            onToggleExpanded={onToggleExpanded}
            navigation={navigation}
            hiddenItems={hiddenItems}
          />
        )}
      </div>
    </>
  );
}

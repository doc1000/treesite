import ManifestTreeView from "./ManifestTreeView.jsx";

function FileTree({ files }) {
  if (!files?.length) {
    return (
      <p style={{ color: "var(--muted)", padding: "8px 4px", fontSize: 12 }}>
        No files loaded.
      </p>
    );
  }
  return (
    <ul className="file-list">
      {files.map((entry) => (
        <li
          key={entry.path}
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
}) {
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

      <div className="explorer-body">
        {explorerView === "filesystem" ? (
          <FileTree files={files} />
        ) : (
          <ManifestTreeView
            manifest={manifest}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            expandedNodeIds={expandedNodeIds}
            onToggleExpanded={onToggleExpanded}
          />
        )}
      </div>
    </>
  );
}

import ManifestTreeView from "./ManifestTreeView.jsx";

const FILE_SYSTEM_PLACEHOLDER = [
  "artifact.json",
  "manifest.json",
  "items/",
  "items/text-card-example.json",
  "items/website-card-example.json",
  "assets/",
  "schemes/",
];

export default function ArtifactExplorer({
  manifest,
  explorerView,
  onExplorerViewChange,
  selectedNodeId,
  onSelectNode,
  expandedNodeIds,
  onToggleExpanded,
}) {
  return (
    <>
      <div className="panel-header">
        <h2>View</h2>
        <span aria-hidden="true">↻ ⌖</span>
      </div>
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
          <ul className="file-list">
            {FILE_SYSTEM_PLACEHOLDER.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
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

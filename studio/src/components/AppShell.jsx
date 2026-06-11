import TopCommandBar from "./TopCommandBar.jsx";
import ArtifactExplorer from "./ArtifactExplorer.jsx";
import MiniMap from "./MiniMap.jsx";
import TreemapWorkspace from "./TreemapWorkspace.jsx";
import RightToolPanel from "./RightToolPanel.jsx";
import StatusBar from "./StatusBar.jsx";

const RAIL_ITEMS = [
  { icon: "🛠", label: "Tools", active: true },
  { icon: "▣", label: "Content" },
  { icon: "⌘", label: "Components" },
  { icon: "◉", label: "Data" },
  { icon: "▧", label: "Assets" },
  { icon: "👁", label: "Preview" },
  { icon: "?", label: "Help" },
];

export default function AppShell({
  manifest,
  selectedNodeId,
  selectedNode,
  nodeItem,
  onSelectNode,
  expandedNodeIds,
  onToggleExpanded,
  explorerView,
  onExplorerViewChange,
  artifacts,
  selectedArtifact,
  onSelectArtifact,
  stats,
  files,
  loading,
  focusNodeId,
  onSetFocus,
}) {
  const artifactLabel = manifest.displayName || manifest.name || "Artifact";

  const validationLabel = stats
    ? `${stats.itemCount} items · ${stats.sectionCount} sections · ${stats.leafCount} leaves`
    : "Not validated (no artifact loaded)";

  return (
    <div className="app-shell">
      <aside className="shell-panel brand">
        <h1>TreeSite Studio</h1>
        <p>{artifactLabel} — artifact deployer + editor</p>
        {artifacts?.length > 0 && (
          <select
            value={selectedArtifact || ""}
            onChange={(e) => onSelectArtifact(e.target.value)}
            style={{
              marginTop: 8,
              width: "100%",
              background: "var(--bg2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "3px 6px",
            }}
          >
            {artifacts.map((a) => (
              <option key={a.name} value={a.name}>
                {a.displayName || a.name}
              </option>
            ))}
          </select>
        )}
        {loading && (
          <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>Loading…</p>
        )}
      </aside>

      <TopCommandBar className="shell-panel topbar" />

      <nav className="shell-panel rail" aria-label="Right ribbon tools">
        <div className="triangle" title="Joydrive focus marker" />
        {RAIL_ITEMS.map((item) => (
          <div key={item.label} className={`rail-button${item.active ? " active" : ""}`}>
            <b>{item.icon}</b>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      <aside className="shell-panel left-panel">
        <ArtifactExplorer
          manifest={manifest}
          explorerView={explorerView}
          onExplorerViewChange={onExplorerViewChange}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          expandedNodeIds={expandedNodeIds}
          onToggleExpanded={onToggleExpanded}
          artifacts={artifacts}
          selectedArtifact={selectedArtifact}
          onSelectArtifact={onSelectArtifact}
          files={files}
        />
        <MiniMap
          manifest={manifest}
          focusNodeId={focusNodeId}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onSetFocus={onSetFocus}
        />
      </aside>

      <main className="shell-panel center-column">
        <div className="tabs">
          <button type="button" className="tab">👁 {artifactLabel} (View)</button>
          <button type="button" className="tab active">✎ {artifactLabel} (Edit)</button>
          <span style={{ color: "var(--muted)", paddingLeft: 4 }}>+</span>
          <div className="toolbar">
            <button type="button">View Mode</button>
            <button type="button" className="mode">Edit Mode</button>
            <button type="button" className="active">Treemap</button>
            <button type="button">List</button>
            <button type="button">⌕</button>
            <button type="button">⛶</button>
          </div>
        </div>
        <TreemapWorkspace
          manifest={manifest}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          focusNodeId={focusNodeId}
          onSetFocus={onSetFocus}
        />
        <StatusBar deployStatus="idle" validationStatus={validationLabel} />
      </main>

      <aside className="shell-panel right-panel">
        <RightToolPanel selectedNode={selectedNode} nodeItem={nodeItem} />
      </aside>
    </div>
  );
}

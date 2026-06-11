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
  onSelectNode,
  expandedNodeIds,
  onToggleExpanded,
  explorerView,
  onExplorerViewChange,
}) {
  const artifactLabel = manifest.displayName || manifest.name || "Artifact";

  return (
    <div className="app-shell">
      <aside className="shell-panel brand">
        <h1>TreeSite Studio</h1>
        <p>{artifactLabel} — artifact deployer + editor</p>
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
        />
        <MiniMap manifest={manifest} sections={manifest.children ?? []} />
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
        />
        <StatusBar deployStatus="idle" validationStatus="Not validated (sample data)" />
      </main>

      <aside className="shell-panel right-panel">
        <RightToolPanel selectedNode={selectedNode} />
      </aside>
    </div>
  );
}

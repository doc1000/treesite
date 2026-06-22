import { useCallback } from "react";
import TopCommandBar from "./TopCommandBar.jsx";
import ArtifactExplorer from "./ArtifactExplorer.jsx";
import MiniMap from "./MiniMap.jsx";
import TreemapWorkspace from "./TreemapWorkspace.jsx";
import RightToolPanel from "./RightToolPanel.jsx";
import StatusBar from "./StatusBar.jsx";
import ValidationPanel from "./ValidationPanel.jsx";
import { useNavigation } from "../nav/useNavigation.js";
import { useGamepad } from "../nav/gamepad.js";
import { useDispatch, useStore } from "../state/studioStore.jsx";

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
  hiddenItems,
  loading,
  focusNodeId,
  onSetFocus,
  handlerDistReady,
  validationResult,
  showValidationPanel,
  onToggleValidationPanel,
  onCloseValidationPanel,
  commandBarProps,
  refreshArtifact,
}) {
  const { appError, onDismissError } = commandBarProps ?? {};
  const dispatch = useDispatch();
  const { inputMode } = useStore();

  const onActiveZoneChange = useCallback(
    (id) => dispatch({ type: "SET_ACTIVE_ZONE", payload: id }),
    [dispatch],
  );

  const navigation = useNavigation({ onActiveZoneChange });

  useGamepad({
    enabled: inputMode === "controller",
    onIntent: navigation.dispatchIntent,
  });

  const artifactLabel = manifest.displayName || manifest.name || "Artifact";
  const selectedMeta = artifacts?.find((a) => a.name === selectedArtifact);
  const activeZoneId = navigation.activeZoneId;

  return (
    <div className="app-shell">
      <aside className="shell-panel brand">
        <h1>TreeSite Studio</h1>
        <p>{artifactLabel} — artifact editor</p>
        {artifacts?.length > 0 && (
          <select
            id="artifact-select"
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
        {appError && (
          <div style={{ marginTop: 8, background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: 6, padding: "6px 10px", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: "var(--red)", fontSize: 12, flex: 1, wordBreak: "break-word" }}>{appError}</span>
            <button type="button" onClick={onDismissError} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0, fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
        )}
      </aside>

      <TopCommandBar
        className="shell-panel topbar"
        {...commandBarProps}
        navigation={navigation}
        zoneActive={activeZoneId === "topbar"}
      />

      <aside
        className={`shell-panel left-panel${activeZoneId === "explorer" ? " zone-active" : ""}`}
      >
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
          hiddenItems={hiddenItems}
          navigation={navigation}
        />
        <MiniMap
          manifest={manifest}
          focusNodeId={focusNodeId}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onSetFocus={onSetFocus}
        />
      </aside>

      <main
        className={`shell-panel center-column${activeZoneId === "treemap" ? " zone-active" : ""}`}
      >
        <div className="tabs">
          <button type="button" className="tab active" aria-current="page">
            ✎ {artifactLabel} (Treemap)
          </button>
        </div>
        <div className="center-body">
          <TreemapWorkspace
            manifest={manifest}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            focusNodeId={focusNodeId}
            onSetFocus={onSetFocus}
            navigation={navigation}
          />
          {showValidationPanel && validationResult && (
            <ValidationPanel result={validationResult} onClose={onCloseValidationPanel} />
          )}
        </div>
        <StatusBar
          handlerDistReady={handlerDistReady}
          selectedArtifact={selectedArtifact}
          validationResult={validationResult}
          artifactName={selectedMeta?.displayName || selectedArtifact}
          itemCount={stats?.itemCount ?? selectedMeta?.itemCount}
          onToggleValidation={onToggleValidationPanel}
        />
      </main>

      <aside className="shell-panel right-panel">
        <RightToolPanel
          selectedArtifact={selectedArtifact}
          selectedNodeId={selectedNodeId}
          nodeItem={nodeItem}
          manifest={manifest}
          refreshArtifact={refreshArtifact}
          navigation={navigation}
          zoneActive={activeZoneId === "toolpanel"}
        />
      </aside>
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from "react";
import manifestSample from "./sample/manifest.sample.js";
import AppShell from "./components/AppShell.jsx";
import { findNodeById } from "./lib/manifestTree.js";
import { listArtifacts, getManifest, getStats, getNode, listFiles } from "./api/client.js";
import { useStore, useDispatch } from "./state/studioStore.jsx";

export default function App() {
  const { selectedArtifact, selectedNodeId, expandedNodeIds, viewport } = useStore();
  const dispatch = useDispatch();

  const [artifacts, setArtifacts] = useState([]);
  const [manifest, setManifest] = useState(manifestSample);
  const [stats, setStats] = useState(null);
  const [nodeItem, setNodeItem] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [explorerView, setExplorerView] = useState("json");

  // Load artifact list on mount
  useEffect(() => {
    listArtifacts()
      .then((list) => {
        setArtifacts(list);
        if (!selectedArtifact && list.length > 0) {
          dispatch({ type: "SELECT_ARTIFACT", payload: list[0].name });
        }
      })
      .catch((err) => console.error("listArtifacts:", err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load manifest + stats + files when selected artifact changes
  useEffect(() => {
    if (!selectedArtifact) return;
    setLoading(true);
    Promise.all([
      getManifest(selectedArtifact),
      getStats(selectedArtifact),
      listFiles(selectedArtifact),
    ])
      .then(([m, s, f]) => {
        setManifest(m);
        setStats(s);
        setFiles(f);
        const initialExpanded = [
          "root",
          ...(m.children ?? []).map((c) => c.id).filter(Boolean),
        ];
        dispatch({ type: "SET_EXPANDED_MANY", payload: initialExpanded });
      })
      .catch((err) => console.error("load artifact:", err))
      .finally(() => setLoading(false));
  }, [selectedArtifact]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch get-node payload when selection changes
  useEffect(() => {
    if (!selectedArtifact || !selectedNodeId) {
      setNodeItem(null);
      return;
    }
    getNode(selectedArtifact, selectedNodeId)
      .then(setNodeItem)
      .catch(() => setNodeItem(null));
  }, [selectedArtifact, selectedNodeId]);

  const selectedNode = useMemo(
    () => findNodeById(manifest, selectedNodeId),
    [manifest, selectedNodeId],
  );

  const handleSelectNode = useCallback(
    (id) => dispatch({ type: "SELECT_NODE", payload: id }),
    [dispatch],
  );

  const handleToggleExpanded = useCallback(
    (id) => dispatch({ type: "TOGGLE_EXPANDED", payload: id }),
    [dispatch],
  );

  const handleSelectArtifact = useCallback(
    (name) => dispatch({ type: "SELECT_ARTIFACT", payload: name }),
    [dispatch],
  );

  const handleSetFocus = useCallback(
    (id) => dispatch({ type: "SET_FOCUS", payload: id }),
    [dispatch],
  );

  return (
    <AppShell
      manifest={manifest}
      selectedNodeId={selectedNodeId}
      selectedNode={selectedNode}
      nodeItem={nodeItem}
      onSelectNode={handleSelectNode}
      expandedNodeIds={expandedNodeIds}
      onToggleExpanded={handleToggleExpanded}
      explorerView={explorerView}
      onExplorerViewChange={setExplorerView}
      artifacts={artifacts}
      selectedArtifact={selectedArtifact}
      onSelectArtifact={handleSelectArtifact}
      stats={stats}
      files={files}
      loading={loading}
      focusNodeId={viewport.focusNodeId}
      onSetFocus={handleSetFocus}
    />
  );
}

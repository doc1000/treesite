import { useMemo, useState } from "react";
import manifestSample from "./sample/manifest.sample.js";
import AppShell from "./components/AppShell.jsx";
import { findNodeById } from "./lib/manifestTree.js";

const DEFAULT_SELECTED_ID = "a1000001-0000-4000-8000-000000000021";

export default function App() {
  const [selectedNodeId, setSelectedNodeId] = useState(DEFAULT_SELECTED_ID);
  const [expandedNodeIds, setExpandedNodeIds] = useState(() => new Set(["root", ...manifestSample.children.map((c) => c.id)]));
  const [explorerView, setExplorerView] = useState("json");

  const selectedNode = useMemo(
    () => findNodeById(manifestSample, selectedNodeId) ?? findNodeById(manifestSample, DEFAULT_SELECTED_ID),
    [selectedNodeId],
  );

  const toggleExpanded = (id) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <AppShell
      manifest={manifestSample}
      selectedNodeId={selectedNodeId}
      selectedNode={selectedNode}
      onSelectNode={(id) => setSelectedNodeId(id ?? DEFAULT_SELECTED_ID)}
      expandedNodeIds={expandedNodeIds}
      onToggleExpanded={toggleExpanded}
      explorerView={explorerView}
      onExplorerViewChange={setExplorerView}
    />
  );
}

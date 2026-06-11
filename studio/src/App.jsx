import { useState, useEffect, useMemo, useCallback } from "react";
import manifestSample from "./sample/manifest.sample.js";
import AppShell from "./components/AppShell.jsx";
import { findNodeById } from "./lib/manifestTree.js";
import {
  listArtifacts,
  getManifest,
  getStats,
  getNode,
  listFiles,
  validate,
  uploadFile,
  importZip,
  deploy,
  stopDeploy,
  exportDownloadUrl,
} from "./api/client.js";
import { useStore, useDispatch } from "./state/studioStore.jsx";

function slugFromZipName(filename) {
  const base = filename.replace(/\.zip$/i, "").trim();
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "imported-artifact";
}

function pickImportDestName(baseName, existingNames) {
  if (!existingNames.has(baseName)) return baseName;
  let n = 2;
  while (existingNames.has(`${baseName}-${n}`)) n += 1;
  return `${baseName}-${n}`;
}

export default function App() {
  const {
    selectedArtifact,
    selectedNodeId,
    expandedNodeIds,
    viewport,
    validationResult,
    deployState,
    showValidationPanel,
  } = useStore();
  const dispatch = useDispatch();

  const [artifacts, setArtifacts] = useState([]);
  const [manifest, setManifest] = useState(manifestSample);
  const [stats, setStats] = useState(null);
  const [nodeItem, setNodeItem] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [explorerView, setExplorerView] = useState("json");
  const [centerView, setCenterView] = useState("treemap");
  const [commandBusy, setCommandBusy] = useState(false);

  const refreshArtifact = useCallback(
    async ({ afterDelete = false } = {}) => {
      if (!selectedArtifact) return;
      const [m, s, f] = await Promise.all([
        getManifest(selectedArtifact),
        getStats(selectedArtifact),
        listFiles(selectedArtifact),
      ]);
      setManifest(m);
      setStats(s);
      setFiles(f);

      if (afterDelete) {
        dispatch({ type: "SELECT_NODE", payload: null });
        setNodeItem(null);
        dispatch({ type: "SET_DIRTY", payload: false });
        dispatch({ type: "SET_EDIT_ERROR", payload: null });
        return;
      }

      const id = selectedNodeId;
      if (id) {
        const inTree = findNodeById(m, id);
        if (!inTree) {
          dispatch({ type: "SELECT_NODE", payload: null });
          setNodeItem(null);
        } else {
          const item = await getNode(selectedArtifact, id);
          setNodeItem(item);
        }
      }
      dispatch({ type: "SET_DIRTY", payload: false });
      dispatch({ type: "SET_EDIT_ERROR", payload: null });
    },
    [selectedArtifact, selectedNodeId, dispatch],
  );

  const refreshArtifacts = useCallback(async () => {
    const list = await listArtifacts();
    setArtifacts(list);
    return list;
  }, []);

  // Load artifact list on mount
  useEffect(() => {
    refreshArtifacts()
      .then((list) => {
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

  const runDeploy = useCallback(
    async (mode) => {
      if (!selectedArtifact) {
        window.alert("Select an artifact first.");
        return;
      }
      setCommandBusy(true);
      try {
        const result = await deploy(selectedArtifact, mode);
        if (!result.ok) {
          window.alert(result.error?.message || "Deploy failed");
          return;
        }
        dispatch({ type: "SET_DEPLOY", payload: { url: result.data.url, mode: result.data.mode } });
        setCenterView("deploy");
      } catch (err) {
        console.error(err);
        window.alert(err.message || "Deploy failed");
      } finally {
        setCommandBusy(false);
      }
    },
    [selectedArtifact, dispatch],
  );

  const handleStopDeploy = useCallback(async () => {
    try {
      await stopDeploy();
      dispatch({ type: "SET_DEPLOY", payload: null });
    } catch (err) {
      console.error(err);
    }
  }, [dispatch]);

  const handleValidate = useCallback(async () => {
    if (!selectedArtifact) {
      window.alert("Select an artifact first.");
      return;
    }
    setCommandBusy(true);
    try {
      const result = await validate(selectedArtifact);
      if (!result.ok) {
        window.alert(result.error?.message || "Validation failed");
        return;
      }
      dispatch({ type: "SET_VALIDATION", payload: result.data });
      dispatch({ type: "SET_SHOW_VALIDATION", payload: true });
    } catch (err) {
      console.error(err);
      window.alert(err.message || "Validation failed");
    } finally {
      setCommandBusy(false);
    }
  }, [selectedArtifact, dispatch]);

  const handleImport = useCallback(
    async (file) => {
      setCommandBusy(true);
      try {
        const { tempPath } = await uploadFile(file);
        const list = await refreshArtifacts();
        const names = new Set(list.map((a) => a.name));
        const destDir = pickImportDestName(slugFromZipName(file.name), names);
        const result = await importZip(tempPath, destDir, false);
        if (!result.ok) {
          window.alert(result.error?.message || "Import failed");
          return;
        }
        await refreshArtifacts();
        dispatch({ type: "SELECT_ARTIFACT", payload: destDir });
      } catch (err) {
        console.error(err);
        window.alert(err.message || "Import failed");
      } finally {
        setCommandBusy(false);
      }
    },
    [dispatch, refreshArtifacts],
  );

  const handleExport = useCallback(() => {
    if (!selectedArtifact) {
      window.alert("Select an artifact first.");
      return;
    }
    const a = document.createElement("a");
    a.href = exportDownloadUrl(selectedArtifact);
    a.download = `${selectedArtifact}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [selectedArtifact]);

  const handleSeeArtifacts = useCallback(() => {
    dispatch({ type: "SET_PANEL", payload: "fileTree" });
    const el = document.getElementById("artifact-select");
    el?.focus();
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [dispatch]);

  const toggleValidationPanel = useCallback(() => {
    if (!validationResult) return;
    dispatch({ type: "SET_SHOW_VALIDATION", payload: !showValidationPanel });
  }, [validationResult, showValidationPanel, dispatch]);

  const closeValidationPanel = useCallback(() => {
    dispatch({ type: "SET_SHOW_VALIDATION", payload: false });
  }, [dispatch]);

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
      centerView={centerView}
      onCenterViewChange={setCenterView}
      deployState={deployState}
      validationResult={validationResult}
      showValidationPanel={showValidationPanel}
      onToggleValidationPanel={toggleValidationPanel}
      onCloseValidationPanel={closeValidationPanel}
      onDeploy={runDeploy}
      onStopDeploy={handleStopDeploy}
      commandBarProps={{
        busy: commandBusy,
        deployMode: deployState?.mode,
        onSeeArtifacts: handleSeeArtifacts,
        onImport: handleImport,
        onValidate: handleValidate,
        onDeployView: () => runDeploy("view"),
        onDeployEdit: () => runDeploy("edit"),
        onExport: handleExport,
      }}
      refreshArtifact={refreshArtifact}
    />
  );
}

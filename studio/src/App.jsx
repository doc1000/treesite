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
  listItems,
  validate,
  uploadFile,
  importZip,
  deploy,
  stopDeploy,
  getDeployStatus,
  revealArtifact,
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
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [explorerView, setExplorerView] = useState("json");
  const [centerView, setCenterView] = useState("treemap");
  const [commandBusy, setCommandBusy] = useState(false);
  const [deployPending, setDeployPending] = useState(false);
  // true after the handler Vite dev server has booted at least once this session
  const [devServerWarm, setDevServerWarm] = useState(false);

  const refreshArtifact = useCallback(
    async ({ afterDelete = false } = {}) => {
      if (!selectedArtifact) return;
      const [m, s, f, items] = await Promise.all([
        getManifest(selectedArtifact),
        getStats(selectedArtifact),
        listFiles(selectedArtifact),
        listItems(selectedArtifact),
      ]);
      setManifest(m);
      setStats(s);
      setFiles(f);
      setAllItems(items);

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

  // Sync handler dev warm state from bridge (survives better than React-only flag)
  const refreshDeployStatus = useCallback(async () => {
    try {
      const result = await getDeployStatus();
      if (result.ok && result.data?.handlerDevServer?.alive) {
        setDevServerWarm(true);
      }
    } catch {
      /* bridge not ready yet */
    }
  }, []);

  // Load artifact list on mount; warm handler dev starts in bridge configureServer
  useEffect(() => {
    refreshArtifacts()
      .then((list) => {
        if (!selectedArtifact && list.length > 0) {
          dispatch({ type: "SELECT_ARTIFACT", payload: list[0].name });
        }
      })
      .catch((err) => console.error("listArtifacts:", err));
    refreshDeployStatus();
    const t = setInterval(refreshDeployStatus, 3000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load manifest + stats + files when selected artifact changes
  useEffect(() => {
    if (!selectedArtifact) return;
    setLoading(true);
    Promise.all([
      getManifest(selectedArtifact),
      getStats(selectedArtifact),
      listFiles(selectedArtifact),
      listItems(selectedArtifact),
    ])
      .then(([m, s, f, items]) => {
        setManifest(m);
        setStats(s);
        setFiles(f);
        setAllItems(items);
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

  const [appError, setAppError] = useState(null);

  const runDeploy = useCallback(
    async (mode) => {
      if (!selectedArtifact) {
        setAppError("Select an artifact first.");
        return;
      }
      setCommandBusy(true);
      setAppError(null);
      setCenterView("deploy");

      let handlerWarm = devServerWarm;
      try {
        const st = await getDeployStatus();
        handlerWarm = Boolean(st.ok && st.data?.handlerDevServer?.alive);
        if (handlerWarm) setDevServerWarm(true);
      } catch {
        /* ignore */
      }

      const needsHandlerBoot = mode === "edit" && !handlerWarm;
      if (needsHandlerBoot) setDeployPending(true);

      try {
        const result = await deploy(selectedArtifact, mode);
        if (!result.ok) {
          setAppError(result.error?.message || "Deploy failed");
          return;
        }
        dispatch({ type: "SET_DEPLOY", payload: { url: result.data.url, mode: result.data.mode } });
        if (mode === "edit" || result.data?.reused) setDevServerWarm(true);
      } catch (err) {
        console.error(err);
        setAppError(err.message || "Deploy failed");
      } finally {
        setCommandBusy(false);
        setDeployPending(false);
      }
    },
    [selectedArtifact, dispatch, devServerWarm],
  );

  const handleStopDeploy = useCallback(async () => {
    try {
      await stopDeploy();
      dispatch({ type: "SET_DEPLOY", payload: null });
      setDevServerWarm(false);
    } catch (err) {
      console.error(err);
    }
  }, [dispatch]);

  const handleValidate = useCallback(async () => {
    if (!selectedArtifact) {
      setAppError("Select an artifact first.");
      return;
    }
    setCommandBusy(true);
    setAppError(null);
    try {
      const result = await validate(selectedArtifact);
      if (!result.ok) {
        setAppError(result.error?.message || "Validation failed");
        return;
      }
      dispatch({ type: "SET_VALIDATION", payload: result.data });
      dispatch({ type: "SET_SHOW_VALIDATION", payload: true });
    } catch (err) {
      console.error(err);
      setAppError(err.message || "Validation failed");
    } finally {
      setCommandBusy(false);
    }
  }, [selectedArtifact, dispatch]);

  const handleImport = useCallback(
    async (file) => {
      setCommandBusy(true);
      setAppError(null);
      try {
        const { tempPath } = await uploadFile(file);
        const list = await refreshArtifacts();
        const names = new Set(list.map((a) => a.name));
        const destDir = pickImportDestName(slugFromZipName(file.name), names);
        const result = await importZip(tempPath, destDir, false);
        if (!result.ok) {
          setAppError(result.error?.message || "Import failed");
          return;
        }
        await refreshArtifacts();
        dispatch({ type: "SELECT_ARTIFACT", payload: destDir });
      } catch (err) {
        console.error(err);
        setAppError(err.message || "Import failed");
      } finally {
        setCommandBusy(false);
      }
    },
    [dispatch, refreshArtifacts],
  );

  const handleExport = useCallback(() => {
    if (!selectedArtifact) {
      setAppError("Select an artifact first.");
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
    // Focus the artifact selector in the studio sidebar
    const el = document.getElementById("artifact-select");
    el?.focus();
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    // Open the artifact folder in the OS file browser
    revealArtifact(selectedArtifact || "").catch((err) => {
      console.warn("reveal:", err.message);
    });
  }, [selectedArtifact]);

  const toggleValidationPanel = useCallback(() => {
    if (!validationResult) return;
    dispatch({ type: "SET_SHOW_VALIDATION", payload: !showValidationPanel });
  }, [validationResult, showValidationPanel, dispatch]);

  const closeValidationPanel = useCallback(() => {
    dispatch({ type: "SET_SHOW_VALIDATION", payload: false });
  }, [dispatch]);

  const hiddenItems = allItems.filter((item) => item.hidden);

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
      hiddenItems={hiddenItems}
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
      deployPending={deployPending}
      devServerWarm={devServerWarm}
      onDeploy={runDeploy}
      onStopDeploy={handleStopDeploy}
      commandBarProps={{
        busy: commandBusy,
        deployMode: deployState?.mode,
        appError,
        onDismissError: () => setAppError(null),
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

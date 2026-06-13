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
  openPreview,
  getPreviewStatus,
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
  const [commandBusy, setCommandBusy] = useState(false);
  const [handlerDistReady, setHandlerDistReady] = useState(false);

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

  const syncPreviewStatus = useCallback(async () => {
    try {
      const result = await getPreviewStatus();
      setHandlerDistReady(Boolean(result.ok && result.data?.handlerDistReady));
    } catch {
      setHandlerDistReady(false);
    }
  }, []);

  useEffect(() => {
    refreshArtifacts()
      .then((list) => {
        if (!selectedArtifact && list.length > 0) {
          dispatch({ type: "SELECT_ARTIFACT", payload: list[0].name });
        }
      })
      .catch((err) => console.error("listArtifacts:", err));
    syncPreviewStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleOpenPreview = useCallback(async () => {
    if (!selectedArtifact) {
      setAppError("Select an artifact first.");
      return;
    }
    setCommandBusy(true);
    setAppError(null);
    try {
      const result = await openPreview(selectedArtifact);
      if (!result.ok) {
        if (result.error?.code === "HANDLER_NOT_BUILT") {
          setAppError(
            result.error?.message
              || "Handler preview build missing. Run npm --prefix handler run build:studio-preview.",
          );
          return;
        }
        setAppError(result.error?.message || "Preview failed to open");
        return;
      }
      const url = result.data?.url ?? result.url;
      if (url) {
        window.open(new URL(url, window.location.origin).href, "_blank", "noopener");
      }
    } catch (err) {
      console.error(err);
      setAppError(err.message || "Preview failed to open");
    } finally {
      setCommandBusy(false);
    }
  }, [selectedArtifact]);

  const handleEditInStudio = useCallback(() => {
    document.querySelector(".center-column")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, []);

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
    const el = document.getElementById("artifact-select");
    el?.focus();
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
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
      handlerDistReady={handlerDistReady}
      validationResult={validationResult}
      showValidationPanel={showValidationPanel}
      onToggleValidationPanel={toggleValidationPanel}
      onCloseValidationPanel={closeValidationPanel}
      commandBarProps={{
        busy: commandBusy,
        editStudioActive: true,
        appError,
        onDismissError: () => setAppError(null),
        onSeeArtifacts: handleSeeArtifacts,
        onImport: handleImport,
        onValidate: handleValidate,
        onOpenPreview: handleOpenPreview,
        onEditInStudio: handleEditInStudio,
        onExport: handleExport,
      }}
      refreshArtifact={refreshArtifact}
    />
  );
}

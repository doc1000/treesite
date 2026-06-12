import { useState, useEffect, useCallback, useRef } from "react";
import { INTENTS } from "../nav/intents.js";
import {
  editCard,
  renameCard,
  moveCard,
  moveSubtree,
  hideCard,
  unhideCard,
  deleteCard,
} from "../api/client.js";
import { useStore, useDispatch } from "../state/studioStore.jsx";
import { collectSectionPaths } from "../state/studioOps.js";
import AddDialog from "./AddDialog.jsx";

function itemToForm(item) {
  return {
    name: item.name ?? "",
    description: item.description ?? "",
    value: item.value != null ? String(item.value) : "",
    url: item.url ?? "",
    href: item.href ?? "",
    email: item.email ?? "",
    source: item.source ?? "",
    previewImage: item.previewImage ?? "",
    embed: item.embed ?? "",
    mapFace: item.mapFace ?? "",
  };
}

function buildEditFields(form, type) {
  const fields = { description: form.description };
  if (form.value !== "") {
    const n = Number(form.value);
    if (!Number.isNaN(n)) fields.value = n;
  }
  if (type === "link" || type === "website") fields.url = form.url;
  if (type === "href" || type === "contact") {
    fields.href = form.href;
    if (type === "contact") fields.email = form.email;
  }
  if (type === "htmlCard") fields.embed = form.embed;
  if (form.mapFace !== undefined) fields.mapFace = form.mapFace;
  return fields;
}

const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]), textarea, select, button, summary, [tabindex="0"]';

function listFocusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (el) => !el.disabled && el.tabIndex !== -1 && !el.hidden,
  );
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default function RightToolPanel({
  selectedArtifact,
  selectedNodeId,
  nodeItem,
  manifest,
  refreshArtifact,
  navigation,
  zoneActive,
}) {
  const { dirty, editError } = useStore();
  const dispatch = useDispatch();
  const zoneRef = useRef(null);

  const [form, setForm] = useState(() => itemToForm(nodeItem ?? {}));
  const [busy, setBusy] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  // Move: inline section picker
  const [movePending, setMovePending] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  // Delete: inline confirm
  const [deletePending, setDeletePending] = useState(false);

  const editable = Boolean(selectedNodeId && nodeItem?.id);

  useEffect(() => {
    if (nodeItem?.id) {
      setForm(itemToForm(nodeItem));
      dispatch({ type: "SET_DIRTY", payload: false });
      dispatch({ type: "SET_EDIT_ERROR", payload: null });
      setMovePending(false);
      setDeletePending(false);
    }
  }, [nodeItem?.id, nodeItem, dispatch]);

  const markDirty = useCallback(
    (nextForm) => {
      setForm(nextForm);
      dispatch({ type: "SET_DIRTY", payload: true });
    },
    [dispatch],
  );

  const runMutation = useCallback(
    async (fn, refreshOpts) => {
      if (!selectedArtifact) return;
      setBusy(true);
      dispatch({ type: "SET_EDIT_ERROR", payload: null });
      try {
        await fn();
        await refreshArtifact(refreshOpts);
      } catch (err) {
        dispatch({
          type: "SET_EDIT_ERROR",
          payload: err.message || "Operation failed",
        });
      } finally {
        setBusy(false);
      }
    },
    [selectedArtifact, refreshArtifact, dispatch],
  );

  const handleSave = (e) => {
    e.preventDefault();
    if (!editable || !dirty) return;
    const newName = form.name.trim();
    const oldName = nodeItem.name;

    runMutation(async () => {
      // Inline rename: if name changed, rename slug+file first
      if (newName && newName !== oldName) {
        const newSlug = slugify(newName);
        if (newSlug && newSlug !== nodeItem.slug) {
          await renameCard(selectedArtifact, {
            id: nodeItem.id,
            name: newName,
            slug: newSlug,
          });
        }
      }
      const otherFields = buildEditFields(form, nodeItem.type);
      if (newName) otherFields.name = newName;
      await editCard(selectedArtifact, nodeItem.id, otherFields);
    });
  };

  const handleMove = (e) => {
    e.preventDefault();
    if (!moveTarget.trim()) return;
    const target = moveTarget.trim();
    runMutation(() =>
      nodeItem.type === "section"
        ? moveSubtree(selectedArtifact, { id: nodeItem.id, newSection: target })
        : moveCard(selectedArtifact, { id: nodeItem.id, section: target }),
    );
    setMovePending(false);
    setMoveTarget("");
  };

  const handleHideToggle = () => {
    runMutation(() =>
      nodeItem.hidden
        ? unhideCard(selectedArtifact, nodeItem.id)
        : hideCard(selectedArtifact, nodeItem.id),
    );
  };

  const handleDelete = () => {
    runMutation(
      () => deleteCard(selectedArtifact, nodeItem.id),
      { afterDelete: true },
    );
    setDeletePending(false);
  };

  const rootSelected = !selectedNodeId;
  const rootMeta = manifest ?? {};

  const focusAt = useCallback((index) => {
    const items = listFocusables(zoneRef.current);
    if (!items.length) return;
    const i = ((index % items.length) + items.length) % items.length;
    items[i]?.focus?.({ preventScroll: true });
  }, []);

  const handleIntent = useCallback(
    (intent) => {
      const items = listFocusables(zoneRef.current);
      if (!items.length) {
        if (intent === INTENTS.BACK) {
          dispatch({ type: "SET_PANEL", payload: "treemap" });
          navigation?.focusZone?.("treemap");
        }
        return;
      }
      const active = document.activeElement;
      let idx = items.indexOf(active);
      if (idx < 0) idx = 0;

      if (intent === INTENTS.UP) { focusAt(idx - 1); return; }
      if (intent === INTENTS.DOWN) { focusAt(idx + 1); return; }
      if (intent === INTENTS.SELECT) {
        if (active instanceof HTMLElement) {
          if (active.tagName === "BUTTON" || active.tagName === "SUMMARY") {
            active.click();
          } else if (active.tagName === "INPUT" || active.tagName === "TEXTAREA") {
            active.focus();
          }
        }
        return;
      }
      if (intent === INTENTS.BACK) {
        dispatch({ type: "SET_PANEL", payload: "treemap" });
        navigation?.focusZone?.("treemap");
      }
    },
    [dispatch, focusAt, navigation],
  );

  useEffect(() => {
    if (!navigation) return undefined;
    navigation.registerZone("toolpanel", {
      onIntent: handleIntent,
      focus: () => focusAt(0),
    });
    return () => navigation.unregisterZone("toolpanel");
  }, [navigation, handleIntent, focusAt, nodeItem?.id, editable]);

  const zoneClass = zoneActive ? "toolpanel-zone zone-active" : "toolpanel-zone";
  const sectionPaths = collectSectionPaths(manifest ?? { children: [] });

  return (
    <div className={zoneClass} ref={zoneRef}>
      <div className="panel-header">
        <h2>Edit Tools</h2>
        <span aria-hidden="true">↔</span>
      </div>

      {!editable && (
        <>
          {rootSelected ? (
            <>
              <div className="selected-title">
                <b>▰</b>
                <b>Artifact root</b>
              </div>
              <div className="form" style={{ paddingTop: 0 }}>
                <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 12px" }}>
                  Select a node to edit its content and structure.
                </p>
                <div className="field">
                  <label>Display name</label>
                  <input readOnly value={rootMeta.displayName || rootMeta.name || "—"} />
                </div>
                <div className="field">
                  <label>Tagline</label>
                  <textarea
                    readOnly
                    value={rootMeta.tagline ?? rootMeta.description ?? ""}
                    rows={3}
                  />
                </div>
              </div>
              <div className="form" style={{ paddingTop: 0 }}>
                <button
                  type="button"
                  className="primary"
                  onClick={() => setShowAddDialog(true)}
                >
                  + Add Card or Asset
                </button>
              </div>
            </>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 12, padding: "12px 16px" }}>
              Select a node to edit
            </p>
          )}
        </>
      )}

      {editable && (
        <>
          <div className="selected-title">
            <b>▰</b>
            <b>{nodeItem.name}</b>
          </div>

          <div
            className="form-meta"
            style={{
              padding: "0 16px 8px",
              fontSize: 11,
              color: "var(--muted)",
              display: "grid",
              gap: 4,
            }}
          >
            <div>
              <span>Type </span>
              <b style={{ color: "var(--text)" }}>{nodeItem.type}</b>
            </div>
            <div>
              <span>Section </span>
              <b style={{ color: "var(--text)" }}>{nodeItem.section ?? "—"}</b>
            </div>
            <div>
              <span>Slug </span>
              <b style={{ color: "var(--text)" }}>{nodeItem.slug}</b>
            </div>
            {nodeItem.hidden && (
              <div style={{ color: "var(--orange)" }}>Hidden from site</div>
            )}
          </div>

          {editError && (
            <p style={{ color: "var(--red)", fontSize: 12, margin: "0 16px 8px" }}>
              {editError}
            </p>
          )}

          <form className="form" onSubmit={handleSave}>
            {/* Name — editing here renames slug+file on Save */}
            <div className="field">
              <label htmlFor="field-name">Name</label>
              <input
                id="field-name"
                value={form.name}
                disabled={busy}
                onChange={(e) => markDirty({ ...form, name: e.target.value })}
              />
              {form.name.trim() !== nodeItem.name && form.name.trim() && (
                <p style={{ fontSize: 10, color: "var(--muted)", margin: "3px 0 0" }}>
                  Slug will change to "{slugify(form.name.trim())}" on save
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="field-description">Description</label>
              <textarea
                id="field-description"
                value={form.description}
                disabled={busy}
                onChange={(e) => markDirty({ ...form, description: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="field-value">Weight</label>
              <input
                id="field-value"
                type="number"
                step="any"
                value={form.value}
                disabled={busy}
                onChange={(e) => markDirty({ ...form, value: e.target.value })}
              />
            </div>

            {(nodeItem.type === "link" || nodeItem.type === "website") && (
              <div className="field">
                <label htmlFor="field-url">URL</label>
                <input
                  id="field-url"
                  value={form.url}
                  disabled={busy}
                  onChange={(e) => markDirty({ ...form, url: e.target.value })}
                />
              </div>
            )}

            {(nodeItem.type === "href" || nodeItem.type === "contact") && (
              <>
                <div className="field">
                  <label htmlFor="field-href">Href / path</label>
                  <input
                    id="field-href"
                    list="toolpanel-href-targets"
                    value={form.href}
                    disabled={busy}
                    onChange={(e) => markDirty({ ...form, href: e.target.value })}
                  />
                  <datalist id="toolpanel-href-targets">
                    {sectionPaths.map((p) => (
                      <option key={p} value={`/${p.toLowerCase().replace(/\s+/g, "-")}`} />
                    ))}
                  </datalist>
                </div>
                {nodeItem.type === "contact" && (
                  <div className="field">
                    <label htmlFor="field-email">Email</label>
                    <input
                      id="field-email"
                      value={form.email}
                      disabled={busy}
                      onChange={(e) => markDirty({ ...form, email: e.target.value })}
                    />
                  </div>
                )}
              </>
            )}

            {nodeItem.type === "pdf" && (
              <>
                <div className="field">
                  <label>Source (read-only)</label>
                  <input value={form.source} readOnly />
                </div>
                <div className="field">
                  <label>Preview image (read-only)</label>
                  <input value={form.previewImage || "none"} readOnly />
                </div>
              </>
            )}

            {nodeItem.type === "htmlCard" && (
              <div className="field">
                <label htmlFor="field-embed">Embed</label>
                <input
                  id="field-embed"
                  value={form.embed}
                  disabled={busy}
                  onChange={(e) => markDirty({ ...form, embed: e.target.value })}
                />
              </div>
            )}

            {/* mapFace: controls what shows on the tile face in the map */}
            <div className="field">
              <label htmlFor="field-mapface">Map face</label>
              <select
                id="field-mapface"
                value={form.mapFace}
                disabled={busy}
                onChange={(e) => markDirty({ ...form, mapFace: e.target.value })}
                style={{ background: "#0c1118", border: "1px solid var(--line)", borderRadius: 7, padding: 10 }}
              >
                <option value="">text (default)</option>
                <option value="text">text</option>
                <option value="media">media (preview image)</option>
              </select>
            </div>

            {dirty && (
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save Changes"}
              </button>
            )}

            {/* Actions */}
            <div className="action-list">
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowAddDialog(true)}
              >
                + Add Card or Asset
              </button>

              {/* Move — inline section picker */}
              {movePending ? (
                <form onSubmit={handleMove} style={{ display: "contents" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input
                      list="move-target-paths"
                      value={moveTarget}
                      placeholder="Target section…"
                      autoFocus
                      style={{ flex: 1, padding: "6px 8px", fontSize: 12, background: "#0c1118", border: "1px solid var(--line)", borderRadius: 5, color: "inherit" }}
                      onChange={(e) => setMoveTarget(e.target.value)}
                    />
                    <datalist id="move-target-paths">
                      {sectionPaths.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                    <button type="submit" disabled={!moveTarget.trim()} style={{ padding: "6px 10px", fontSize: 12, background: "var(--blue)", border: "none", borderRadius: 5, color: "#fff", cursor: "pointer" }}>
                      Move
                    </button>
                    <button type="button" onClick={() => setMovePending(false)} style={{ padding: "6px 8px", fontSize: 12, background: "none", border: "1px solid var(--line)", borderRadius: 5, color: "var(--muted)", cursor: "pointer" }}>
                      ×
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setMoveTarget(nodeItem.section ?? ""); setMovePending(true); }}
                >
                  Move
                </button>
              )}

              <button type="button" disabled={busy} onClick={handleHideToggle}>
                {nodeItem.hidden ? "Unhide" : "Hide"}
              </button>

              {/* Delete — inline confirm */}
              {deletePending ? (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--red)", flex: 1 }}>Delete "{nodeItem.name}"?</span>
                  <button type="button" onClick={handleDelete} style={{ padding: "5px 10px", fontSize: 12, background: "var(--red)", border: "none", borderRadius: 5, color: "#fff", cursor: "pointer" }}>
                    Yes
                  </button>
                  <button type="button" onClick={() => setDeletePending(false)} style={{ padding: "5px 8px", fontSize: 12, background: "none", border: "1px solid var(--line)", borderRadius: 5, color: "var(--muted)", cursor: "pointer" }}>
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => setDeletePending(true)}
                >
                  Delete
                </button>
              )}
            </div>
          </form>

          {/* Preview thumbnail */}
          {nodeItem.previewImage && (() => {
            const previewUrl = selectedArtifact
              ? `/api/artifacts/${encodeURIComponent(selectedArtifact)}/static/${nodeItem.previewImage}`
              : null;
            return previewUrl ? (
              <div style={{ margin: "8px 16px 0" }}>
                <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 4px" }}>Preview</p>
                <img
                  src={previewUrl}
                  alt={`Preview of ${nodeItem.name}`}
                  style={{ width: "100%", borderRadius: 4, border: "1px solid var(--line-soft)", display: "block" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>
            ) : null;
          })()}

          {/* Raw JSON (collapsed) */}
          <details style={{ margin: "8px 16px 0" }}>
            <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 11, padding: "4px 0", userSelect: "none" }}>
              items/{nodeItem.slug}.json
            </summary>
            <pre style={{ background: "var(--bg3, #141414)", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 180, fontSize: 10, color: "var(--text)", margin: 0, lineHeight: 1.4 }}>
              {JSON.stringify(nodeItem, null, 2)}
            </pre>
          </details>
        </>
      )}

      {showAddDialog && (
        <AddDialog
          artifactName={selectedArtifact}
          manifest={manifest}
          defaultSection={nodeItem?.section ?? "Home"}
          defaultTarget={nodeItem}
          onSuccess={() => refreshArtifact()}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}

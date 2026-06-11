import { useState, useEffect, useCallback, useRef } from "react";
import { INTENTS } from "../nav/intents.js";
import {
  editCard,
  addCard,
  renameCard,
  moveCard,
  moveSubtree,
  hideCard,
  unhideCard,
  deleteCard,
} from "../api/client.js";
import { useStore, useDispatch } from "../state/studioStore.jsx";
import AddAssetDialog from "./AddAssetDialog.jsx";

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addCardSectionPath(item) {
  if (!item) return "";
  if (item.type === "section") {
    if (item.section === "Home") return item.name;
    return `${item.section}/${item.name}`;
  }
  return item.section ?? "";
}

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
  };
}

function buildEditFields(form, type) {
  const fields = {
    name: form.name.trim(),
    description: form.description,
  };
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
  return fields;
}

const ADD_TYPES = [
  { value: "text", label: "Text" },
  { value: "link", label: "Link" },
  { value: "href", label: "Href" },
  { value: "contact", label: "Contact" },
  { value: "section", label: "Section" },
];

const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]), textarea, select, button, summary, [tabindex="0"]';

function listFocusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
    (el) => !el.disabled && el.tabIndex !== -1 && !el.hidden,
  );
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
  const [showAddChild, setShowAddChild] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    type: "text",
    description: "",
  });
  const [showAssetDialog, setShowAssetDialog] = useState(false);

  const editable = Boolean(selectedNodeId && nodeItem?.id);

  useEffect(() => {
    if (nodeItem?.id) {
      setForm(itemToForm(nodeItem));
      dispatch({ type: "SET_DIRTY", payload: false });
      dispatch({ type: "SET_EDIT_ERROR", payload: null });
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
    runMutation(() =>
      editCard(selectedArtifact, nodeItem.id, buildEditFields(form, nodeItem.type)),
    );
  };

  const handleAddChild = (e) => {
    e.preventDefault();
    const section = addCardSectionPath(nodeItem);
    if (!addForm.name.trim() || !section) return;
    runMutation(async () => {
      await addCard(selectedArtifact, {
        name: addForm.name.trim(),
        section,
        type: addForm.type,
        description: addForm.description,
      });
      setAddForm({ name: "", type: "text", description: "" });
      setShowAddChild(false);
    });
  };

  const handleRename = () => {
    const nextName = window.prompt("New name:", nodeItem.name);
    if (!nextName?.trim() || nextName.trim() === nodeItem.name) return;
    const name = nextName.trim();
    const slug = slugify(name);
    if (!slug) {
      window.alert("Could not derive a slug from that name.");
      return;
    }
    runMutation(() => renameCard(selectedArtifact, { id: nodeItem.id, name, slug }));
  };

  const handleMove = () => {
    const hint =
      nodeItem.type === "section"
        ? "Parent section path (e.g. Home or Content Types):"
        : "New section path:";
    const section = window.prompt(hint, nodeItem.section ?? "");
    if (!section?.trim()) return;
    const target = section.trim();
    runMutation(() =>
      nodeItem.type === "section"
        ? moveSubtree(selectedArtifact, { id: nodeItem.id, newSection: target })
        : moveCard(selectedArtifact, { id: nodeItem.id, section: target }),
    );
  };

  const handleHideToggle = () => {
    runMutation(() =>
      nodeItem.hidden
        ? unhideCard(selectedArtifact, nodeItem.id)
        : hideCard(selectedArtifact, nodeItem.id),
    );
  };

  const handleDelete = () => {
    const ok = window.confirm(
      `Delete ${nodeItem.name}? This cannot be undone.`,
    );
    if (!ok) return;
    runMutation(
      () => deleteCard(selectedArtifact, nodeItem.id),
      { afterDelete: true },
    );
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

      if (intent === INTENTS.UP) {
        focusAt(idx - 1);
        return;
      }
      if (intent === INTENTS.DOWN) {
        focusAt(idx + 1);
        return;
      }
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
  }, [navigation, handleIntent, focusAt, nodeItem?.id, editable, showAddChild]);

  const zoneClass = zoneActive ? "toolpanel-zone zone-active" : "toolpanel-zone";

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
            <b>Selected: {nodeItem.name}</b>
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
            <div style={{ wordBreak: "break-all" }}>
              <span>ID </span>
              <b style={{ color: "var(--text)", fontSize: 10 }}>{nodeItem.id}</b>
            </div>
            {nodeItem.hidden && (
              <div style={{ color: "var(--orange)" }}>Hidden from site</div>
            )}
          </div>

          {editError && (
            <p
              style={{
                color: "var(--red)",
                fontSize: 12,
                margin: "0 16px 8px",
              }}
            >
              {editError}
            </p>
          )}

          <form className="form" onSubmit={handleSave}>
            <div className="field">
              <label htmlFor="field-name">Name</label>
              <input
                id="field-name"
                value={form.name}
                disabled={busy}
                onChange={(e) => markDirty({ ...form, name: e.target.value })}
              />
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
              <label htmlFor="field-value">Value</label>
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
                  <label htmlFor="field-href">Href</label>
                  <input
                    id="field-href"
                    value={form.href}
                    disabled={busy}
                    onChange={(e) => markDirty({ ...form, href: e.target.value })}
                  />
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
                  <label htmlFor="field-source">Source</label>
                  <input id="field-source" value={form.source} readOnly />
                </div>
                <div className="field">
                  <label htmlFor="field-preview">Preview image</label>
                  <input id="field-preview" value={form.previewImage} readOnly />
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

            {dirty && (
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save Changes"}
              </button>
            )}

            <div className="action-list">
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowAddChild((v) => !v)}
              >
                Add Child Card
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowAssetDialog(true)}
              >
                Add Asset…
              </button>
              <button type="button" disabled={busy} onClick={handleRename}>
                Rename
              </button>
              <button type="button" disabled={busy} onClick={handleMove}>
                Move
              </button>
              <button type="button" disabled={busy} onClick={handleHideToggle}>
                {nodeItem.hidden ? "Unhide" : "Hide"}
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </form>

          {/* Preview thumbnail for pdf / website / htmlCard */}
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
            ) : (
              <p style={{ fontSize: 11, color: "var(--muted)", padding: "4px 16px" }}>
                Deploy to preview images
              </p>
            );
          })()}

          {showAddChild && (
            <form
              className="form"
              style={{ borderTop: "1px solid var(--line-soft)", marginTop: 8 }}
              onSubmit={handleAddChild}
            >
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>
                New card under{" "}
                <b style={{ color: "var(--text)" }}>{addCardSectionPath(nodeItem)}</b>
              </p>
              <div className="field">
                <label htmlFor="add-name">Name</label>
                <input
                  id="add-name"
                  value={addForm.name}
                  disabled={busy}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="add-type">Type</label>
                <select
                  id="add-type"
                  value={addForm.type}
                  disabled={busy}
                  onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
                >
                  {ADD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="add-desc">Description</label>
                <textarea
                  id="add-desc"
                  value={addForm.description}
                  disabled={busy}
                  onChange={(e) =>
                    setAddForm({ ...addForm, description: e.target.value })
                  }
                />
              </div>
              <button type="submit" disabled={busy || !addForm.name.trim()}>
                Create card
              </button>
            </form>
          )}

          <details style={{ margin: "8px 16px 0" }}>
            <summary
              style={{
                cursor: "pointer",
                color: "var(--muted)",
                fontSize: 11,
                padding: "4px 0",
                userSelect: "none",
              }}
            >
              items/{nodeItem.slug}.json (raw)
            </summary>
            <pre
              style={{
                background: "var(--bg3, #141414)",
                padding: 8,
                borderRadius: 4,
                overflow: "auto",
                maxHeight: 180,
                fontSize: 10,
                color: "var(--text)",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {JSON.stringify(nodeItem, null, 2)}
            </pre>
          </details>
        </>
      )}

      <AddAssetDialog
        isOpen={showAssetDialog}
        onClose={() => setShowAssetDialog(false)}
        artifactName={selectedArtifact}
        defaultSection={nodeItem ? addCardSectionPath(nodeItem) : ""}
        onSuccess={() => refreshArtifact()}
      />
    </div>
  );
}

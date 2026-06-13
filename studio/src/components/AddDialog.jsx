/**
 * AddDialog — unified "add card or asset" dialog.
 *
 * Replaces the inline add-child form in RightToolPanel and the separate
 * AddAssetDialog. One dialog, one type-picker, one parent-section dropdown.
 *
 * Props:
 *   artifactName    string
 *   manifest        object  — for collecting section paths
 *   defaultSection  string  — pre-fill for parent dropdown
 *   defaultTarget   object  — the currently selected node (may become a container)
 *   onSuccess       fn()    — called after successful add + refresh
 *   onClose         fn()
 */
import { useState, useRef } from "react";
import { collectSectionPaths, getNodeSectionPath } from "../state/studioOps.js";
import { addCard, addWebsite, editCard } from "../api/client.js";

const BASIC_TYPES = ["text", "section", "link", "href", "contact"];
const ASSET_TYPES = ["pdf", "website", "html"];
const ALL_TYPES = [...BASIC_TYPES, ...ASSET_TYPES];

const TYPE_LABELS = {
  text: "Text",
  section: "Section",
  link: "Link",
  href: "Page Link",
  contact: "Contact",
  pdf: "PDF",
  website: "Website",
  html: "HTML",
};

const INPUT = {
  width: "100%",
  background: "#0c1118",
  border: "1px solid var(--line, #273140)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "inherit",
  fontSize: 13,
};

const BTN_SECONDARY = {
  padding: "7px 16px",
  cursor: "pointer",
  background: "none",
  border: "1px solid var(--line, #273140)",
  color: "var(--muted, #9aa7b7)",
  borderRadius: 5,
  fontSize: 13,
};

const BTN_PRIMARY = {
  padding: "7px 16px",
  cursor: "pointer",
  background: "var(--blue, #3578ff)",
  border: "none",
  color: "#fff",
  borderRadius: 5,
  fontWeight: 600,
  fontSize: 13,
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: "var(--muted, #9aa7b7)", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorNote({ message }) {
  return (
    <p style={{ color: "var(--red, #ff3b30)", fontSize: 12, margin: "8px 0 0", wordBreak: "break-word" }}>
      {message}
    </p>
  );
}

function SuccessNote({ message }) {
  return (
    <p style={{ color: "var(--green, #52d66b)", fontSize: 12, margin: "8px 0 0" }}>
      {message}
    </p>
  );
}

export default function AddDialog({
  artifactName,
  manifest,
  defaultSection,
  defaultTarget,
  onSuccess,
  onClose,
}) {
  const isDefaultTargetContent =
    defaultTarget && defaultTarget.type !== "section";
  const promotionSectionPath =
    defaultTarget && isDefaultTargetContent
      ? getNodeSectionPath(defaultTarget)
      : null;

  // Build section path options
  const sectionPaths = collectSectionPaths(manifest ?? { children: [] });
  // Insert promotion option if defaultTarget is a content node
  if (promotionSectionPath && !sectionPaths.includes(promotionSectionPath)) {
    const insertAfter = sectionPaths.indexOf(defaultSection ?? "Home");
    sectionPaths.splice(insertAfter + 1, 0, promotionSectionPath);
  }

  const [type, setType] = useState("text");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [valueStr, setValueStr] = useState("");
  const [url, setUrl] = useState("");
  const [href, setHref] = useState("");
  const [email, setEmail] = useState("");
  const [section, setSection] = useState(
    promotionSectionPath ?? defaultSection ?? "Home"
  );
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef();

  const isAsset = ASSET_TYPES.includes(type);
  const value = valueStr !== "" ? Number(valueStr) : undefined;

  const needsPromotion =
    isDefaultTargetContent && section === promotionSectionPath;

  async function promoteIfNeeded() {
    if (!needsPromotion || !defaultTarget) return;
    // Promote content card to section so it can hold children.
    // editCard allows type changes; only slug is locked.
    await editCard(artifactName, defaultTarget.id, { type: "section" });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      await promoteIfNeeded();

      if (type === "pdf") {
        if (!file) throw new Error("Select a PDF file.");
        const form = new FormData();
        form.append("artifactName", artifactName);
        form.append(
          "fields",
          JSON.stringify({ name: name.trim(), section, description, value })
        );
        form.append("file", file);
        const res = await fetch("/api/intake/add-pdf", { method: "POST", body: form });
        const result = await res.json();
        if (!result.ok)
          throw new Error(result.error?.message || "add-pdf failed");
        if (result.data?.previewPending)
          setWarning(result.data.warning || "Preview image will be generated when Playwright is available.");
      } else if (type === "html") {
        if (!file) throw new Error("Select an HTML file.");
        const form = new FormData();
        form.append("artifactName", artifactName);
        form.append(
          "fields",
          JSON.stringify({ name: name.trim(), section, description })
        );
        form.append("file", file);
        const res = await fetch("/api/intake/add-html", { method: "POST", body: form });
        const result = await res.json();
        if (!result.ok)
          throw new Error(result.error?.message || "add-html failed");
        if (result.data?.previewPending)
          setWarning(result.data.warning || "Preview image will be generated when Playwright is available.");
      } else if (type === "website") {
        if (!url.startsWith("http")) throw new Error("URL must start with http:// or https://");
        const result = await addWebsite(artifactName, {
          name: name.trim(),
          section,
          url,
        });
        if (!result.ok)
          throw new Error(result.error?.message || "add-website failed");
        if (result.data?.previewPending)
          setWarning(result.data.warning || "Preview image will be generated when Playwright is available.");
      } else {
        const spec = { name: name.trim(), type, section, description };
        if (value !== undefined) spec.value = value;
        if (type === "link" || type === "href") spec.href = href || url;
        if (type === "contact") spec.email = email;
        await addCard(artifactName, spec);
      }

      onSuccess();
      if (warning) {
        setDone(true);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--panel, #10151d)",
          border: "1px solid var(--line, #273140)",
          borderRadius: 10,
          padding: 24,
          width: 400,
          maxWidth: "94vw",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Add Card</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {!done ? (
          <form onSubmit={handleSubmit}>
            {/* Type picker */}
            <Field label="Type">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 4 }}>
                {BASIC_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={busy}
                    style={{
                      padding: "6px 4px",
                      borderRadius: 5,
                      border: "1px solid var(--line)",
                      background: type === t ? "var(--blue, #3578ff)" : "#0c1118",
                      color: type === t ? "#fff" : "var(--muted)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                    onClick={() => setType(t)}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                {ASSET_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={busy}
                    style={{
                      padding: "6px 4px",
                      borderRadius: 5,
                      border: "1px solid var(--line)",
                      background: type === t ? "rgba(82,214,107,0.18)" : "#0c1118",
                      color: type === t ? "var(--green, #52d66b)" : "var(--muted)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                    onClick={() => setType(t)}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </Field>

            {/* Parent section */}
            <Field label="Parent section">
              <select
                style={INPUT}
                value={section}
                disabled={busy}
                onChange={(e) => setSection(e.target.value)}
              >
                {sectionPaths.map((p) => (
                  <option key={p} value={p}>
                    {p === promotionSectionPath
                      ? `${p}  ← promote "${defaultTarget?.name}" to container`
                      : p}
                  </option>
                ))}
              </select>
            </Field>

            {/* Name */}
            <Field label="Name *">
              <input
                style={INPUT}
                value={name}
                required
                disabled={busy}
                placeholder="Card name"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            {/* Description (most types) */}
            {type !== "contact" && (
              <Field label="Description">
                <textarea
                  style={{ ...INPUT, minHeight: 60, resize: "vertical" }}
                  value={description}
                  disabled={busy}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
            )}

            {/* URL for link/href/website */}
            {(type === "link" || type === "href" || type === "website") && (
              <Field label={type === "href" ? "Internal path or URL *" : "URL *"}>
                {type === "href" ? (
                  <input
                    style={INPUT}
                    list="add-dialog-href-targets"
                    value={href || url}
                    disabled={busy}
                    placeholder="/section/slug or https://…"
                    onChange={(e) => setHref(e.target.value)}
                  />
                ) : (
                  <input
                    style={INPUT}
                    type="url"
                    value={url}
                    disabled={busy}
                    placeholder="https://example.com"
                    onChange={(e) => setUrl(e.target.value)}
                  />
                )}
                <datalist id="add-dialog-href-targets">
                  {sectionPaths.map((p) => (
                    <option key={p} value={`/${p.toLowerCase().replace(/\s+/g, "-")}`} />
                  ))}
                </datalist>
              </Field>
            )}

            {/* Email for contact */}
            {type === "contact" && (
              <Field label="Email *">
                <input
                  style={INPUT}
                  type="email"
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            )}

            {/* File upload for pdf/html */}
            {(type === "pdf" || type === "html") && (
              <Field label={type === "pdf" ? "PDF file *" : "HTML file *"}>
                <input
                  ref={fileRef}
                  type="file"
                  accept={type === "pdf" ? ".pdf" : ".html,.htm"}
                  required
                  disabled={busy}
                  style={{ ...INPUT, padding: "4px 8px", cursor: "pointer" }}
                  onChange={(e) => setFile(e.target.files[0] ?? null)}
                />
                {file && (
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                    {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </p>
                )}
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                  Preview requires Playwright — card always created; preview image is generated when Playwright is available.
                </p>
              </Field>
            )}

            {/* Value (optional numeric weight) */}
            {!isAsset && (
              <Field label="Weight (optional)">
                <input
                  style={{ ...INPUT, width: 80 }}
                  type="number"
                  step="any"
                  value={valueStr}
                  disabled={busy}
                  onChange={(e) => setValueStr(e.target.value)}
                />
              </Field>
            )}

            {needsPromotion && (
              <p style={{ fontSize: 11, color: "var(--orange, #e29632)", marginBottom: 8 }}>
                "{defaultTarget.name}" will be promoted to a container when this child is added.
              </p>
            )}

            {error && <ErrorNote message={error} />}

            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} disabled={busy} style={BTN_SECONDARY}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                style={{ ...BTN_PRIMARY, opacity: busy || !name.trim() ? 0.6 : 1 }}
              >
                {busy ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <SuccessNote message={`"${name}" added.`} />
            {warning && (
              <p style={{ fontSize: 12, color: "var(--orange, #e29632)", marginTop: 6 }}>
                {warning}
              </p>
            )}
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button type="button" onClick={onClose} style={BTN_SECONDARY}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

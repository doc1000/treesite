import { useState, useRef, useEffect } from "react";
import { addPdf, addWebsite, addHtml } from "../api/client.js";

const PLAYWRIGHT_PATTERN = /playwright|chromium|browsertype|executable doesn.t exist|browser.*not.*install/i;

const OVERLAY = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const DIALOG = {
  background: "var(--bg2, #1a1a1a)",
  border: "1px solid var(--border, #333)",
  borderRadius: 8,
  width: 420,
  maxWidth: "calc(100vw - 32px)",
  maxHeight: "calc(100vh - 64px)",
  overflowY: "auto",
  padding: "20px 24px",
  color: "var(--text, #e0e0e0)",
  fontFamily: "inherit",
};

const TABS_ROW = {
  display: "flex",
  gap: 4,
  marginBottom: 18,
  borderBottom: "1px solid var(--line-soft, #2a2a2a)",
  paddingBottom: 0,
};

function TabBtn({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--accent, #4fc)" : "2px solid transparent",
        color: active ? "var(--accent, #4fc)" : "var(--muted, #666)",
        padding: "6px 12px",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, color: "var(--muted, #666)", marginBottom: 3 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT_STYLE = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--bg3, #141414)",
  border: "1px solid var(--border, #333)",
  borderRadius: 4,
  color: "var(--text, #e0e0e0)",
  padding: "5px 8px",
  fontSize: 13,
  fontFamily: "inherit",
};

const TEXTAREA_STYLE = { ...INPUT_STYLE, resize: "vertical", minHeight: 60 };

function ErrorNote({ message, isPlaywright }) {
  return (
    <p
      style={{
        color: "var(--red, #f55)",
        fontSize: 12,
        margin: "8px 0 0",
        background: "rgba(255,50,50,0.08)",
        padding: "6px 8px",
        borderRadius: 4,
      }}
    >
      {isPlaywright
        ? "Screenshot failed (Playwright not installed). The card was not created — install Playwright to use this feature."
        : message}
    </p>
  );
}

function SuccessNote({ message }) {
  return (
    <p style={{ color: "var(--green, #4fc)", fontSize: 12, margin: "8px 0 0" }}>{message}</p>
  );
}

// ── PDF Tab ──────────────────────────────────────────────────────────────────

function PdfTab({ artifactName, defaultSection, onSuccess, onClose }) {
  const [form, setForm] = useState({ name: "", section: defaultSection ?? "", description: "", value: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [isPlaywright, setIsPlaywright] = useState(false);
  const fileRef = useRef();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError("Please select a PDF file."); return; }
    setBusy(true);
    setError(null);
    try {
      const payload = { name: form.name.trim(), section: form.section.trim(), description: form.description, value: form.value !== "" ? Number(form.value) : undefined };
      const result = await addPdf(artifactName, payload, file);
      if (!result.ok) {
        const msg = result.error?.message || "add-pdf failed";
        setIsPlaywright(PLAYWRIGHT_PATTERN.test(msg));
        setError(msg);
        return;
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Name *">
        <input style={INPUT_STYLE} value={form.name} required disabled={busy} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Section *">
        <input style={INPUT_STYLE} value={form.section} required disabled={busy} onChange={(e) => setForm({ ...form, section: e.target.value })} />
      </Field>
      <Field label="Description">
        <textarea style={TEXTAREA_STYLE} value={form.description} disabled={busy} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      <Field label="Value">
        <input style={INPUT_STYLE} type="number" step="any" value={form.value} disabled={busy} onChange={(e) => setForm({ ...form, value: e.target.value })} />
      </Field>
      <Field label="PDF file *">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          required
          disabled={busy}
          style={{ ...INPUT_STYLE, padding: "3px 6px", cursor: "pointer" }}
          onChange={(e) => setFile(e.target.files[0] ?? null)}
        />
      </Field>
      {file && (
        <p style={{ fontSize: 11, color: "var(--muted, #666)", margin: "-6px 0 8px" }}>
          {file.name} ({(file.size / 1024).toFixed(0)} KB)
        </p>
      )}
      {error && <ErrorNote message={error} isPlaywright={isPlaywright} />}
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} disabled={busy} style={{ padding: "6px 14px", cursor: "pointer", background: "none", border: "1px solid var(--border, #333)", color: "var(--muted, #666)", borderRadius: 4 }}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !form.name.trim() || !form.section.trim() || !file} style={{ padding: "6px 14px", cursor: "pointer", background: "var(--accent, #4fc)", color: "#000", border: "none", borderRadius: 4, fontWeight: 600 }}>
          {busy ? "Uploading…" : "Add PDF"}
        </button>
      </div>
    </form>
  );
}

// ── Website Tab ──────────────────────────────────────────────────────────────

function WebsiteTab({ artifactName, defaultSection, onSuccess, onClose }) {
  const [form, setForm] = useState({ name: "", section: defaultSection ?? "", url: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [isPlaywright, setIsPlaywright] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.url.startsWith("http")) { setError("URL must start with http:// or https://"); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await addWebsite(artifactName, { name: form.name.trim(), section: form.section.trim(), url: form.url.trim() });
      if (!result.ok) {
        const msg = result.error?.message || "add-website failed";
        setIsPlaywright(PLAYWRIGHT_PATTERN.test(msg));
        setError(msg);
        return;
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Name *">
        <input style={INPUT_STYLE} value={form.name} required disabled={busy} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Section *">
        <input style={INPUT_STYLE} value={form.section} required disabled={busy} onChange={(e) => setForm({ ...form, section: e.target.value })} />
      </Field>
      <Field label="URL *">
        <input style={INPUT_STYLE} type="url" value={form.url} required disabled={busy} placeholder="https://example.com" onChange={(e) => setForm({ ...form, url: e.target.value })} />
      </Field>
      <p style={{ fontSize: 11, color: "var(--muted, #666)", margin: "0 0 4px" }}>
        Screenshot preview requires Playwright. If unavailable, the card will not be created.
      </p>
      {error && <ErrorNote message={error} isPlaywright={isPlaywright} />}
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} disabled={busy} style={{ padding: "6px 14px", cursor: "pointer", background: "none", border: "1px solid var(--border, #333)", color: "var(--muted, #666)", borderRadius: 4 }}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !form.name.trim() || !form.section.trim() || !form.url.trim()} style={{ padding: "6px 14px", cursor: "pointer", background: "var(--accent, #4fc)", color: "#000", border: "none", borderRadius: 4, fontWeight: 600 }}>
          {busy ? "Adding…" : "Add Website"}
        </button>
      </div>
    </form>
  );
}

// ── HTML Tab ─────────────────────────────────────────────────────────────────

function HtmlTab({ artifactName, defaultSection, onSuccess, onClose }) {
  const [form, setForm] = useState({ name: "", section: defaultSection ?? "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [isPlaywright, setIsPlaywright] = useState(false);
  const fileRef = useRef();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError("Please select an HTML file."); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await addHtml(artifactName, { name: form.name.trim(), section: form.section.trim() }, file);
      if (!result.ok) {
        const msg = result.error?.message || "add-html failed";
        setIsPlaywright(PLAYWRIGHT_PATTERN.test(msg));
        setError(msg);
        return;
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Name *">
        <input style={INPUT_STYLE} value={form.name} required disabled={busy} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Section *">
        <input style={INPUT_STYLE} value={form.section} required disabled={busy} onChange={(e) => setForm({ ...form, section: e.target.value })} />
      </Field>
      <Field label="HTML file *">
        <input
          ref={fileRef}
          type="file"
          accept=".html,.htm"
          required
          disabled={busy}
          style={{ ...INPUT_STYLE, padding: "3px 6px", cursor: "pointer" }}
          onChange={(e) => setFile(e.target.files[0] ?? null)}
        />
      </Field>
      {file && (
        <p style={{ fontSize: 11, color: "var(--muted, #666)", margin: "-6px 0 8px" }}>
          {file.name} ({(file.size / 1024).toFixed(0)} KB)
        </p>
      )}
      <p style={{ fontSize: 11, color: "var(--muted, #666)", margin: "0 0 4px" }}>
        Preview screenshot requires Playwright. If unavailable, the card will not be created.
      </p>
      {error && <ErrorNote message={error} isPlaywright={isPlaywright} />}
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} disabled={busy} style={{ padding: "6px 14px", cursor: "pointer", background: "none", border: "1px solid var(--border, #333)", color: "var(--muted, #666)", borderRadius: 4 }}>
          Cancel
        </button>
        <button type="submit" disabled={busy || !form.name.trim() || !form.section.trim() || !file} style={{ padding: "6px 14px", cursor: "pointer", background: "var(--accent, #4fc)", color: "#000", border: "none", borderRadius: 4, fontWeight: 600 }}>
          {busy ? "Uploading…" : "Add HTML"}
        </button>
      </div>
    </form>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "pdf", label: "PDF" },
  { id: "website", label: "Website" },
  { id: "html", label: "HTML" },
];

export default function AddAssetDialog({ isOpen, onClose, artifactName, defaultSection, onSuccess }) {
  const [activeTab, setActiveTab] = useState("pdf");

  useEffect(() => {
    if (isOpen) setActiveTab("pdf");
  }, [isOpen]);

  if (!isOpen) return null;

  const tabProps = { artifactName, defaultSection, onSuccess, onClose };

  return (
    <div style={OVERLAY} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={DIALOG} role="dialog" aria-modal="true" aria-label="Add Asset">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Add Asset</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--muted, #666)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={TABS_ROW}>
          {TABS.map((t) => (
            <TabBtn key={t.id} label={t.label} active={activeTab === t.id} onClick={() => setActiveTab(t.id)} />
          ))}
        </div>

        {activeTab === "pdf" && <PdfTab key="pdf" {...tabProps} />}
        {activeTab === "website" && <WebsiteTab key="website" {...tabProps} />}
        {activeTab === "html" && <HtmlTab key="html" {...tabProps} />}
      </div>
    </div>
  );
}

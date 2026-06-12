export default function DeployTab({ deployState, deployPending, devServerWarm, onDeploy, onStop }) {
  if (deployPending) {
    return (
      <div className="deploy-tab deploy-tab-empty">
        <div style={{ textAlign: "center", padding: 24 }}>
          <p style={{ color: "var(--muted)", margin: "0 0 8px" }}>Starting handler editor…</p>
          <p style={{ color: "var(--muted)", fontSize: 12, margin: 0 }}>
            The handler dev server boots once when studio starts. This screen only appears if
            it is still warming up (~30 s).
          </p>
          <div className="deploy-spinner" style={{ marginTop: 16 }} />
        </div>
      </div>
    );
  }

  if (!deployState?.url) {
    return (
      <div className="deploy-tab deploy-tab-empty">
        <p style={{ color: "var(--muted)" }}>
          {devServerWarm
            ? "Preview not open — View uses the built site; Edit uses the live handler."
            : "Handler editor is starting in the background…"}
        </p>
        <div className="deploy-tab-actions">
          <button type="button" onClick={() => onDeploy("view")}>
            Deploy View
          </button>
          <button type="button" className="mode" onClick={() => onDeploy("edit")}>
            Edit preview
          </button>
        </div>
      </div>
    );
  }

  const { url, mode } = deployState;

  return (
    <div className="deploy-tab">
      <div className="deploy-tab-bar">
        <span className={`deploy-badge deploy-badge-${mode}`}>
          {mode === "edit" ? "Edit" : "View"}
        </span>
        <button
          type="button"
          className={mode === "view" ? "deploy-mode-active" : ""}
          onClick={() => onDeploy("view")}
          style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}
        >
          View
        </button>
        <button
          type="button"
          className={mode === "edit" ? "deploy-mode-active" : ""}
          onClick={() => onDeploy("edit")}
          style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}
        >
          Edit
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer">
          ↗
        </a>
        <button type="button" className="deploy-stop-btn" onClick={onStop}>
          Stop
        </button>
      </div>
      <iframe
        key={url}
        title="Deployed artifact preview"
        src={url}
        sandbox="allow-same-origin allow-scripts"
        className="deploy-iframe"
      />
    </div>
  );
}

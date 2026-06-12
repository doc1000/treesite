export default function DeployTab({ deployState, deployPending, devServerWarm, onDeploy, onStop }) {
  // Show a spinner while waiting for the bridge. The message differs: if the
  // dev server was already warm, the switch is fast and we just say "switching".
  if (deployPending) {
    return (
      <div className="deploy-tab deploy-tab-empty">
        <div style={{ textAlign: "center", padding: 24 }}>
          {devServerWarm ? (
            <p style={{ color: "var(--muted)", margin: "0 0 8px" }}>Switching…</p>
          ) : (
            <>
              <p style={{ color: "var(--muted)", margin: "0 0 8px" }}>Starting editor…</p>
              <p style={{ color: "var(--muted)", fontSize: 12, margin: 0 }}>
                First launch takes ~30 s (Vite dev boot). Subsequent switches are instant.
              </p>
            </>
          )}
          <div className="deploy-spinner" style={{ marginTop: 16 }} />
        </div>
      </div>
    );
  }

  if (!deployState?.url) {
    return (
      <div className="deploy-tab deploy-tab-empty">
        <p style={{ color: "var(--muted)" }}>Not deployed</p>
        <div className="deploy-tab-actions">
          <button type="button" onClick={() => onDeploy("view")}>
            Deploy View
          </button>
          <button type="button" className="mode" onClick={() => onDeploy("edit")}>
            Edit (dev)
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
        <button type="button" onClick={() => onDeploy("view")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}>
          View
        </button>
        <button type="button" onClick={() => onDeploy("edit")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}>
          Edit
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer">
          ↗
        </a>
        <button
          type="button"
          className="deploy-stop-btn"
          onClick={onStop}
        >
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

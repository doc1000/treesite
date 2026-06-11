export default function DeployTab({ deployState, onDeploy, onStop }) {
  if (!deployState?.url) {
    return (
      <div className="deploy-tab deploy-tab-empty">
        <p>Not deployed</p>
        <div className="deploy-tab-actions">
          <button type="button" onClick={() => onDeploy("view")}>
            Deploy View
          </button>
          <button type="button" className="mode" onClick={() => onDeploy("edit")}>
            Edit
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
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open in new tab
        </a>
        <button type="button" onClick={onStop}>
          Stop deploy
        </button>
      </div>
      <iframe
        title="Deployed artifact preview"
        src={url}
        sandbox="allow-same-origin allow-scripts"
        className="deploy-iframe"
      />
    </div>
  );
}

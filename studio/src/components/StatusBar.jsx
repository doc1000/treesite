export default function StatusBar({
  deployState,
  validationResult,
  artifactName,
  itemCount,
  onToggleValidation,
}) {
  const deployed = Boolean(deployState?.url);
  const deployDotClass = deployed ? "dot" : "dot idle";

  let validationBadge = "Not validated";
  let validationClass = "status-badge idle";
  if (validationResult) {
    const errors = validationResult.errors?.length ?? 0;
    const warnings = validationResult.warnings?.length ?? 0;
    if (validationResult.valid && errors === 0 && warnings === 0) {
      validationBadge = "Valid";
      validationClass = "status-badge valid";
    } else if (errors > 0) {
      validationBadge = `${errors} error${errors === 1 ? "" : "s"}`;
      validationClass = "status-badge error";
    } else if (warnings > 0) {
      validationBadge = `${warnings} warning${warnings === 1 ? "" : "s"}`;
      validationClass = "status-badge warn";
    } else {
      validationBadge = "Valid";
      validationClass = "status-badge valid";
    }
  }

  return (
    <footer className="status-bar" aria-label="Studio status">
      <div className="status-item">
        <span className={deployDotClass} aria-hidden="true" />
        <span>{deployed ? "Local Site Deployed" : "Deploy: Not deployed"}</span>
      </div>
      <button
        type="button"
        className={`status-item status-validation-btn ${validationClass}`}
        onClick={onToggleValidation}
        disabled={!validationResult}
      >
        Validation: {validationBadge}
      </button>
      {artifactName && (
        <div className="status-item status-artifact-meta">
          <span>
            {artifactName}
            {itemCount != null ? ` · ${itemCount} items` : ""}
          </span>
        </div>
      )}
    </footer>
  );
}

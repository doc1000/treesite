export default function ValidationPanel({ result, onClose }) {
  if (!result) return null;

  const errors = result.errors ?? [];
  const warnings = result.warnings ?? [];
  const valid = result.valid && errors.length === 0;

  let headerClass = "validation-header valid";
  let headerText = "Valid";
  if (!valid) {
    headerClass = "validation-header invalid";
    headerText = `${errors.length} error${errors.length === 1 ? "" : "s"}${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}`;
  } else if (warnings.length) {
    headerClass = "validation-header warn";
    headerText = `Valid with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`;
  }

  return (
    <section className="validation-panel" aria-label="Validation results">
      <div className="validation-panel-top">
        <h3 className={headerClass}>{headerText}</h3>
        <button type="button" className="validation-close" onClick={onClose} aria-label="Close validation panel">
          ×
        </button>
      </div>
      {errors.length > 0 && (
        <div className="validation-section">
          <h4>Errors</h4>
          <ul>
            {errors.map((e, i) => (
              <li key={`e-${i}`}>
                <code>{e.code}</code> {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="validation-section">
          <h4>Warnings</h4>
          <ul>
            {warnings.map((w, i) => (
              <li key={`w-${i}`}>
                <code>{w.code}</code> {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

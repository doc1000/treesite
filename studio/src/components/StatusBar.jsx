export default function StatusBar({ deployStatus, validationStatus }) {
  const deployDotClass =
    deployStatus === "deployed" ? "dot" : deployStatus === "warning" ? "dot warn" : "dot idle";

  return (
    <footer className="status-bar" aria-label="Studio status">
      <div className="status-item">
        <span className={deployDotClass} aria-hidden="true" />
        <span>Deploy: {deployStatus === "deployed" ? "Local site deployed" : "Not deployed"}</span>
      </div>
      <div className="status-item">
        <span>Validation: {validationStatus}</span>
      </div>
    </footer>
  );
}

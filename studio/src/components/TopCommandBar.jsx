import { useRef } from "react";

const ACTIONS = [
  { key: "see", icon: "🗂", label: "See Artifacts" },
  { key: "import", icon: "⬇", label: "Import Artifact" },
  { key: "validate", icon: "◇", label: "Validate Artifact" },
  { key: "deployView", icon: "⬡", label: "Deploy View" },
  { key: "deployEdit", icon: "✎", label: "Edit Artifact" },
  { key: "export", icon: "↪", label: "Export Artifact" },
];

export default function TopCommandBar({
  className = "",
  deployMode,
  busy,
  onSeeArtifacts,
  onImport,
  onValidate,
  onDeployView,
  onDeployEdit,
  onExport,
}) {
  const fileRef = useRef(null);

  const handlers = {
    see: onSeeArtifacts,
    import: () => fileRef.current?.click(),
    validate: onValidate,
    deployView: onDeployView,
    deployEdit: onDeployEdit,
    export: onExport,
  };

  return (
    <header className={className} aria-label="Artifact workflow commands">
      <input
        ref={fileRef}
        type="file"
        accept=".zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImport?.(file);
          e.target.value = "";
        }}
      />
      {ACTIONS.map((action) => {
        const active =
          action.key === "deployEdit" && deployMode === "edit"
          || action.key === "deployView" && deployMode === "view";
        return (
          <button
            key={action.label}
            type="button"
            className={`top-action${active ? " active" : ""}`}
            disabled={busy}
            onClick={() => handlers[action.key]?.()}
          >
            <span className="icon">{action.icon}</span>
            <small>{action.label}</small>
          </button>
        );
      })}
    </header>
  );
}

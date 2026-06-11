const ACTIONS = [
  { icon: "🗂", label: "See Artifacts" },
  { icon: "⬇", label: "Import Artifact" },
  { icon: "◇", label: "Validate Artifact" },
  { icon: "⬡", label: "Deploy View" },
  { icon: "✎", label: "Edit Artifact", active: true },
  { icon: "↪", label: "Export Artifact" },
];

export default function TopCommandBar({ className = "" }) {
  return (
    <header className={className} aria-label="Artifact workflow commands">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`top-action${action.active ? " active" : ""}`}
          onClick={() => {}}
        >
          <span className="icon">{action.icon}</span>
          <small>{action.label}</small>
        </button>
      ))}
    </header>
  );
}

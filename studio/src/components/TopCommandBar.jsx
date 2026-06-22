import { useCallback, useEffect, useRef, useState } from "react";
import { INTENTS } from "../nav/intents.js";

const ACTIONS = [
  { key: "see", icon: "🗂", label: "See Artifacts" },
  { key: "newProject", icon: "＋", label: "New Project" },
  { key: "import", icon: "⬇", label: "Import Artifact" },
  { key: "validate", icon: "◇", label: "Validate Artifact" },
  { key: "openPreview", icon: "⬡", label: "Open Preview" },
  { key: "editStudio", icon: "✎", label: "Edit in Studio" },
  { key: "export", icon: "↪", label: "Export Artifact" },
];

export default function TopCommandBar({
  className = "",
  editStudioActive,
  busy,
  onSeeArtifacts,
  onNewProject,
  onImport,
  onValidate,
  onOpenPreview,
  onEditInStudio,
  onExport,
  navigation,
  zoneActive,
}) {
  const fileRef = useRef(null);
  const buttonRefs = useRef([]);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const handlers = {
    see: onSeeArtifacts,
    newProject: onNewProject,
    import: () => fileRef.current?.click(),
    validate: onValidate,
    openPreview: onOpenPreview,
    editStudio: onEditInStudio,
    export: onExport,
  };

  const focusButton = useCallback((index) => {
    const i = ((index % ACTIONS.length) + ACTIONS.length) % ACTIONS.length;
    setFocusedIndex(i);
    requestAnimationFrame(() => buttonRefs.current[i]?.focus?.({ preventScroll: true }));
  }, []);

  const handleIntent = useCallback(
    (intent) => {
      if (intent === INTENTS.LEFT) {
        focusButton(focusedIndex - 1);
        return;
      }
      if (intent === INTENTS.RIGHT) {
        focusButton(focusedIndex + 1);
        return;
      }
      if (intent === INTENTS.SELECT) {
        const action = ACTIONS[focusedIndex];
        if (action && !busy) handlers[action.key]?.();
      }
    },
    [busy, focusedIndex, focusButton],
  );

  useEffect(() => {
    if (!navigation) return undefined;
    navigation.registerZone("topbar", {
      onIntent: handleIntent,
      focus: () => focusButton(focusedIndex),
    });
    return () => navigation.unregisterZone("topbar");
  }, [navigation, handleIntent, focusButton, focusedIndex]);

  const shellClass = `${className}${zoneActive ? " zone-active" : ""}`;

  return (
    <header className={shellClass} aria-label="Artifact workflow commands">
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
      {ACTIONS.map((action, index) => {
        const active = action.key === "editStudio" && editStudioActive;
        const disabled = busy;
        const navFocus = index === focusedIndex;
        return (
          <button
            key={action.label}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            className={`top-action${active ? " active" : ""}${navFocus ? " nav-focus" : ""}`}
            disabled={disabled}
            tabIndex={navFocus ? 0 : -1}
            onClick={() => handlers[action.key]?.()}
            onFocus={() => setFocusedIndex(index)}
          >
            <span className="icon">{action.icon}</span>
            <small>{action.label}</small>
          </button>
        );
      })}
    </header>
  );
}

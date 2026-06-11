import { useCallback, useEffect, useRef, useState } from "react";
import { INTENTS } from "../nav/intents.js";

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
  navigation,
  zoneActive,
}) {
  const fileRef = useRef(null);
  const buttonRefs = useRef([]);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const handlers = {
    see: onSeeArtifacts,
    import: () => fileRef.current?.click(),
    validate: onValidate,
    deployView: onDeployView,
    deployEdit: onDeployEdit,
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
        const active =
          action.key === "deployEdit" && deployMode === "edit"
          || action.key === "deployView" && deployMode === "view";
        const navFocus = index === focusedIndex;
        return (
          <button
            key={action.label}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            className={`top-action${active ? " active" : ""}${navFocus ? " nav-focus" : ""}`}
            disabled={busy}
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

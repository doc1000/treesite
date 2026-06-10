import { useEffect, useState } from "react";
import TreeSite from "./TreeSite";
import { loadArtifactBundle, resolveArtifactBase } from "./artifactLoader.js";
import "./treesite.css";
import "./contactTiles.css";

function DevArtifactSwitcher({ onReload }) {
  const [draft, setDraft] = useState(() => {
    const q = new URLSearchParams(window.location.search).get("artifact");
    return q || "";
  });

  function apply() {
    const url = new URL(window.location.href);
    const trimmed = draft.trim();
    if (trimmed) url.searchParams.set("artifact", trimmed);
    else url.searchParams.delete("artifact");
    window.history.replaceState({}, "", url);
    onReload();
  }

  return (
    <div className="dev-artifact-switcher" aria-label="Development artifact switcher">
      <label>
        Artifact base URL
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="/artifact or http://localhost:5199"
          spellCheck={false}
        />
      </label>
      <button type="button" onClick={apply}>
        Load
      </button>
    </div>
  );
}

export default function App() {
  const [loadState, setLoadState] = useState({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const base = resolveArtifactBase();

    setLoadState({ status: "loading" });

    loadArtifactBundle(base)
      .then(bundle => {
        if (!cancelled) {
          setLoadState({ status: "ready", ...bundle });
        }
      })
      .catch(err => {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message: err?.message || String(err),
            artifactBase: base
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (loadState.status === "loading") {
    return (
      <div className="treesite-shell treesite-load-state" role="status">
        <p>Loading site…</p>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <>
        <div className="treesite-shell treesite-load-state treesite-load-state--error" role="alert">
          <h1>Could not load artifact</h1>
          <p>{loadState.message}</p>
          {loadState.artifactBase ? (
            <p className="treesite-load-state__base">Base: {loadState.artifactBase}</p>
          ) : null}
        </div>
        {import.meta.env.DEV ? (
          <DevArtifactSwitcher onReload={() => setReloadToken(t => t + 1)} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <TreeSite
        siteData={loadState.siteData}
        artifactBase={loadState.artifactBase}
        defaultSchemeId={loadState.meta.defaultSchemeId}
      />
      {import.meta.env.DEV ? (
        <DevArtifactSwitcher onReload={() => setReloadToken(t => t + 1)} />
      ) : null}
    </>
  );
}

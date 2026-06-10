import { useEffect, useState } from "react";
import TreeSite from "./TreeSite";
import { loadArtifactBundle, resolveArtifactBase } from "./artifactLoader.js";
import "./treesite.css";
import "./contactTiles.css";

export default function App() {
  const [loadState, setLoadState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const base = resolveArtifactBase();

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
  }, []);

  if (loadState.status === "loading") {
    return (
      <div className="treesite-shell treesite-load-state" role="status">
        <p>Loading site…</p>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="treesite-shell treesite-load-state treesite-load-state--error" role="alert">
        <h1>Could not load artifact</h1>
        <p>{loadState.message}</p>
        {loadState.artifactBase ? (
          <p className="treesite-load-state__base">Base: {loadState.artifactBase}</p>
        ) : null}
      </div>
    );
  }

  return (
    <TreeSite
      siteData={loadState.siteData}
      artifactBase={loadState.artifactBase}
      defaultSchemeId={loadState.meta.defaultSchemeId}
    />
  );
}

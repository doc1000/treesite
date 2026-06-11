import { buildBreadcrumb } from "../lib/manifestTree.js";

function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith("#")) {
    return `rgba(53, 120, 255, ${alpha})`;
  }
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function TreemapWorkspace({ manifest, selectedNodeId, onSelectNode }) {
  const sections = manifest.children ?? [];
  const breadcrumb = buildBreadcrumb(manifest, selectedNodeId);

  return (
    <section className="workspace-canvas">
      <div className="breadcrumb">Path: {breadcrumb}</div>
      <div className="treemap-grid" role="application" aria-label="Treemap workspace">
        {sections.map((section) => {
          const base = section.color || "#3578ff";
          return (
            <article
              key={section.id}
              className="section-cell"
              style={{
                background: `linear-gradient(145deg, ${hexToRgba(base, 0.35)}, ${hexToRgba(base, 0.08)})`,
                borderColor: hexToRgba(base, 0.45),
              }}
            >
              <div className="section-cell-label">{section.name}</div>
              <div className="section-children">
                {(section.children ?? []).map((child) => {
                  const selected = child.id === selectedNodeId;
                  return (
                    <button
                      key={child.id}
                      type="button"
                      className={`child-card${selected ? " selected" : ""}`}
                      onClick={() => onSelectNode(child.id)}
                    >
                      <span>{child.name || child.title}</span>
                      {child.type ? <small>{child.type}</small> : null}
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      <div className="legend">
        <span><i className="badge b-purple" /> Section</span>
        <span><i className="badge b-green" /> Text</span>
        <span><i className="badge b-blue" /> Website</span>
        <span><i className="badge b-orange" /> PDF</span>
      </div>
    </section>
  );
}

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { buildBreadcrumb, findNodeById } from "../lib/manifestTree.js";

const TYPE_COLORS = {
  section: "#8b79b8",
  text: "#5a9e7a",
  website: "#3578ff",
  pdf: "#e87d40",
  href: "#3578ff",
  link: "#3578ff",
  contact: "#5a9e7a",
  htmlCard: "#e8c040",
};

function nodeColor(node) {
  if (node.color) return node.color;
  return TYPE_COLORS[node.type] || "#3578ff";
}

function truncate(str, maxChars) {
  if (!str) return "";
  return str.length > maxChars ? str.slice(0, maxChars - 1) + "…" : str;
}

export default function TreemapWorkspace({
  manifest,
  selectedNodeId,
  onSelectNode,
  focusNodeId,
  onSetFocus,
}) {
  const containerRef = useRef(null);
  const [cells, setCells] = useState([]);
  const [dims, setDims] = useState({ w: 800, h: 500 });

  const focusRoot = focusNodeId
    ? (findNodeById(manifest, focusNodeId) ?? manifest)
    : manifest;

  const breadcrumb = buildBreadcrumb(manifest, focusNodeId ?? selectedNodeId);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 20 && height > 20) setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Recompute layout when root or dimensions change
  useEffect(() => {
    if (!focusRoot?.children?.length) {
      setCells([]);
      return;
    }
    const { w, h } = dims;

    const root = d3
      .hierarchy(focusRoot, (n) => n.children)
      .sum((n) => (!n.children?.length ? Math.max(n.value ?? 1, 1) : 0))
      .sort((a, b) => b.value - a.value);

    d3.treemap()
      .tile(d3.treemapSquarify)
      .size([w, h])
      .paddingOuter(4)
      .paddingInner(2)
      .round(true)(root);

    const newCells = (root.children ?? []).map((node) => ({
      id: node.data.id,
      slug: node.data.slug,
      name: node.data.name || node.data.title || node.data.slug || "",
      type: node.data.type,
      color: nodeColor(node.data),
      hasChildren: (node.data.children?.length ?? 0) > 0,
      x0: node.x0,
      y0: node.y0,
      x1: node.x1,
      y1: node.y1,
    }));

    setCells(newCells);
  }, [focusRoot, dims]);

  const handleClick = useCallback(
    (cell) => { if (cell.id) onSelectNode(cell.id); },
    [onSelectNode],
  );

  const handleDoubleClick = useCallback(
    (cell) => { if (cell.hasChildren && cell.id) onSetFocus(cell.id); },
    [onSetFocus],
  );

  return (
    <section className="workspace-canvas">
      <div className="breadcrumb">
        <button
          type="button"
          onClick={() => onSetFocus(null)}
          title="Go to root"
          style={{
            marginRight: 6,
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ⌂
        </button>
        <span>{breadcrumb || manifest.displayName || "Root"}</span>
        {focusNodeId && (
          <button
            type="button"
            onClick={() => onSetFocus(null)}
            style={{
              marginLeft: 10,
              fontSize: 11,
              color: "var(--muted)",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "1px 6px",
              cursor: "pointer",
            }}
          >
            ↑ Up
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 200 }}
      >
        <svg
          width={dims.w}
          height={dims.h}
          style={{ display: "block", userSelect: "none" }}
          role="application"
          aria-label="Treemap workspace"
        >
          {cells.map((cell) => {
            const cw = cell.x1 - cell.x0;
            const ch = cell.y1 - cell.y0;
            const selected = Boolean(cell.id && cell.id === selectedNodeId);
            const labelSize = Math.min(13, Math.max(9, cw / 12));
            const maxChars = Math.floor(cw / (labelSize * 0.6));

            return (
              <g
                key={cell.id || cell.slug}
                transform={`translate(${cell.x0},${cell.y0})`}
                onClick={() => handleClick(cell)}
                onDoubleClick={() => handleDoubleClick(cell)}
                style={{ cursor: cell.hasChildren ? "zoom-in" : "pointer" }}
                data-node-id={cell.id}
                data-node-slug={cell.slug}
                role="button"
                aria-label={cell.name}
                aria-pressed={selected}
              >
                <rect
                  width={cw}
                  height={ch}
                  rx={8}
                  ry={8}
                  fill={cell.color}
                  fillOpacity={selected ? 0.88 : 0.52}
                  stroke={selected ? "#ffffff" : cell.color}
                  strokeWidth={selected ? 2.5 : 0.8}
                  strokeOpacity={selected ? 1 : 0.5}
                />
                {cw > 36 && ch > 22 && (
                  <text
                    x={10}
                    y={Math.min(20, ch / 2 + 5)}
                    fill="#ffffff"
                    fontSize={labelSize}
                    fontWeight="600"
                    style={{ pointerEvents: "none" }}
                  >
                    {truncate(cell.name, maxChars)}
                  </text>
                )}
                {cw > 60 && ch > 40 && cell.type && (
                  <text
                    x={10}
                    y={Math.min(34, ch / 2 + 18)}
                    fill="#ffffff"
                    fontSize={9}
                    fillOpacity={0.65}
                    style={{ pointerEvents: "none" }}
                  >
                    {cell.type}
                    {cell.hasChildren ? " ›" : ""}
                  </text>
                )}
              </g>
            );
          })}
          {cells.length === 0 && (
            <text x={dims.w / 2} y={dims.h / 2} textAnchor="middle" fill="#888" fontSize={13}>
              {manifest?.children?.length ? "No children to display" : "No manifest loaded"}
            </text>
          )}
        </svg>
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

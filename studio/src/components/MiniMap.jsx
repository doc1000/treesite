import { useMemo } from "react";
import * as d3 from "d3";

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

const W = 220;
const H = 72;

export default function MiniMap({
  manifest,
  focusNodeId,
  selectedNodeId,
  onSelectNode,
  onSetFocus,
}) {
  const { allCells, focusRect } = useMemo(() => {
    if (!manifest?.children?.length) return { allCells: [], focusRect: null };

    const root = d3
      .hierarchy(manifest, (n) => n.children)
      .sum((n) => (!n.children?.length ? Math.max(n.value ?? 1, 1) : 0))
      .sort((a, b) => b.value - a.value);

    d3.treemap()
      .tile(d3.treemapSquarify)
      .size([W, H])
      .paddingInner(1)
      .paddingOuter(1)(root);

    const collected = [];
    root.each((node) => {
      collected.push({
        id: node.data.id,
        slug: node.data.slug,
        color: nodeColor(node.data),
        hasChildren: (node.data.children?.length ?? 0) > 0,
        x0: node.x0,
        y0: node.y0,
        x1: node.x1,
        y1: node.y1,
      });
    });

    let rect = null;
    if (focusNodeId) {
      root.each((node) => {
        if (node.data.id === focusNodeId) {
          rect = { x0: node.x0, y0: node.y0, x1: node.x1, y1: node.y1 };
        }
      });
    }

    return { allCells: collected, focusRect: rect };
  }, [manifest, focusNodeId]);

  return (
    <section className="minimap-wrap">
      <div className="minimap-title">Mini-map</div>
      <svg
        width={W}
        height={H}
        className="minimap"
        style={{ display: "block" }}
        aria-label="Treemap minimap overview"
      >
        {allCells.map((cell, i) => (
          <rect
            key={cell.id || cell.slug || i}
            x={cell.x0}
            y={cell.y0}
            width={Math.max(0, cell.x1 - cell.x0)}
            height={Math.max(0, cell.y1 - cell.y0)}
            fill={cell.color}
            fillOpacity={cell.id === selectedNodeId ? 0.95 : 0.55}
            stroke={cell.id === selectedNodeId ? "#ffffff" : "none"}
            strokeWidth={1}
            onClick={() => {
              if (cell.id) onSelectNode?.(cell.id);
              if (cell.hasChildren && cell.id) onSetFocus?.(cell.id);
            }}
            style={{ cursor: "pointer" }}
          />
        ))}
        {focusRect && (
          <rect
            x={focusRect.x0}
            y={focusRect.y0}
            width={Math.max(0, focusRect.x1 - focusRect.x0)}
            height={Math.max(0, focusRect.y1 - focusRect.y0)}
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={2}
            strokeDasharray="4,2"
            style={{ pointerEvents: "none" }}
          />
        )}
      </svg>
      <div className="mini-controls">
        <button type="button" onClick={() => onSetFocus?.(null)}>⌂ Root</button>
      </div>
    </section>
  );
}

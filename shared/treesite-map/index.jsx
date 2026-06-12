/**
 * TreesiteMap — portable mini-map component.
 *
 * Self-contained: computes its own treemap layout from a plain JSON tree.
 * Embeddable anywhere — no dependency on the outer app's navigation state.
 *
 * Props
 * ─────
 * tree          object    Plain tree: { name, children: [...], value? }
 *                         Leaf nodes need a numeric `value` or default to 1.
 * getNodeId     fn(data)  Returns a string ID for a node's raw data.
 *                         Default: data.id ?? path-from-root (see below).
 * getNodeColor  fn(data)  Returns a CSS color for a node's raw data.
 *                         Default: type-based color map.
 * selectedId    string    Highlight the selected node (solid ring).
 * focusId       string    Show a dashed focus rectangle.
 * goldenPath    string[]  Array of node IDs for the recent navigation trail.
 *                         Rendered as a glowing gold line with dots.
 * labels        bool      Show a section-name strip below the map (default: false).
 * onSelect      fn(id)    Called with the node's ID when clicked. First click selects;
 *                         a second click on the same node calls onOpen (if provided).
 * onOpen        fn(id)    Called on the second activation of the same node ("Go").
 * width         number    SVG width  (default 220)
 * height        number    SVG height (default 80)
 */
import { useMemo, useState } from "react";
import * as d3 from "d3";

// ── Defaults ───────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  section:  "#8b79b8",
  text:     "#5a9e7a",
  website:  "#3578ff",
  pdf:      "#e87d40",
  href:     "#3578ff",
  link:     "#3578ff",
  contact:  "#5a9e7a",
  htmlCard: "#e8c040",
};

function defaultColor(data) {
  if (data.color) return data.color;
  return TYPE_COLORS[data.type] || "#3578ff";
}

// ── Layout ─────────────────────────────────────────────────────────────────────

function computeLayout(tree, width, height) {
  const root = d3
    .hierarchy(tree, (n) => n.children)
    .sum((n) => (!n.children?.length ? Math.max(n.value ?? 1, 1) : 0))
    .sort((a, b) => b.value - a.value);

  d3.treemap()
    .tile(d3.treemapSquarify)
    .size([width, height])
    .paddingInner(1)
    .paddingOuter(1)(root);

  // Assign IDs: use path-from-root as stable default
  root.each((node) => {
    node._pathId = node
      .ancestors()
      .reverse()
      .map((n) => n.data.name)
      .join(" / ");
  });

  return root;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TreesiteMap({
  tree,
  getNodeId,
  getNodeColor,
  selectedId,
  focusId,
  goldenPath = [],
  labels = false,
  onSelect,
  onOpen,
  width = 220,
  height = 80,
}) {
  const [lastClickedId, setLastClickedId] = useState(null);

  const { cells, focusRect, trailCells } = useMemo(() => {
    if (!tree?.children?.length) return { cells: [], focusRect: null, trailCells: [] };

    const root = computeLayout(tree, width, height);

    const getId = getNodeId
      ? (d) => getNodeId(d.data)
      : (d) => d._pathId;

    const collected = [];
    root.each((node) => {
      if (node.depth === 0) return; // skip root background
      collected.push({
        id: getId(node),
        data: node.data,
        depth: node.depth,
        x0: node.x0, y0: node.y0,
        x1: node.x1, y1: node.y1,
        hasChildren: (node.data.children?.length ?? 0) > 0,
      });
    });

    // Focus rect
    let rect = null;
    if (focusId) {
      root.each((node) => {
        if (getId(node) === focusId) {
          rect = { x0: node.x0, y0: node.y0, x1: node.x1, y1: node.y1 };
        }
      });
    }

    // Golden path trail
    const trailSet = new Set(goldenPath);
    const trailCells = [];
    if (trailSet.size > 0) {
      root.each((node) => {
        const id = getId(node);
        if (trailSet.has(id)) {
          const cx = (node.x0 + node.x1) / 2;
          const cy = (node.y0 + node.y1) / 2;
          const idx = goldenPath.indexOf(id);
          trailCells.push({ id, cx, cy, idx });
        }
      });
      trailCells.sort((a, b) => a.idx - b.idx);
    }

    return { cells: collected, focusRect: rect, trailCells };
  }, [tree, width, height, getNodeId, focusId, goldenPath]);

  // Golden path line
  const trailPath = useMemo(() => {
    if (trailCells.length < 2) return null;
    return d3
      .line()
      .x((d) => d.cx)
      .y((d) => d.cy)
      .curve(d3.curveCatmullRom.alpha(0.5))(trailCells);
  }, [trailCells]);

  // Collect top-level section names for labels strip
  const topLevelLabels = useMemo(() => {
    if (!labels || !tree?.children?.length) return [];
    return tree.children
      .filter((n) => n.name)
      .map((n) => n.name.split(" ")[0]); // first word to keep compact
  }, [labels, tree]);

  function handleCellClick(id) {
    if (id === lastClickedId) {
      onOpen?.(id);
    } else {
      setLastClickedId(id);
      onSelect?.(id);
    }
  }

  const colorFn = getNodeColor ?? ((data) => defaultColor(data));

  return (
    <div style={{ display: "inline-block" }}>
      <svg
        width={width}
        height={height}
        style={{ display: "block", overflow: "hidden" }}
        aria-label="Treemap mini-map"
      >
        {cells.map((cell) => {
          const isSelected = cell.id === selectedId;
          const isFocused = cell.id === focusId;
          const w = Math.max(0, cell.x1 - cell.x0);
          const h = Math.max(0, cell.y1 - cell.y0);
          if (w <= 0 || h <= 0) return null;
          return (
            <rect
              key={cell.id}
              x={cell.x0}
              y={cell.y0}
              width={w}
              height={h}
              rx={1}
              fill={colorFn(cell.data)}
              fillOpacity={isSelected ? 0.9 : 0.55}
              stroke={isSelected ? "#ffffff" : isFocused ? "rgba(255,255,255,0.5)" : "none"}
              strokeWidth={isSelected ? 1.5 : 1}
              style={{ cursor: "pointer" }}
              onClick={() => handleCellClick(cell.id)}
            />
          );
        })}

        {/* Focus rect */}
        {focusRect && (
          <rect
            x={focusRect.x0}
            y={focusRect.y0}
            width={Math.max(0, focusRect.x1 - focusRect.x0)}
            height={Math.max(0, focusRect.y1 - focusRect.y0)}
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={2}
            strokeDasharray="4,2"
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Golden path line */}
        {trailPath && (
          <path
            d={trailPath}
            fill="none"
            stroke="rgba(255,209,102,0.9)"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: "drop-shadow(0 0 5px rgba(255,209,102,0.7))",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Golden path dots */}
        {trailCells.map((tc, i) => (
          <circle
            key={`trail-${tc.id}-${i}`}
            cx={tc.cx}
            cy={tc.cy}
            r={i === trailCells.length - 1 ? 3.5 : 2.2}
            fill="#ffd166"
            stroke="rgba(0,0,0,0.4)"
            strokeWidth={1}
            opacity={0.4 + ((i + 1) / trailCells.length) * 0.6}
            style={{
              filter: "drop-shadow(0 0 4px rgba(255,209,102,0.8))",
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Star / home anchor */}
        <path
          d={d3.symbol(d3.symbolStar, 64)()}
          transform="translate(10,10)"
          fill="#fff1a8"
          stroke="rgba(0,0,0,0.4)"
          strokeWidth={1}
          style={{
            cursor: "pointer",
            filter: "drop-shadow(0 0 5px rgba(255,209,102,0.9))",
          }}
          onClick={(e) => { e.stopPropagation(); onSelect?.(null); }}
        />
      </svg>

      {/* Labels strip */}
      {labels && topLevelLabels.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 2,
            overflow: "hidden",
            fontSize: 9,
            color: "rgba(255,255,255,0.5)",
            marginTop: 2,
            width,
          }}
        >
          {topLevelLabels.map((lbl) => (
            <span key={lbl} style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", textAlign: "center" }}>
              {lbl}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * TreesiteMap — portable mini-map component.
 *
 * Self-contained: computes its own treemap layout from a plain JSON tree.
 * Embeddable anywhere — no dependency on the outer app's navigation state.
 */
import { useMemo, useState } from "react";
import * as d3 from "d3";
import {
  layoutTreeAtDrill,
  nodeDisplayName,
  shouldNavigateMainOnCellClick,
  captionForModes,
} from "./minimap-utils.js";

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

function defaultColor(data) {
  if (data.color) return data.color;
  return TYPE_COLORS[data.type] || "#3578ff";
}

function computeLayout(tree, width, height) {
  const root = d3
    .hierarchy(tree, (n) => n.children)
    .sum((n) => (!n.children?.length ? Math.max(n.value ?? 1, 1) : 0))
    .sort((a, b) => b.value - a.value);

  d3
    .treemap()
    .tile(d3.treemapSquarify)
    .size([width, height])
    .paddingInner(1)
    .paddingOuter(1)(root);

  root.each((node) => {
    node._pathId = node
      .ancestors()
      .reverse()
      .map((n) => n.data.name)
      .join(" / ");
  });

  return root;
}

export default function TreesiteMap({
  tree,
  getNodeId,
  getNodeColor,
  selectedId,
  focusId,
  drillId = null,
  onDrillChange,
  goldenPath = [],
  labels = false,
  navMode = "explore",
  labelMode = "hover",
  onSelect,
  onOpen,
  onGo,
  onHome,
  width = 220,
  height = 80,
}) {
  const [lastClickedId, setLastClickedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  const getId = useMemo(
    () => (getNodeId ? (data) => getNodeId(data) : (data) => data.id ?? data.name),
    [getNodeId],
  );

  const layoutTree = useMemo(
    () => layoutTreeAtDrill(tree, drillId, getId),
    [tree, drillId, getId],
  );

  const { cells, focusRect, trailCells, idToData } = useMemo(() => {
    if (!layoutTree?.children?.length) {
      return { cells: [], focusRect: null, trailCells: [], idToData: new Map() };
    }

    const root = computeLayout(layoutTree, width, height);
    const getIdFromNode = getNodeId
      ? (d) => getNodeId(d.data)
      : (d) => d._pathId;

    const collected = [];
    const dataMap = new Map();
    root.each((node) => {
      if (node.depth === 0) return;
      const id = getIdFromNode(node);
      collected.push({
        id,
        data: node.data,
        depth: node.depth,
        x0: node.x0,
        y0: node.y0,
        x1: node.x1,
        y1: node.y1,
        hasChildren: (node.data.children?.length ?? 0) > 0,
      });
      dataMap.set(id, node.data);
    });

    let rect = null;
    const highlightId = navMode === "explore" ? selectedId : focusId;
    if (highlightId) {
      root.each((node) => {
        if (getIdFromNode(node) === highlightId) {
          rect = { x0: node.x0, y0: node.y0, x1: node.x1, y1: node.y1 };
        }
      });
    }

    const trailSet = new Set(goldenPath);
    const trailCells = [];
    if (trailSet.size > 0) {
      root.each((node) => {
        const id = getIdFromNode(node);
        if (trailSet.has(id)) {
          const cx = (node.x0 + node.x1) / 2;
          const cy = (node.y0 + node.y1) / 2;
          const idx = goldenPath.indexOf(id);
          trailCells.push({ id, cx, cy, idx });
        }
      });
      trailCells.sort((a, b) => a.idx - b.idx);
    }

    return { cells: collected, focusRect: rect, trailCells, idToData: dataMap };
  }, [layoutTree, width, height, getNodeId, focusId, selectedId, navMode, goldenPath]);

  const trailPath = useMemo(() => {
    if (trailCells.length < 2) return null;
    return d3
      .line()
      .x((d) => d.cx)
      .y((d) => d.cy)
      .curve(d3.curveCatmullRom.alpha(0.5))(trailCells);
  }, [trailCells]);

  const topLevelLabels = useMemo(() => {
    if (!labels || !layoutTree?.children?.length) return [];
    return layoutTree.children
      .filter((n) => n.name)
      .map((n) => n.name.split(" ")[0]);
  }, [labels, layoutTree]);

  const selectedName = selectedId
    ? nodeDisplayName(idToData.get(selectedId))
    : "";
  const hoverName = hoveredId ? nodeDisplayName(idToData.get(hoveredId)) : "";
  const caption = captionForModes({ labelMode, hoverName, selectedName });

  function handleCellClick(id) {
    const isRepeat = id === lastClickedId;
    if (navMode === "explore") {
      setLastClickedId(id);
      onSelect?.(id);
      const cell = cells.find((c) => c.id === id);
      if (cell?.hasChildren) onDrillChange?.(id);
      return;
    }
    if (shouldNavigateMainOnCellClick(navMode, isRepeat)) {
      onOpen?.(id);
    } else {
      setLastClickedId(id);
      onSelect?.(id);
    }
  }

  function handleStarClick(e) {
    e.stopPropagation();
    setLastClickedId(null);
    onDrillChange?.(null);
    onHome?.();
    onSelect?.(null);
  }

  function handleGoClick(e) {
    e.stopPropagation();
    if (selectedId != null) onGo?.(selectedId);
  }

  const colorFn = getNodeColor ?? ((data) => defaultColor(data));
  const showGo = navMode === "explore";

  return (
    <div style={{ position: "relative", display: "inline-block", width }}>
      <svg
        width={width}
        height={height}
        style={{ display: "block", overflow: "hidden" }}
        aria-label="Treemap mini-map"
      >
        {cells.map((cell) => {
          const isSelected = cell.id === selectedId;
          const isFocused = cell.id === focusId && navMode === "click-jump";
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
              onMouseEnter={() => setHoveredId(cell.id)}
              onMouseLeave={() => setHoveredId((prev) => (prev === cell.id ? null : prev))}
            />
          );
        })}

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
          onClick={handleStarClick}
        />
      </svg>

      {showGo && (
        <button
          type="button"
          aria-label="Go to selected section on main map"
          title="Go"
          onClick={handleGoClick}
          disabled={selectedId == null}
          style={{
            position: "absolute",
            right: 4,
            bottom: caption ? 22 : 4,
            width: 28,
            height: 22,
            padding: 0,
            fontSize: 14,
            lineHeight: 1,
            borderRadius: 4,
            border: "1px solid rgba(255,255,255,0.35)",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            cursor: selectedId == null ? "default" : "pointer",
            opacity: selectedId == null ? 0.45 : 1,
          }}
        >
          →
        </button>
      )}

      {caption ? (
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.72)",
            marginTop: 4,
            minHeight: 16,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            width,
          }}
        >
          {caption}
        </div>
      ) : null}

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
            <span
              key={lbl}
              style={{
                flex: 1,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                textAlign: "center",
              }}
            >
              {lbl}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

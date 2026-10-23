import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { layoutMinimapTree } from "./layout.js";
import { nodeLabel, nodePathLabel } from "./navLabels.js";

export function CrumbBackButton({ parent, onSelect }) {
  if (!parent) return null;
  return (
    <button
      type="button"
      className="treesite-crumb-btn"
      aria-label={`Go back to ${nodeLabel(parent)}`}
      onClick={() => onSelect(parent)}
    >
      ←
    </button>
  );
}

export function Breadcrumbs({ focus, onSelect, includeBack = true, className = "treesite-crumbs" }) {
  const trail = focus.ancestors().reverse();

  return (
    <nav className={className} aria-label="Breadcrumb">
      {includeBack ? (
        <CrumbBackButton parent={focus.parent} onSelect={onSelect} />
      ) : null}
      {trail.map((d, i) => (
        <button
          key={d.fullName}
          type="button"
          className="treesite-crumb-btn"
          aria-current={i === trail.length - 1 ? "location" : undefined}
          onClick={() => onSelect(d)}
        >
          {nodeLabel(d)}
        </button>
      ))}
    </nav>
  );
}

/**
 * Recently visited cards, oldest to newest. `trailNodes` are hierarchy nodes.
 * Repeat visits collapse to their latest position so the list reads as a path.
 */
export function VisitedTrail({ trailNodes, onSelect, onClear, limit = 6, title = "Your path" }) {
  const seen = new Set();
  const unique = [];
  for (let i = trailNodes.length - 1; i >= 0; i--) {
    const d = trailNodes[i];
    if (!d || seen.has(d.fullName)) continue;
    seen.add(d.fullName);
    unique.unshift(d);
  }
  const shown = unique.slice(-limit);
  if (!shown.length) return null;

  return (
    <nav className="treesite-trail" aria-label="Recently visited">
      <div className="treesite-trail-head">
        <span>{title}</span>
        {onClear ? (
          <button type="button" className="treesite-trail-clear" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <ol className="treesite-trail-list">
        {shown.map((d, i) => (
          <li key={d.fullName}>
            <button
              type="button"
              className="treesite-trail-btn"
              aria-current={i === shown.length - 1 ? "location" : undefined}
              title={nodePathLabel(d)}
              onClick={() => onSelect(d)}
            >
              {nodeLabel(d)}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Abstract territory map of the whole tree.
 *
 * Only Home and regions down to `targetDepth` (default: top-level sections) are
 * targets; cards inside them are drawn but hovering or clicking one acts on its
 * section, which keeps the targets large.
 *
 * Keyboard: one Tab stop; arrow keys move between targets in reading order,
 * Home/End jump to the ends, Enter or Space opens the region.
 */
export function MiniMap({
  root,
  focus,
  recentTrail = [],
  trailNodes: trailNodesProp,
  onSelect,
  sectionColor,
  size = "standard",
  label = "Mini Map",
  hint = "click or use arrow keys",
  targetDepth = 1
}) {
  const width = 240;
  const height = size === "large" ? 180 : 130;
  const inset = 16;
  const sx = (width - inset * 2) / Math.max(1, root.x1 - root.x0);
  const sy = (height - inset * 2) / Math.max(1, root.y1 - root.y0);

  const nodes = useMemo(() => root.descendants().filter(d => d.depth > 0), [root]);
  /** Keyboard order: Home, then the targets depth first, in reading order. */
  const order = useMemo(() => {
    const list = [];
    root.eachBefore(d => {
      if (d.depth <= targetDepth) list.push(d);
    });
    return list;
  }, [root, targetDepth]);
  const topLevelPad = 1;
  const nodeByName = useMemo(
    () => new Map(root.descendants().map(d => [d.fullName, d])),
    [root]
  );
  const center = d => ({
    x: inset + ((d.x0 + d.x1) / 2) * sx,
    y: inset + ((d.y0 + d.y1) / 2) * sy
  });
  const trailNodes = (trailNodesProp ||
    recentTrail.map(name => nodeByName.get(name))).filter(Boolean);
  const linePath =
    trailNodes.length > 1
      ? d3
          .line()
          .x(d => center(d).x)
          .y(d => center(d).y)
          .curve(d3.curveCatmullRom.alpha(0.65))(trailNodes)
      : null;

  const focusTarget =
    focus && focus.depth > targetDepth
      ? focus.ancestors().find(a => a.depth === targetDepth)
      : focus;
  const focusIndex = Math.max(
    0,
    order.findIndex(d => d.fullName === focusTarget?.fullName)
  );
  const [activeIndex, setActiveIndex] = useState(focusIndex);
  const [syncedFocusIndex, setSyncedFocusIndex] = useState(focusIndex);
  const svgRef = useRef(null);
  const keyboardMoveRef = useRef(false);

  // When the map focus moves, the roving tab stop follows it.
  if (syncedFocusIndex !== focusIndex) {
    setSyncedFocusIndex(focusIndex);
    setActiveIndex(focusIndex);
  }

  useEffect(() => {
    if (!keyboardMoveRef.current) return;
    keyboardMoveRef.current = false;
    svgRef.current?.querySelector(`[data-mini-index="${activeIndex}"]`)?.focus();
  }, [activeIndex]);

  function onKeyDown(e) {
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = activeIndex + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = activeIndex - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = order.length - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(order[activeIndex]);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    keyboardMoveRef.current = true;
    setActiveIndex(Math.min(order.length - 1, Math.max(0, next)));
  }

  const itemProps = (d, i) => ({
    "data-mini-index": i,
    role: "button",
    tabIndex: i === activeIndex ? 0 : -1,
    "aria-label": nodePathLabel(d),
    "aria-current": d.fullName === focusTarget?.fullName ? "location" : undefined,
    onFocus: () => setActiveIndex(i),
    onClick: e => {
      e.stopPropagation();
      onSelect(d);
    }
  });

  return (
    <div className={`mini-wrap${size === "large" ? " mini-wrap--large" : ""}`}>
      <div className="mini-label">
        <span>{label}</span>
        <span>{hint}</span>
      </div>

      <svg
        ref={svgRef}
        className={`mini-map${size === "large" ? " mini-map--large" : ""}`}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={`${label}. Use arrow keys to move between regions and Enter to open one.`}
        onKeyDown={onKeyDown}
        onClick={() => onSelect(root)}
      >
        {nodes.map(d => {
          const isTop = d.depth === 1;
          const isTransparentParent = isTop && d.children;
          const parentPad = isTransparentParent ? topLevelPad : 0;
          const isTarget = d.depth <= targetDepth;
          const i = order.indexOf(d);

          return (
            <rect
              key={d.fullName}
              className={`${isTransparentParent ? "mini-map-parent" : "mini-map-leaf"}${
                isTarget ? " mini-map-target" : ""
              }`}
              x={inset + d.x0 * sx - parentPad}
              y={inset + d.y0 * sy - parentPad}
              width={(d.x1 - d.x0) * sx + parentPad * 2}
              height={(d.y1 - d.y0) * sy + parentPad * 2}
              rx="4"
              ry="4"
              fill={isTransparentParent ? "transparent" : sectionColor(d)}
              opacity={isTransparentParent ? 1 : 0.58}
              {...(isTarget ? itemProps(d, i) : { "aria-hidden": "true", pointerEvents: "none" })}
            >
              {isTarget ? <title>{nodePathLabel(d)}</title> : null}
            </rect>
          );
        })}

        {linePath && (
          <path
            className="mini-map-trail"
            d={linePath}
            fill="none"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {trailNodes.map((d, i) => {
          const c = center(d);
          const alpha = 0.35 + ((i + 1) / trailNodes.length) * 0.65;

          return (
            <circle
              key={`${d.fullName}-${i}`}
              className="mini-map-trail-dot"
              cx={c.x}
              cy={c.y}
              r={i === trailNodes.length - 1 ? 4.2 : 2.8}
              strokeWidth="1.4"
              opacity={alpha}
            />
          );
        })}

        <path
          className="mini-map-home"
          d={d3.symbol(d3.symbolStar, 92)()}
          transform={`translate(${inset - 2}, ${inset - 2})`}
          strokeWidth="1.5"
          {...itemProps(root, 0)}
        >
          <title>Home</title>
        </path>

        {focus ? (
          <rect
            className="mini-map-focus"
            x={inset + focus.x0 * sx}
            y={inset + focus.y0 * sy}
            width={(focus.x1 - focus.x0) * sx}
            height={(focus.y1 - focus.y0) * sy}
            fill="none"
            strokeWidth="2"
            aria-hidden="true"
          />
        ) : null}
      </svg>
      {focus ? (
        <p className="mini-here">
          <span className="mini-here-label">You are here:</span> {nodePathLabel(focus)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Whole-tree outline: the same structure as the map, as a nested list of buttons.
 * A text route through the site for keyboard and screen-reader users.
 */
export function OutlineNav({ root, focus, onSelect }) {
  const onPath = new Set(focus ? focus.ancestors().map(d => d.fullName) : []);

  function renderChildren(d) {
    if (!d.children?.length) return null;
    const expanded = d.depth < 1 || onPath.has(d.fullName) || d.depth < 2;
    if (!expanded) return null;
    return (
      <ul>
        {d.children.map(c => (
          <li key={c.fullName}>
            <button
              type="button"
              className={`treesite-outline-btn${
                focus?.fullName === c.fullName ? " is-current" : ""
              }`}
              aria-current={focus?.fullName === c.fullName ? "location" : undefined}
              onClick={() => onSelect(c)}
            >
              {nodeLabel(c)}
            </button>
            {renderChildren(c)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <nav className="treesite-outline" aria-label="Site outline">
      <button
        type="button"
        className={`treesite-outline-btn${focus?.depth === 0 ? " is-current" : ""}`}
        aria-current={focus?.depth === 0 ? "location" : undefined}
        onClick={() => onSelect(root)}
      >
        Home
      </button>
      {renderChildren(root)}
    </nav>
  );
}

function findBySlug(root, slug) {
  if (!slug) return null;
  return root.descendants().find(d => d.data?.slug === slug) || null;
}

/**
 * Mini map, breadcrumbs and visited trail for pages that are not the map itself
 * (for example a traditional scrolling view of the same content).
 *
 * @param {object} props
 * @param {object} props.siteData       Tree root (same data the map view uses).
 * @param {object} props.navMemory      From `createNavMemory`; supplies and records the trail.
 * @param {string|null} props.currentSlug  Card the reader is on now.
 * @param {(node: object) => void} props.onSelect  Called with the chosen hierarchy node.
 * @param {(node: object) => string} [props.sectionColor]
 * @param {"standard"|"large"} [props.size]
 */
export function NavigatorPanel({
  siteData,
  navMemory,
  currentSlug,
  onSelect,
  sectionColor,
  size = "standard",
  label = "Mini Map"
}) {
  const root = useMemo(() => layoutMinimapTree(siteData), [siteData]);
  const [trail, setTrail] = useState(() => navMemory?.getTrail() ?? []);

  useEffect(() => {
    if (!navMemory) return undefined;
    return navMemory.subscribe(change => {
      if (change.type === "trail") setTrail(change.trail);
    });
  }, [navMemory]);

  const focus = findBySlug(root, currentSlug) || root;
  const trailNodes = trail.map(s => findBySlug(root, s)).filter(Boolean);
  const colorFn =
    sectionColor ||
    (d => {
      let cur = d;
      while (cur && cur.depth > 1) cur = cur.parent;
      return cur?.data?.color || "#8b79b8";
    });

  return (
    <div className="treesite-navigator">
      <MiniMap
        root={root}
        focus={focus}
        trailNodes={trailNodes}
        onSelect={onSelect}
        sectionColor={colorFn}
        size={size}
        label={label}
      />
      <Breadcrumbs
        focus={focus}
        onSelect={onSelect}
        includeBack={false}
        className="treesite-crumbs treesite-crumbs--inline"
      />
      <VisitedTrail
        trailNodes={trailNodes}
        onSelect={onSelect}
        onClear={navMemory ? () => navMemory.clearTrail() : undefined}
      />
    </div>
  );
}

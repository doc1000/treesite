import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { TileTemplate } from "./tileTemplates";

export default function TreeSite({ siteData, rootOrder }) {
  const chartRef = useRef(null);
  const miniRef = useRef(null);
  const [dims, setDims] = useState({ width: 1200, height: 800 });
  const [focusName, setFocusName] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;

    const resize = () => {
      const box = el.getBoundingClientRect();
      setDims({ width: box.width, height: box.height });
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const root = useMemo(() => {
    const weight = d => {
      const raw = Math.max(1, d.value || 1);
      return d.children ? 0 : 1 + Math.log1p(raw) * 0.65;
    };

    const r = d3
      .hierarchy(siteData)
      .sum(weight)
      .sort((a, b) => {
        if (a.depth === 1 && b.depth === 1 && rootOrder) {
          return rootOrder.indexOf(a.data.name) - rootOrder.indexOf(b.data.name);
        }
        return b.value - a.value;
      });

    d3
      .treemap()
      .tile(d3.treemapSquarify.ratio(1.2))
      .size([dims.width, dims.height])
      .paddingTop(d => (d.depth === 0 ? 0 : 18))
      .paddingInner(2)
      .paddingOuter(2)
      .round(true)(r);

    r.each(d => {
      d.fullName = d.ancestors().reverse().map(x => x.data.name).join(" / ");
    });

    return r;
  }, [siteData, rootOrder, dims]);

  const focus =
    root.descendants().find(d => d.fullName === focusName) || root;

  const visibleNodes = focus.children || [focus];

  function localBox(d) {
    const scaleX = dims.width / (focus.x1 - focus.x0);
    const scaleY = dims.height / (focus.y1 - focus.y0);

    return {
      x: (d.x0 - focus.x0) * scaleX,
      y: (d.y0 - focus.y0) * scaleY,
      w: (d.x1 - d.x0) * scaleX,
      h: (d.y1 - d.y0) * scaleY
    };
  }

  function sectionColor(d) {
    const top = d.depth === 1 ? d : d.ancestors().find(a => a.depth === 1);
    return top?.data.color || "#8b79b8";
  }

  function goTo(d) {
    if (!d) return;
    setFocusName(d.fullName);
  }

  return (
    <div className="treesite">
      <aside className="treesite-sidebar">
        <h1>Living Sitemap</h1>
        <p>
          Click any tile to enter it. Use the minimap or breadcrumbs to move
          around.
        </p>

        <input
          className="treesite-search"
          placeholder="Search the sitemap…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        <MiniMap
          root={root}
          focus={focus}
          onSelect={goTo}
          svgRef={miniRef}
          sectionColor={sectionColor}
        />
      </aside>

      <main className="treesite-stage" ref={chartRef}>
        <Breadcrumbs focus={focus} onSelect={goTo} />

        <svg
          className="treesite-chart"
          viewBox={`0 0 ${dims.width} ${dims.height}`}
        >
          {visibleNodes.map(d => {
            const b = localBox(d);
            const isMatch =
              query && d.fullName.toLowerCase().includes(query.toLowerCase());

            return (
              <g
                key={d.fullName}
                transform={`translate(${b.x},${b.y})`}
                onClick={e => {
                  e.stopPropagation();
                  goTo(d);
                }}
                className="tree-node"
              >
                <rect
                  width={Math.max(0, b.w)}
                  height={Math.max(0, b.h)}
                  rx="16"
                  ry="16"
                  fill={sectionColor(d)}
                  opacity={d.children ? 0.78 : 0.52}
                  stroke={isMatch ? "#fff" : "rgba(255,255,255,.18)"}
                  strokeWidth={isMatch ? 3 : 1}
                />

                <foreignObject width={b.w} height={b.h}>
                  <TileTemplate node={d.data} box={b} />
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </main>
    </div>
  );
}

function Breadcrumbs({ focus, onSelect }) {
  const trail = focus.ancestors().reverse();

  return (
    <nav className="treesite-crumbs">
      {focus.parent && (
        <button onClick={() => onSelect(focus.parent)}>←</button>
      )}
      {trail.map(d => (
        <button key={d.fullName} onClick={() => onSelect(d)}>
          {d.depth === 0 ? "Home" : d.data.name}
        </button>
      ))}
    </nav>
  );
}

function MiniMap({ root, focus, onSelect, sectionColor }) {
  const width = 240;
  const height = 130;
  const inset = 16;
  const sx = (width - inset * 2) / Math.max(1, root.x1 - root.x0);
  const sy = (height - inset * 2) / Math.max(1, root.y1 - root.y0);

  const nodes = root.descendants().filter(d => d.depth > 0);
  const topLevelPad = 10;

  return (
    <div className="mini-wrap">
      <div className="mini-label">
        <span>Mini Map</span>
        <span>click to jump</span>
      </div>

      <svg
        className="mini-map"
        viewBox={`0 0 ${width} ${height}`}
        onClick={() => onSelect(root)}
      >
        {nodes.map(d => {
          const isTop = d.depth === 1;

          return (
            <rect
              key={d.fullName}
              x={inset + d.x0 * sx + (isTop ? -topLevelPad : 0)}
              y={inset + d.y0 * sy + (isTop ? -topLevelPad : 0)}
              width={(d.x1 - d.x0) * sx + (isTop ? topLevelPad * 2 : 0)}
              height={(d.y1 - d.y0) * sy + (isTop ? topLevelPad * 2 : 0)}
              rx="4"
              ry="4"
              fill={isTop ? "transparent" : sectionColor(d)}
              opacity={isTop ? 1 : 0.65}
              onClick={e => {
                e.stopPropagation();
                onSelect(d);
              }}
            />
          );
        })}

        <rect
          x={inset + focus.x0 * sx}
          y={inset + focus.y0 * sy}
          width={(focus.x1 - focus.x0) * sx}
          height={(focus.y1 - focus.y0) * sy}
          fill="none"
          stroke="#fff"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
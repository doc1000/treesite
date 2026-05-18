import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { TileTemplate } from "./tileTemplates";

/** Top fraction of the main map reserved for the current focus title (not treemap area). */
const FOCUS_HEADER_RATIO = 0.1;

function displayWeight(d) {
  const raw = Math.max(1, d.value || 1);
  return d.children ? 0 : 1 + Math.log1p(raw) * 0.65;
}

function siblingSortComparator(a, b) {
  const vb = Number(b.data.value) || 1;
  const va = Number(a.data.value) || 1;
  if (vb !== va) return vb - va;
  return String(a.data.name || "").localeCompare(String(b.data.name || ""));
}

const INTERNAL_VIEWER_TYPES = new Set(["pdf", "htmlCard", "text", "section", "note", "markdown"]);

/** Logical viewer URL / resource selector (iframe may omit `html` — see {@link getIframeSrc}). */
function getViewerUrl(item) {
  if (!item || typeof item !== "object") return null;
  if (item.type === "pdf") {
    return item.pdf || item.url || item.source || item.embed || null;
  }
  if (item.type === "htmlCard") {
    return item.url || item.source || item.html || item.embed || null;
  }
  return item.embed || item.url || item.source || null;
}

function isExternalUrl(url) {
  if (url == null || typeof url !== "string") return false;
  const t = url.trim();
  return t.startsWith("http://") || t.startsWith("https://");
}

function stripHtmlToPlain(html) {
  if (!html || typeof html !== "string") return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = doc.body?.textContent ?? "";
    return text.replace(/\s+/g, " ").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

/** Plain text only (no dangerouslySetInnerHTML). */
function getTextContent(item) {
  if (!item || typeof item !== "object") return "";
  const fromField = v => (typeof v === "string" && v.trim() ? v.trim() : "");
  const picked =
    fromField(item.text) ||
    fromField(item.content) ||
    fromField(item.description) ||
    fromField(item.summary);
  if (picked) return picked;
  if (typeof item.html === "string" && item.html.trim()) {
    const plain = stripHtmlToPlain(item.html);
    return plain || "";
  }
  return "";
}

/** URL usable as iframe `src` — never HTML markup. */
function getIframeSrc(item) {
  if (!item || typeof item !== "object") return null;

  let candidate;
  if (item.type === "pdf" || item.pdf) {
    candidate = item.pdf || item.url || item.source || item.embed || null;
  } else if (item.type === "htmlCard") {
    candidate = item.url || item.source || item.embed || null;
  } else {
    return null;
  }

  if (candidate == null || typeof candidate !== "string") return null;
  const t = candidate.trim();
  if (t.startsWith("<")) return null;
  if (isExternalUrl(t)) return null;
  return t || null;
}

function isEmbeddableInternalItem(item) {
  if (!item || typeof item !== "object") return false;
  if (item.type === "website") return false;
  if (item.type === "contact" || item.template === "contact") return false;
  if (item.template === "schedule") return false;

  const vu = getViewerUrl(item);
  if (vu != null && typeof vu === "string" && isExternalUrl(vu)) return false;

  if (item.type && INTERNAL_VIEWER_TYPES.has(item.type)) return true;

  return ["html", "text", "content", "description", "summary"].some(
    field => typeof item[field] === "string" && item[field].trim() !== ""
  );
}

/** Sole-tile drill-in: iframe and/or plaintext body must exist. */
function shouldUseFocusedViewer(item, iframeSrc, plainTextBody) {
  if (!item) return false;
  if (!isEmbeddableInternalItem(item)) return false;
  if (iframeSrc) return true;
  return plainTextBody.trim().length > 0;
}

export default function TreeSite({ siteData }) {
  const chartRef = useRef(null);
  const [dims, setDims] = useState({ width: 1200, height: 800 });
  const [focusName, setFocusName] = useState(null);
  const [query, setQuery] = useState("");
  const [recentTrail, setRecentTrail] = useState([]);
  const [showImmediateChildren, setShowImmediateChildren] = useState(false);

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

  const contentHeight = dims.height * (1 - FOCUS_HEADER_RATIO);

  const root = useMemo(() => {
    const r = d3
      .hierarchy(siteData)
      .sum(displayWeight)
      .sort(siblingSortComparator);

    d3
      .treemap()
      .tile(d3.treemapSquarify.ratio(1.2))
      .size([dims.width, contentHeight])
      .paddingTop(d => {
        if (d.depth === 0) return 0;
        if (
          showImmediateChildren &&
          d.depth === 1 &&
          d.children &&
          d.children.length > 0
        ) {
          return 62;
        }
        return 18;
      })
      .paddingInner(2)
      .paddingOuter(2)
      .round(true)(r);

    r.each(d => {
      d.fullName = d.ancestors().reverse().map(x => x.data.name).join(" / ");
    });

    return r;
  }, [siteData, dims, contentHeight, showImmediateChildren]);

  const focus =
    root.descendants().find(d => d.fullName === focusName) || root;

  const focusHeaderHeight = dims.height * FOCUS_HEADER_RATIO;

  const displayRoot = useMemo(() => {
    const r = d3
      .hierarchy(focus.data)
      .sum(displayWeight)
      .sort(siblingSortComparator);

    d3
      .treemap()
      .tile(d3.treemapSquarify.ratio(1.2))
      .size([dims.width, contentHeight])
      .paddingTop(d => {
        if (d.depth === 0) return 0;
        if (
          showImmediateChildren &&
          d.depth === 1 &&
          d.children &&
          d.children.length > 0
        ) {
          return 62;
        }
        return 18;
      })
      .paddingInner(2)
      .paddingOuter(2)
      .round(true)(r);

    r.each(d => {
      const names = d.ancestors().reverse().slice(1).map(x => x.data.name);
      d.fullName = [focus.fullName, ...names].join(" / ");
    });

    return r;
  }, [focus, dims, contentHeight, showImmediateChildren]);

  const visibleNodes = useMemo(() => {
    if (!showImmediateChildren) return displayRoot.children || [displayRoot];

    const nodes = displayRoot.descendants().filter(d => {
      return d.depth === 1 || d.depth === 2;
    });

    return nodes.length > 0 ? nodes : [displayRoot];
  }, [displayRoot, showImmediateChildren]);

  const parentHeaderOverlayNodes = useMemo(() => {
    if (!showImmediateChildren) return [];
    return displayRoot.descendants().filter(
      d =>
        d.depth === 1 &&
        d.children &&
        d.children.length > 0
    );
  }, [displayRoot, showImmediateChildren]);

  const soleFocusCard = useMemo(
    () =>
      visibleNodes.length === 1 &&
      visibleNodes[0].fullName === focus.fullName,
    [visibleNodes, focus.fullName]
  );

  const focusPlainText = useMemo(
    () => (soleFocusCard ? getTextContent(focus.data) : ""),
    [soleFocusCard, focus.data]
  );

  const focusIframeSrc = useMemo(
    () => (soleFocusCard ? getIframeSrc(focus.data) : null),
    [soleFocusCard, focus.data]
  );

  const useFocusedViewer = useMemo(
    () =>
      soleFocusCard &&
      shouldUseFocusedViewer(focus.data, focusIframeSrc, focusPlainText),
    [
      soleFocusCard,
      focus.data,
      focusIframeSrc,
      focusPlainText
    ]
  );

  function sectionColor(d) {
    const original = root.descendants().find(x => x.fullName === d.fullName) || d;
    const top =
      original.depth === 1
        ? original
        : original.ancestors().find(a => a.depth === 1);
    return top?.data.color || "#8b79b8";
  }

  function goTo(d) {
    if (!d) return;
    setFocusName(d.fullName);
    setRecentTrail(prev => {
      const next = [...prev, d.fullName];
      return next.slice(-10);
    });
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
          recentTrail={recentTrail}
          onSelect={goTo}
          sectionColor={sectionColor}
        />

        <SettingsPanel
          showImmediateChildren={showImmediateChildren}
          onShowImmediateChildrenChange={setShowImmediateChildren}
        />
      </aside>

      <main
        className="treesite-stage"
        ref={chartRef}
        style={{ "--focus-header-ratio": FOCUS_HEADER_RATIO }}
      >
        <Breadcrumbs focus={focus} onSelect={goTo} />

        <svg
          className="treesite-chart"
          viewBox={`0 0 ${dims.width} ${dims.height}`}
        >
          {visibleNodes.map(d => {
            const b = {
              x: d.x0,
              y: d.y0 + focusHeaderHeight,
              w: d.x1 - d.x0,
              h: d.y1 - d.y0
            };
            const isChildPreview = showImmediateChildren && d.depth > 1;
            const headerInMapOverlay =
              showImmediateChildren &&
              !isChildPreview &&
              Boolean(d.children?.length);
            const isMatch =
              query && d.fullName.toLowerCase().includes(query.toLowerCase());

            return (
              <g
                key={d.fullName}
                transform={`translate(${b.x},${b.y})`}
                onClick={
                  useFocusedViewer
                    ? undefined
                    : isChildPreview
                      ? undefined
                      : e => {
                          e.stopPropagation();
                          goTo(d);
                        }
                }
                className={`tree-node ${isChildPreview ? "tree-node-child-preview" : ""}`}
                aria-label={isChildPreview ? d.data.name : undefined}
              >
                <rect
                  width={Math.max(0, b.w)}
                  height={Math.max(0, b.h)}
                  rx="16"
                  ry="16"
                  fill={sectionColor(d)}
                  opacity={isChildPreview ? 0.28 : d.children ? 0.78 : 0.52}
                  stroke={isMatch ? "#fff" : "rgba(255,255,255,.18)"}
                  strokeWidth={isMatch ? 3 : 1}
                />

                <foreignObject
                  width={b.w}
                  height={b.h}
                  className={isChildPreview ? "tree-node-child-fo" : undefined}
                >
                  {useFocusedViewer && !isChildPreview ? (
                    <div className="tileViewerHost" xmlns="http://www.w3.org/1999/xhtml">
                      <FocusedCardViewer
                        item={d.data}
                        iframeSrc={focusIframeSrc}
                        plainText={focusPlainText}
                      />
                    </div>
                  ) : (
                    <TileTemplate
                      node={d.data}
                      box={b}
                      suppressTileLabels={isChildPreview}
                      headerInMapOverlay={headerInMapOverlay}
                    />
                  )}
                </foreignObject>
              </g>
            );
          })}
          {showImmediateChildren &&
            (displayRoot.children || [])
              .filter(d => d.children && d.children.length > 0)
              .map(d => (
                <rect
                  key={`parent-hit-${d.fullName}`}
                  className="tree-node-parent-hit"
                  x={d.x0}
                  y={d.y0 + focusHeaderHeight}
                  width={Math.max(0, d.x1 - d.x0)}
                  height={Math.max(0, d.y1 - d.y0)}
                  fill="transparent"
                  pointerEvents="all"
                  onClick={e => {
                    e.stopPropagation();
                    goTo(d);
                  }}
                />
              ))}
          {parentHeaderOverlayNodes.map(d => (
            <ParentMapHeaderOverlay key={`map-hdr-${d.fullName}`} d={d} focusHeaderHeight={focusHeaderHeight} />
          ))}
          <FocusLabel
            focus={focus}
            headerHeight={focusHeaderHeight}
          />
        </svg>
      </main>
    </div>
  );
}

function FocusedCardViewer({ item, iframeSrc, plainText }) {
  const title = item.title || item.name || "Embedded viewer";
  const subtitle = item.section || item.kicker || item.source;
  const showIframe = Boolean(iframeSrc);

  return (
    <div
      className="tileViewer"
      xmlns="http://www.w3.org/1999/xhtml"
      onClick={e => e.stopPropagation()}
    >
      {showIframe ? (
        <iframe
          className="tileViewerFrame"
          src={iframeSrc}
          title={title}
        />
      ) : (
        <div className="tileViewerBody">
          {subtitle && <div className="tileViewerSubtitle">{subtitle}</div>}
          <div className="tileViewerText">{plainText}</div>
        </div>
      )}
    </div>
  );
}

function ParentMapHeaderOverlay({ d, focusHeaderHeight }) {
  const b = {
    x: d.x0,
    y: d.y0 + focusHeaderHeight,
    w: d.x1 - d.x0,
    h: d.y1 - d.y0
  };
  const node = d.data;
  const kicker = node.kicker || node.source || node.publication;
  const title = node.title || node.name;
  const description = node.abstract || node.description;
  const hasDesc = Boolean(description);
  const overlayH = Math.round(
    Math.min(
      b.h,
      Math.max(56, b.h * (hasDesc ? 0.62 : 0.36))
    )
  );

  return (
    <g
      className="tree-node-parent-header-overlay"
      transform={`translate(${b.x},${b.y})`}
      pointerEvents="none"
    >
      <foreignObject width={Math.max(0, b.w)} height={overlayH}>
        <div className="tile-parent-map-overlay" xmlns="http://www.w3.org/1999/xhtml">
          {kicker && <div className="tile-kicker">{kicker}</div>}
          <h3 className="tile-title">{title}</h3>
          {description && (
            <p className="tile-desc">{description}</p>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

function FocusLabel({ focus, headerHeight }) {
  const title = focus.depth === 0 ? "Home" : focus.data.name;
  const description = focus.data.abstract || focus.data.description;
  const titleY = Math.max(20, headerHeight * 0.52);
  const descY = Math.max(32, headerHeight * 0.82);

  return (
    <g className="focus-label" pointerEvents="none">
      <text x="16" y={titleY}>
        {title}
      </text>
      {description && headerHeight > 40 && (
        <text className="focus-label-desc" x="16" y={descY}>
          {description}
        </text>
      )}
    </g>
  );
}

function SettingsPanel({ showImmediateChildren, onShowImmediateChildrenChange }) {
  return (
    <section className="treesite-settings" aria-label="Display settings">
      <div className="settings-heading">Settings</div>
      <label className="settings-toggle">
        <span>
          <strong>Show child cards</strong>
          <small>Reveal one nested level on the main map.</small>
        </span>
        <input
          type="checkbox"
          checked={showImmediateChildren}
          onChange={e => onShowImmediateChildrenChange(e.target.checked)}
        />
      </label>
    </section>
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

function MiniMap({ root, focus, recentTrail, onSelect, sectionColor }) {
  const width = 240;
  const height = 130;
  const inset = 16;
  const sx = (width - inset * 2) / Math.max(1, root.x1 - root.x0);
  const sy = (height - inset * 2) / Math.max(1, root.y1 - root.y0);

  const nodes = root.descendants().filter(d => d.depth > 0);
  const topLevelPad = 10;
  const nodeByName = new Map(root.descendants().map(d => [d.fullName, d]));
  const center = d => ({
    x: inset + ((d.x0 + d.x1) / 2) * sx,
    y: inset + ((d.y0 + d.y1) / 2) * sy
  });
  const trailNodes = recentTrail
    .map(name => nodeByName.get(name))
    .filter(Boolean);
  const linePath =
    trailNodes.length > 1
      ? d3
          .line()
          .x(d => center(d).x)
          .y(d => center(d).y)
          .curve(d3.curveCatmullRom.alpha(0.65))(trailNodes)
      : null;

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
          const isTransparentParent = isTop && d.children;
          const parentPad = isTransparentParent ? topLevelPad : 0;

          return (
            <rect
              key={d.fullName}
              x={inset + d.x0 * sx - parentPad}
              y={inset + d.y0 * sy - parentPad}
              width={(d.x1 - d.x0) * sx + parentPad * 2}
              height={(d.y1 - d.y0) * sy + parentPad * 2}
              rx="4"
              ry="4"
              fill={isTransparentParent ? "transparent" : sectionColor(d)}
              opacity={isTransparentParent ? 1 : 0.58}
              onClick={e => {
                e.stopPropagation();
                onSelect(d);
              }}
            />
          );
        })}

        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="rgba(255, 209, 102, .95)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: "drop-shadow(0 0 6px rgba(255, 209, 102, .75))",
              pointerEvents: "none"
            }}
          />
        )}

        {trailNodes.map((d, i) => {
          const c = center(d);
          const alpha = 0.35 + ((i + 1) / trailNodes.length) * 0.65;

          return (
            <circle
              key={`${d.fullName}-${i}`}
              cx={c.x}
              cy={c.y}
              r={i === trailNodes.length - 1 ? 4.2 : 2.8}
              fill="#ffd166"
              stroke="#0b0f19"
              strokeWidth="1.4"
              opacity={alpha}
              style={{
                filter: "drop-shadow(0 0 5px rgba(255, 209, 102, .8))",
                pointerEvents: "none"
              }}
            />
          );
        })}

        <path
          d={d3.symbol(d3.symbolStar, 92)()}
          transform={`translate(${inset - 2}, ${inset - 2})`}
          fill="#fff1a8"
          stroke="#0b0f19"
          strokeWidth="1.5"
          style={{
            cursor: "pointer",
            filter: "drop-shadow(0 0 6px rgba(255, 209, 102, .9))"
          }}
          onClick={e => {
            e.stopPropagation();
            onSelect(root);
          }}
        />

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
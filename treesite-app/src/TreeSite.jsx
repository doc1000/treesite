import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { TileTemplate } from "./tileTemplates";
import { buildCardIndex } from "./cardIndex";
import {
  applyCardSlugToFragment,
  parseCardHash,
  planNavigateSteps,
  runPlannedNavigateSteps,
  stripCardHashFromHistory
} from "./cardNavigation";

/** Top fraction of the main map reserved for the current focus title (not treemap area). */
const FOCUS_HEADER_RATIO = 0.1;

/** Max index for nested tile map prominence (`input[type="range"]`). */
const TILE_MAP_LEVEL_MAX = 4;

/** Default prominence level (`TILE_MAP_PRESETS` index): Balanced. */
const TILE_MAP_LEVEL_DEFAULT = 2;

/**
 * Nested tile map prominence: 0 = no nested previews (same layout as old toggle off),
 * 4 = full nested thumbnails (previous toggle-on strength).
 */
const TILE_MAP_PRESETS = [
  {
    label: "Hidden",
    tickLabel: "Off",
    ariaDetail: "Only top-level tiles are shown.",
    childRectOpacity: 0,
    childFoOpacity: 1,
    childBrightness: 1,
    parentWithChildrenRectOpacity: 0.78,
    leafRectOpacity: 0.52
  },
  {
    label: "Subtle",
    tickLabel: "Subtle",
    ariaDetail: "Nested previews are softer but easier to read.",
    childRectOpacity: 0.17,
    childFoOpacity: 0.58,
    childBrightness: 0.68,
    parentWithChildrenRectOpacity: 0.88,
    leafRectOpacity: 0.52
  },
  {
    label: "Balanced",
    tickLabel: "Balanced",
    ariaDetail: "Nested previews are visible with mild background emphasis.",
    childRectOpacity: 0.23,
    childFoOpacity: 0.78,
    childBrightness: 0.84,
    parentWithChildrenRectOpacity: 0.805,
    leafRectOpacity: 0.52
  },
  {
    label: "Clear",
    tickLabel: "Clear",
    ariaDetail: "Nested previews are nearly as strong as full.",
    childRectOpacity: 0.26,
    childFoOpacity: 0.94,
    childBrightness: 0.94,
    parentWithChildrenRectOpacity: 0.785,
    leafRectOpacity: 0.52
  },
  {
    label: "Full",
    tickLabel: "Full",
    ariaDetail: "Nested previews at full visibility.",
    childRectOpacity: 0.28,
    childFoOpacity: 1,
    childBrightness: 1,
    parentWithChildrenRectOpacity: 0.78,
    leafRectOpacity: 0.52
  }
];

const CARD_NAV_STEP_MS = 420;
const SEARCH_RESULT_LIMIT = 14;

function rootDisplayTitle(data) {
  if (!data || typeof data !== "object") return "Home";
  const pick = v => (typeof v === "string" && v.trim() ? v.trim() : "");
  return pick(data.displayName) || pick(data.title) || pick(data.name) || "Home";
}

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
  const treesiteRef = useRef(null);
  const chartRef = useRef(null);
  const highlightClearTimerRef = useRef(null);
  const navigateGeneration = useRef(0);
  const focusNameRef = useRef(null);
  const navigateCardRef = useRef(null);
  const searchInputRef = useRef(null);
  const pendingSearchFocusRef = useRef(false);

  const [dims, setDims] = useState({ width: 1200, height: 800 });
  const [focusName, setFocusName] = useState(null);
  const [query, setQuery] = useState("");
  const [recentTrail, setRecentTrail] = useState([]);
  const [tileMapLevel, setTileMapLevel] = useState(TILE_MAP_LEVEL_DEFAULT);
  const showImmediateChildren = tileMapLevel > 0;
  const tileMapPreset = TILE_MAP_PRESETS[tileMapLevel];
  const [highlightSlug, setHighlightSlug] = useState(null);
  const [chartNavigating, setChartNavigating] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [livingTreemapOpen, setLivingTreemapOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(true);

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

  useEffect(() => {
    if (!sidebarExpanded || !searchOpen || !pendingSearchFocusRef.current) return;
    pendingSearchFocusRef.current = false;
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [sidebarExpanded, searchOpen]);

  const contentHeight = dims.height * (1 - FOCUS_HEADER_RATIO);

  const indexHierarchy = useMemo(() => {
    const r = d3
      .hierarchy(siteData)
      .sum(displayWeight)
      .sort(siblingSortComparator);

    r.each(d => {
      d.fullName = d.ancestors().reverse().map(x => x.data.name).join(" / ");
    });

    return r;
  }, [siteData]);

  const cardIndex = useMemo(() => buildCardIndex(indexHierarchy), [indexHierarchy]);

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

  useEffect(() => {
    focusNameRef.current = focus.fullName;
  }, [focus.fullName]);

  const searchMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q.length) return [];
    return cardIndex.searchRows
      .filter(r => r.haystack.includes(q))
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [cardIndex.searchRows, query]);

  const haystackBySlug = useMemo(() => {
    const m = new Map();
    for (const row of cardIndex.searchRows) m.set(row.slug, row.haystack);
    return m;
  }, [cardIndex.searchRows]);

  function sectionColor(d) {
    const original = root.descendants().find(x => x.fullName === d.fullName) || d;
    const top =
      original.depth === 1
        ? original
        : original.ancestors().find(a => a.depth === 1);
    return top?.data.color || "#8b79b8";
  }

  const flashHighlightSlug = useCallback(slug => {
    if (highlightClearTimerRef.current)
      window.clearTimeout(highlightClearTimerRef.current);
    setHighlightSlug(slug);
    highlightClearTimerRef.current = window.setTimeout(() => {
      setHighlightSlug(null);
      highlightClearTimerRef.current = null;
    }, 2600);
  }, []);

  const goTo = useCallback(
    (d, options = {}) => {
      const { syncSlug = true, recordTrail = true } = options;
      if (!d) return;
      setFocusName(d.fullName);
      if (recordTrail)
        setRecentTrail(prev => [...prev, d.fullName].slice(-10));

      if (syncSlug && typeof window !== "undefined") {
        const slug = d.data?.slug;
        if (slug) applyCardSlugToFragment(String(slug), { replace: true });
        else stripCardHashFromHistory();
      }
    },
    []
  );

  const navigateToCard = useCallback(
    async (
      slug,
      {
        animate = true,
        updateHash = true,
        bumpGeneration = true,
        suppressHighlight = false
      } = {}
    ) => {
      const entry = cardIndex.bySlug.get(slug);
      if (!entry) {
        console.warn(`treesite: unknown card slug "${slug}"`);
        return;
      }

      const targetNode =
        root.descendants().find(n => n.fullName === entry.fullName) || null;
      if (!targetNode) {
        console.warn(`treesite: card "${slug}" not found on current layout root`);
        return;
      }
      if (bumpGeneration) navigateGeneration.current += 1;
      const genStart = navigateGeneration.current;

      if (typeof window !== "undefined" && updateHash) {
        applyCardSlugToFragment(slug, { replace: false });
      }

      const focusResolved =
        root.descendants().find(n => n.fullName === focusNameRef.current) || root;

      const steps = planNavigateSteps({
        root,
        focus: focusResolved,
        target: targetNode
      });

      const animateSeries = animate && steps.length > 1;
      if (animateSeries) setChartNavigating(true);

      await runPlannedNavigateSteps({
        steps,
        animate,
        stepMs: CARD_NAV_STEP_MS,
        getNavigateGen: () => navigateGeneration.current,
        navigateGen: genStart,
        applyGoTo: (dStep, opts) => {
          if (navigateGeneration.current !== genStart) return;
          goTo(dStep, {
            syncSlug: false,
            recordTrail: opts?.recordTrail !== false
          });
        }
      });

      setChartNavigating(false);

      if (navigateGeneration.current !== genStart) return;

      goTo(targetNode, { syncSlug: false, recordTrail: true });

      if (!suppressHighlight && typeof window !== "undefined") flashHighlightSlug(slug);
    },
    [cardIndex, root, goTo, flashHighlightSlug]
  );

  useEffect(() => {
    navigateCardRef.current = navigateToCard;
  }, [navigateToCard]);

  useEffect(
    () => () => {
      if (highlightClearTimerRef.current) {
        window.clearTimeout(highlightClearTimerRef.current);
      }
    },
    []
  );

  /** Cold-load deep links: hash present on first bundle paint. */
  useEffect(() => {
    const slug = parseCardHash();
    if (!slug || !cardIndex.bySlug.has(slug)) return;
    void navigateCardRef.current(slug, {
      animate: false,
      updateHash: false,
      bumpGeneration: false,
      suppressHighlight: true
    });
  }, [siteData, cardIndex]);

  useEffect(() => {
    function onFragmentChange() {
      navigateGeneration.current += 1;
      const slug = parseCardHash();
      if (!slug) {
        setFocusName(null);
        return;
      }
      void navigateToCard(slug, {
        animate: true,
        updateHash: false,
        bumpGeneration: false,
        suppressHighlight: false
      });
    }

    window.addEventListener("hashchange", onFragmentChange);
    window.addEventListener("popstate", onFragmentChange);
    return () => {
      window.removeEventListener("hashchange", onFragmentChange);
      window.removeEventListener("popstate", onFragmentChange);
    };
  }, [navigateToCard]);

  useEffect(() => {
    function onCaptureClick(e) {
      const wrap = treesiteRef.current;
      const link =
        typeof e.target?.closest === "function"
          ? e.target.closest("a[href]")
          : null;
      if (!wrap || !link || !wrap.contains(link)) return;
      const raw = link.getAttribute("href")?.trim() ?? "";
      const m =
        raw.match(/^#\/card\/(.+)$/iu) || raw.match(/^#card\/(.+)$/iu);
      if (!m) return;
      e.preventDefault();
      navigateGeneration.current += 1;
      let slugDecoded = m[1].trim();
      try {
        slugDecoded = decodeURIComponent(slugDecoded);
      } catch {
        /* keep raw */
      }
      void navigateToCard(slugDecoded, {
        animate: true,
        updateHash: true,
        bumpGeneration: false
      });
    }

    document.addEventListener("click", onCaptureClick, true);
    return () => document.removeEventListener("click", onCaptureClick, true);
  }, [navigateToCard]);

  useEffect(() => {
    function onMessage(e) {
      if (!e?.data || e.origin !== window.location.origin) return;
      if (e.data.type !== "treesite:navigate") return;
      const slug = e.data.slug;
      if (!slug || typeof slug !== "string") return;
      if (!cardIndex.bySlug.has(slug)) return;
      navigateGeneration.current += 1;
      void navigateToCard(slug, {
        animate: true,
        updateHash: true,
        bumpGeneration: false
      });
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [cardIndex, navigateToCard]);

  const goToInteractive = useCallback(
    d => {
      navigateGeneration.current += 1;
      goTo(d);
    },
    [goTo]
  );

  return (
    <div
      className={`treesite${sidebarExpanded ? "" : " treesite--sidebar-collapsed"}`}
      ref={treesiteRef}
    >
      <main
        className="treesite-stage"
        ref={chartRef}
        style={{
          "--focus-header-ratio": FOCUS_HEADER_RATIO,
          ...(showImmediateChildren && {
            "--child-preview-fo-opacity": String(tileMapPreset.childFoOpacity),
            "--child-preview-brightness": String(tileMapPreset.childBrightness)
          })
        }}
      >
        <Breadcrumbs focus={focus} onSelect={goToInteractive} />
        <nav className="treesite-focus-back" aria-label="Go back">
          <CrumbBackButton parent={focus.parent} onSelect={goToInteractive} />
        </nav>

        <svg
          className={`treesite-chart${chartNavigating ? " treesite-chart-navigating" : ""}`}
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
            const qTrim = query.trim().toLowerCase();
            const nodeSlug = d.data?.slug;
            const hay = nodeSlug ? haystackBySlug.get(nodeSlug) : undefined;
            const isMatchGlobal = Boolean(qTrim && hay?.includes(qTrim));

            const isNavSlugHighlight =
              highlightSlug &&
              d.data?.slug &&
              String(d.data.slug) === highlightSlug;

            const showSearchStroke =
              Boolean(isMatchGlobal) || Boolean(isNavSlugHighlight);

            const rectOpacity = isChildPreview
              ? tileMapPreset.childRectOpacity
              : d.children
                ? tileMapPreset.parentWithChildrenRectOpacity
                : tileMapPreset.leafRectOpacity;

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
                          goToInteractive(d);
                        }
                }
                className={`tree-node ${isChildPreview ? "tree-node-child-preview" : ""}${
                  isNavSlugHighlight ? " tree-node-nav-target" : ""
                }`}
                aria-label={isChildPreview ? d.data.name : undefined}
              >
                <rect
                  width={Math.max(0, b.w)}
                  height={Math.max(0, b.h)}
                  rx="16"
                  ry="16"
                  fill={sectionColor(d)}
                  opacity={rectOpacity}
                  stroke={showSearchStroke ? "#fff" : "rgba(255,255,255,.18)"}
                  strokeWidth={showSearchStroke ? 3 : 1}
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
                        isNavHighlight={
                          !!(
                            soleFocusCard &&
                            focus.data?.slug &&
                            highlightSlug === focus.data.slug
                          )
                        }
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
                    goToInteractive(d);
                  }}
                />
              ))}
          {parentHeaderOverlayNodes.map(d => (
            <ParentMapHeaderOverlay key={`map-hdr-${d.fullName}`} d={d} focusHeaderHeight={focusHeaderHeight} />
          ))}
          <FocusLabel
            focus={focus}
            headerHeight={focusHeaderHeight}
            hasParent={Boolean(focus.parent)}
          />
        </svg>
      </main>

      <aside
        className={`treesite-sidebar${sidebarExpanded ? "" : " treesite-sidebar--collapsed"}`}
      >
        <button
          type="button"
          className="treesite-sidebar-rail"
          aria-expanded={sidebarExpanded}
          aria-label={sidebarExpanded ? "Collapse side panel" : "Expand side panel"}
          onClick={() => setSidebarExpanded(v => !v)}
        >
          <ChevronSideIcon direction={sidebarExpanded ? "right" : "left"} />
        </button>

        {sidebarExpanded ? (
          <div className="treesite-sidebar-scroll">
            <div className="treesite-sidebar-icon-bar" role="toolbar" aria-label="Side panel sections">
              <button
                type="button"
                className="treesite-sidebar-icon-trigger treesite-sidebar-icon-trigger--bar"
                aria-expanded={minimapOpen}
                aria-controls="treesite-minimap-panel"
                aria-label="Mini map"
                onClick={() => setMinimapOpen(v => !v)}
              >
                <RoadmapIcon />
              </button>
              <button
                type="button"
                className="treesite-sidebar-icon-trigger treesite-sidebar-icon-trigger--bar"
                aria-expanded={searchOpen}
                aria-controls="treesite-search-panel"
                aria-label="Search"
                onClick={() => setSearchOpen(v => !v)}
              >
                <QuestionMarkIcon />
              </button>
              <button
                type="button"
                className="treesite-sidebar-icon-trigger treesite-sidebar-icon-trigger--bar"
                aria-expanded={livingTreemapOpen}
                aria-controls="treesite-spatial-navigation-panel"
                aria-label="Spatial Navigation information"
                onClick={() => setLivingTreemapOpen(v => !v)}
              >
                <CompassIcon />
              </button>
              <button
                type="button"
                className="treesite-sidebar-icon-trigger treesite-sidebar-icon-trigger--bar"
                aria-expanded={settingsOpen}
                aria-controls="treesite-settings-panel"
                aria-label="Settings"
                onClick={() => setSettingsOpen(v => !v)}
              >
                <GearIcon />
              </button>
            </div>

            <div className="treesite-sidebar-section-stack">
              {minimapOpen ? (
                <div
                  id="treesite-minimap-panel"
                  className="treesite-sidebar-footer-panel"
                  role="region"
                  aria-label="Mini map"
                >
                  <MiniMap
                    root={root}
                    focus={focus}
                    recentTrail={recentTrail}
                    onSelect={goToInteractive}
                    sectionColor={sectionColor}
                  />
                </div>
              ) : null}

              {searchOpen ? (
                <div
                  id="treesite-search-panel"
                  className="treesite-sidebar-footer-panel"
                  role="region"
                  aria-label="Search"
                >
                  <div className="treesite-sidebar-mid">
                    <input
                      ref={searchInputRef}
                      className="treesite-search"
                      placeholder="Search the website"
                      aria-autocomplete="list"
                      aria-controls="treesite-search-results"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                    />

                    {searchMatches.length > 0 && (
                      <ul
                        id="treesite-search-results"
                        className="treesite-search-results"
                        role="listbox"
                        aria-label="Matching cards"
                      >
                        {searchMatches.map(row => (
                          <li key={row.slug}>
                            <button
                              type="button"
                              className="treesite-search-result"
                              role="option"
                              onClick={() =>
                                navigateToCard(row.slug, {
                                  animate: true,
                                  bumpGeneration: true
                                })
                              }
                            >
                              <span className="treesite-search-result-label">{row.label}</span>
                              <span className="treesite-search-result-path">{row.sublabel}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="treesite-sidebar-footer treesite-sidebar-footer--stacked">
                {livingTreemapOpen ? (
                  <div
                    id="treesite-spatial-navigation-panel"
                    className="treesite-sidebar-footer-panel"
                    role="region"
                  >
                    <h2 className="treesite-footer-panel-title">Spatial Navigation</h2>
                    <p className="treesite-sidebar-intro">
                      Click any tile to enter it. Use the minimap or breadcrumbs to move
                      around. Never Lost.&nbsp;&nbsp;Contact me to make your own.
                    </p>
                  </div>
                ) : null}

                {settingsOpen ? (
                  <div id="treesite-settings-panel" className="treesite-sidebar-footer-panel" role="region">
                    <SettingsPanel
                      tileMapLevel={tileMapLevel}
                      onTileMapLevelChange={setTileMapLevel}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="treesite-sidebar-collapsed-tools">
            <button
              type="button"
              className="treesite-sidebar-icon-trigger"
              aria-label="Expand sidebar and show mini map"
              onClick={() => {
                setSidebarExpanded(true);
                setMinimapOpen(true);
              }}
            >
              <RoadmapIcon />
            </button>
            <button
              type="button"
              className="treesite-sidebar-icon-trigger"
              aria-label="Expand sidebar and show search"
              onClick={() => {
                pendingSearchFocusRef.current = true;
                setSidebarExpanded(true);
                setSearchOpen(true);
              }}
            >
              <QuestionMarkIcon />
            </button>
            <button
              type="button"
              className="treesite-sidebar-icon-trigger"
              aria-label="Expand sidebar and show spatial navigation help"
              onClick={() => {
                setSidebarExpanded(true);
                setLivingTreemapOpen(true);
              }}
            >
              <CompassIcon />
            </button>
            <button
              type="button"
              className="treesite-sidebar-icon-trigger"
              aria-label="Expand sidebar and show settings"
              onClick={() => {
                setSidebarExpanded(true);
                setSettingsOpen(true);
              }}
            >
              <GearIcon />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function ChevronSideIcon({ direction }) {
  const isLeft = direction === "left";
  return (
    <svg
      className="treesite-sidebar-chevron"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d={isLeft ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QuestionMarkIcon() {
  return (
    <svg
      className="treesite-icon-help"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M9.35 8.85c0-1.47 1.2-2.65 2.65-2.65s2.65 1.18 2.65 2.65c0 1.28-.87 2.38-2.08 2.68-.52.13-.92.58-.92 1.12v.65"
        stroke="currentColor"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="11.95" cy="17.35" r="1.55" fill="currentColor" />
    </svg>
  );
}

function RoadmapIcon() {
  return (
    <svg
      className="treesite-icon-roadmap"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4.75 7.25 L11.75 6.35 L11.75 17.65 L4.75 16.75 Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M11.75 6.35 L18.85 7.55 L18.85 16.45 L11.75 17.65 Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path
        d="M11.75 6.35 V17.65"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity={0.65}
      />
      <path
        d="M6.4 13.2 Q8.2 10.8 10.2 12.4 M7.2 15.6 Q8.6 14.8 10 15.9"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.2 11.5 L15.8 10.2 M13.8 14.6 Q15.6 13.8 17.4 15.2"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.92}
      />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg
      className="treesite-icon-compass"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="8.35"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      {/* Elongated diamond pivot — aligned toward NE */}
      <path
        d="M13.49 10.51 L12.39 12.39 L10.51 13.49 L11.61 11.61 Z"
        fill="currentColor"
        opacity={0.42}
      />
      <path d="M12 12 L17 7 L14 10 Z" fill="currentColor" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      className="treesite-icon-gear"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 3.9l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.84 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FocusedCardViewer({ item, iframeSrc, plainText, isNavHighlight }) {
  const title = item.title || item.name || "Embedded viewer";
  const subtitle = item.section || item.kicker || item.source;
  const showIframe = Boolean(iframeSrc);

  return (
    <div
      className={`tileViewer${isNavHighlight ? " tileViewer-nav-highlight" : ""}`}
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

function FocusLabel({ focus, headerHeight, hasParent }) {
  const title =
    focus.depth === 0 ? rootDisplayTitle(focus.data) : focus.data.name;
  const description = focus.data.abstract || focus.data.description;
  const titleX = hasParent ? 44 : 16;
  const titleY = Math.max(20, headerHeight * 0.52);
  const descY = Math.max(32, headerHeight * 0.82);

  return (
    <g className="focus-label" pointerEvents="none">
      <text x={titleX} y={titleY}>
        {title}
      </text>
      {description && headerHeight > 40 && (
        <text className="focus-label-desc" x={titleX} y={descY}>
          {description}
        </text>
      )}
    </g>
  );
}

function SettingsPanel({ tileMapLevel, onTileMapLevelChange }) {
  const preset = TILE_MAP_PRESETS[tileMapLevel];
  const datalistId = "treesite-tile-map-level-marks";

  return (
    <section className="treesite-settings" aria-label="Display settings">
      <div className="settings-heading">Settings</div>
      <div className="settings-slider-block">
        <div className="settings-slider-row">
          <strong className="settings-slider-title">Nested tile map</strong>
          <span className="settings-slider-current" aria-live="polite">
            {preset.label}
          </span>
        </div>
        <p className="settings-slider-help">
          Drag left to hide nested thumbnails, right for full strength; middle levels keep the map but soften background previews.
        </p>
        <input
          type="range"
          className="settings-slider"
          min={0}
          max={TILE_MAP_LEVEL_MAX}
          step={1}
          value={tileMapLevel}
          onChange={e => onTileMapLevelChange(Number(e.target.value))}
          aria-valuemin={0}
          aria-valuemax={TILE_MAP_LEVEL_MAX}
          aria-valuenow={tileMapLevel}
          aria-valuetext={`${preset.label}. ${preset.ariaDetail}`}
          list={datalistId}
        />
        <datalist id={datalistId}>
          {TILE_MAP_PRESETS.map((p, i) => (
            <option key={`treesite-tile-map-${i}`} value={i} label={p.tickLabel} />
          ))}
        </datalist>
        <div className="settings-slider-ticks" aria-hidden="true">
          {TILE_MAP_PRESETS.map((p, i) => (
            <span key={`treesite-tile-map-tick-${i}`}>{p.tickLabel}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CrumbBackButton({ parent, onSelect }) {
  if (!parent) return null;
  return (
    <button
      type="button"
      className="treesite-crumb-btn"
      aria-label="Go back"
      onClick={() => onSelect(parent)}
    >
      ←
    </button>
  );
}

function Breadcrumbs({ focus, onSelect }) {
  const trail = focus.ancestors().reverse();

  return (
    <nav className="treesite-crumbs">
      <CrumbBackButton parent={focus.parent} onSelect={onSelect} />
      {trail.map(d => (
        <button
          key={d.fullName}
          type="button"
          className="treesite-crumb-btn"
          onClick={() => onSelect(d)}
        >
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
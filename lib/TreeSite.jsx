import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { TileTemplate } from "./tileTemplates.jsx";
import { buildCardIndex } from "./cardIndex.js";
import {
  applyCardSlugToFragment,
  parseCardHash,
  planNavigateSteps,
  runPlannedNavigateSteps,
  stripCardHashFromHistory
} from "./cardNavigation.js";
import {
  buildSectionFillMap,
  createSectionColorFn,
  loadSchemeManifest,
  loadTreemapSchemeFile,
  sectionColorFromContent,
  parseSchemeManifest,
  parseTreemapScheme
} from "./treemapColorScheme.js";
import {
  assignFullNames,
  displayWeight,
  MOBILE_MIN_TILE_PX,
  runTreemapLayout,
  siblingSortComparator
} from "./layout.js";
import {
  Breadcrumbs,
  CrumbBackButton,
  MiniMap,
  OutlineNav,
  VisitedTrail
} from "./Navigation.jsx";
import { nodePathLabel } from "./navLabels.js";
import { isStaticCard } from "./cardKinds.js";

const DEFAULT_COLOR_SCHEMES_BASE = "/color-schemes";

function readStored(key) {
  try {
    const v = localStorage.getItem(key);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion() {
  try {
    return window.matchMedia(REDUCED_MOTION_MEDIA).matches;
  } catch {
    return false;
  }
}

/** Ends `text` with a full stop unless it already ends a sentence. */
function sentence(text) {
  const t = String(text ?? "").trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** True when a key event comes from a control that uses the key itself. */
function isEditableTarget(target) {
  if (!target || typeof target.closest !== "function") return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")
  );
}

/** Top fraction of the main map reserved for the current focus title (not treemap area). Desktop only. */
const FOCUS_HEADER_RATIO = 0.1;

/** Page shell: stacked stage + in-flow chart header (below this viewport width). */
const PAGE_STACK_MAX_WIDTH_PX = 880;
const PAGE_STACK_MEDIA = `(max-width: ${PAGE_STACK_MAX_WIDTH_PX}px)`;

/** Treemap switches to slice/deck layout when measured chart width is below this value. */
const MOBILE_LAYOUT_MAX_WIDTH = 700;

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

function isTreemapTileBoxInvalid(box) {
  const { x, y, w, h } = box;
  return (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w < 50 ||
    h < 50
  );
}

const INTERNAL_VIEWER_TYPES = new Set(["pdf", "htmlCard", "text", "section", "note", "markdown", "article"]);

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

  return ["body", "html", "text", "content", "description", "summary"].some(
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

/** Long-form HTML shown as a readable article when the card is opened (`body` field). */
function getArticleHtml(item) {
  if (!item || typeof item !== "object") return null;
  return typeof item.body === "string" && item.body.trim() ? item.body : null;
}

/**
 * Living sitemap: the whole site as a navigable treemap.
 *
 * @param {object} props
 * @param {object} props.siteData  Tree root (`{ name, children: [...] }`), e.g. from `applyContentItems`.
 * @param {string} [props.colorSchemesBase]  URL folder holding `index.json` + scheme files.
 * @param {{ manifest: object, docs: Record<string, object> }} [props.colorSchemes]
 *   Inline schemes (skips fetching `colorSchemesBase`). `docs` maps scheme id to scheme document.
 * @param {string} [props.colorSchemeId]  Controlled scheme id; pair with `onColorSchemeIdChange`.
 * @param {(id: string) => void} [props.onColorSchemeIdChange]
 * @param {"dark"|"light"} [props.theme]  Chrome theme (`data-theme` on the root element).
 * @param {(theme: "dark"|"light") => void} [props.onThemeChange]  Shows a theme switch in Settings.
 * @param {object} [props.navMemory]  From `createNavMemory`; shares the visited trail and
 *   navigation preferences with other views of the same content.
 * @param {import("react").ReactNode} [props.sidebarHeader]  Extra controls at the top of the side panel.
 * @param {import("react").ReactNode} [props.spatialHelp]  Body of the "Spatial Navigation" help panel.
 * @param {(node: object) => void} [props.onFocusChange]  Called with the focused hierarchy node.
 * @param {string} [props.storageNamespace]  Prefix for this component's own localStorage keys.
 */
export default function TreeSite({
  siteData,
  colorSchemesBase = DEFAULT_COLOR_SCHEMES_BASE,
  colorSchemes = null,
  colorSchemeId: controlledSchemeId,
  onColorSchemeIdChange,
  theme = "dark",
  onThemeChange,
  navMemory = null,
  sidebarHeader = null,
  spatialHelp = null,
  onFocusChange,
  storageNamespace = "treesite",
  defaultTileMapLevel = TILE_MAP_LEVEL_DEFAULT
}) {
  const schemeStorageKey = `${storageNamespace}.colorSchemeId`;
  const schemeMinimapStorageKey = `${storageNamespace}.applySchemeToMinimap`;
  const minimapSizeKey = "minimapSize";
  const treesiteRef = useRef(null);
  const chartWrapRef = useRef(null);
  const highlightClearTimerRef = useRef(null);
  const navigateGeneration = useRef(0);
  const focusNameRef = useRef(null);
  const navigateCardRef = useRef(null);
  const searchInputRef = useRef(null);
  const pendingSearchFocusRef = useRef(false);
  const keyboardNavRef = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  const [dims, setDims] = useState({ width: 1200, height: 800 });
  const [focusName, setFocusName] = useState(null);
  const [query, setQuery] = useState("");
  const [localTrail, setLocalTrail] = useState([]);
  const [memoryTrail, setMemoryTrail] = useState(() => navMemory?.getTrail() ?? []);
  const tileMapLevelKey = `${storageNamespace}.tileMapLevel`;
  const [tileMapLevel, setTileMapLevelState] = useState(() => {
    const stored = Number(readStored(tileMapLevelKey));
    return Number.isInteger(stored) && stored >= 0 && stored <= TILE_MAP_LEVEL_MAX
      ? stored
      : defaultTileMapLevel;
  });
  const setTileMapLevel = useCallback(
    level => {
      setTileMapLevelState(level);
      writeStored(tileMapLevelKey, String(level));
    },
    [tileMapLevelKey]
  );
  const showImmediateChildren = tileMapLevel > 0;
  const tileMapPreset = TILE_MAP_PRESETS[tileMapLevel];
  const [highlightSlug, setHighlightSlug] = useState(null);
  const [chartNavigating, setChartNavigating] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [livingTreemapOpen, setLivingTreemapOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [schemeManifest, setSchemeManifest] = useState(null);
  const [schemeManifestError, setSchemeManifestError] = useState(null);
  const [internalSchemeId, setInternalSchemeId] = useState(() => readStored(schemeStorageKey));
  const isSchemeControlled = controlledSchemeId !== undefined && controlledSchemeId !== null;
  const activeSchemeId = isSchemeControlled ? controlledSchemeId : internalSchemeId;
  const setActiveSchemeId = useCallback(
    id => {
      if (onColorSchemeIdChange) onColorSchemeIdChange(id);
      if (!isSchemeControlled) setInternalSchemeId(id);
    },
    [onColorSchemeIdChange, isSchemeControlled]
  );
  const [resolvedSchemeDoc, setResolvedSchemeDoc] = useState(null);
  const [schemeLoadError, setSchemeLoadError] = useState(null);
  const [applySchemeToMinimap, setApplySchemeToMinimap] = useState(
    () => readStored(schemeMinimapStorageKey) === "1"
  );
  const [minimapSize, setMinimapSizeState] = useState(() => {
    const v = navMemory
      ? navMemory.getPref(minimapSizeKey)
      : readStored(`${storageNamespace}.${minimapSizeKey}`);
    return v === "large" ? "large" : "standard";
  });
  const setMinimapSize = useCallback(
    size => {
      setMinimapSizeState(size);
      if (navMemory) navMemory.setPref(minimapSizeKey, size);
      else writeStored(`${storageNamespace}.${minimapSizeKey}`, size);
    },
    [navMemory, storageNamespace]
  );

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia(REDUCED_MOTION_MEDIA);
    } catch {
      return undefined;
    }
    const sync = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!navMemory) return undefined;
    return navMemory.subscribe(change => {
      if (change.type === "trail") setMemoryTrail(change.trail);
      if (change.type === "pref" && change.key === minimapSizeKey) {
        setMinimapSizeState(change.value === "large" ? "large" : "standard");
      }
    });
  }, [navMemory]);

  const [stackPageChrome, setStackPageChrome] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(PAGE_STACK_MEDIA);
    const sync = () => setStackPageChrome(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = chartWrapRef.current;
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

  useEffect(() => {
    let cancelled = false;
    const manifestPromise = colorSchemes?.manifest
      ? Promise.resolve().then(() => parseSchemeManifest(colorSchemes.manifest))
      : loadSchemeManifest(colorSchemesBase);
    manifestPromise
      .then(manifest => {
        if (cancelled) return;
        setSchemeManifest(manifest);
        setSchemeManifestError(null);
        const ids = new Set(manifest.schemes.map(s => s.id));
        setInternalSchemeId(prev => {
          if (prev && ids.has(prev)) return prev;
          const stored = readStored(schemeStorageKey);
          if (stored && ids.has(stored)) return stored;
          return manifest.defaultSchemeId;
        });
      })
      .catch(err => {
        if (!cancelled) {
          setSchemeManifest(null);
          setSchemeManifestError(err.message || String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [colorSchemes, colorSchemesBase, schemeStorageKey]);

  useEffect(() => {
    if (!internalSchemeId || isSchemeControlled) return;
    writeStored(schemeStorageKey, internalSchemeId);
  }, [internalSchemeId, isSchemeControlled, schemeStorageKey]);

  useEffect(() => {
    writeStored(schemeMinimapStorageKey, applySchemeToMinimap ? "1" : "0");
  }, [applySchemeToMinimap, schemeMinimapStorageKey]);

  useEffect(() => {
    if (!schemeManifest || !activeSchemeId) return;
    const entry = schemeManifest.schemes.find(s => s.id === activeSchemeId);
    if (!entry) {
      setResolvedSchemeDoc(null);
      setSchemeLoadError("Unknown color scheme.");
      return;
    }
    let cancelled = false;
    setSchemeLoadError(null);
    const inlineDoc = colorSchemes?.docs?.[entry.id];
    const docPromise = inlineDoc
      ? Promise.resolve().then(() => parseTreemapScheme(inlineDoc))
      : loadTreemapSchemeFile(colorSchemesBase, entry.file);
    docPromise
      .then(scheme => {
        if (!cancelled) {
          setResolvedSchemeDoc(scheme);
          setSchemeLoadError(null);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setResolvedSchemeDoc(null);
          setSchemeLoadError(err.message || String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [schemeManifest, activeSchemeId, colorSchemes, colorSchemesBase]);

  const isMobile =
    dims.width > 0 && dims.width < MOBILE_LAYOUT_MAX_WIDTH;

  const contentHeight = stackPageChrome
    ? dims.height
    : dims.height * (1 - FOCUS_HEADER_RATIO);

  const indexHierarchy = useMemo(() => {
    const r = d3
      .hierarchy(siteData)
      .sum(displayWeight)
      .sort(siblingSortComparator);

    return assignFullNames(r);
  }, [siteData]);

  const cardIndex = useMemo(() => buildCardIndex(indexHierarchy), [indexHierarchy]);

  const root = useMemo(() => {
    const r = d3.hierarchy(siteData).sort(siblingSortComparator);
    runTreemapLayout(r, dims.width, contentHeight, {
      isMobile,
      showImmediateChildren
    });

    return assignFullNames(r);
  }, [siteData, dims.width, contentHeight, showImmediateChildren, isMobile]);

  /** Sidebar minimap always uses squarified layout so it stays usable when the main map is slice/stack. */
  const minimapRoot = useMemo(() => {
    const r = d3.hierarchy(siteData).sort(siblingSortComparator);
    runTreemapLayout(r, dims.width, contentHeight, {
      isMobile: false,
      showImmediateChildren
    });

    return assignFullNames(r);
  }, [siteData, dims.width, contentHeight, showImmediateChildren]);

  const focus =
    root.descendants().find(d => d.fullName === focusName) || root;

  const treemapTopInset = stackPageChrome ? 0 : dims.height * FOCUS_HEADER_RATIO;
  const focusHeaderHeight = treemapTopInset;

  /** Mobile deck height: grows past the viewport so every row stays readable. */
  const deckHeight = isMobile
    ? Math.max(
        contentHeight,
        (focus.children?.length || 1) * MOBILE_MIN_TILE_PX + 12
      )
    : contentHeight;

  const displayRoot = useMemo(() => {
    const r = d3.hierarchy(focus.data).sort(siblingSortComparator);
    runTreemapLayout(r, dims.width, deckHeight, {
      isMobile,
      showImmediateChildren
    });

    r.each(d => {
      const names = d.ancestors().reverse().slice(1).map(x => x.data.name);
      d.fullName = [focus.fullName, ...names].join(" / ");
    });

    return r;
  }, [
    focus,
    focus.fullName,
    dims.width,
    deckHeight,
    showImmediateChildren,
    isMobile
  ]);

  const visibleNodes = useMemo(() => {
    if (isMobile) {
      const ch = displayRoot.children || [];
      return ch.length > 0 ? ch : [displayRoot];
    }
    if (!showImmediateChildren) return displayRoot.children || [displayRoot];

    const nodes = displayRoot.descendants().filter(d => {
      return d.depth === 1 || d.depth === 2;
    });

    return nodes.length > 0 ? nodes : [displayRoot];
  }, [displayRoot, showImmediateChildren, isMobile]);

  const parentHeaderOverlayNodes = useMemo(() => {
    if (!showImmediateChildren || isMobile) return [];
    return displayRoot.descendants().filter(
      d =>
        d.depth === 1 &&
        d.children &&
        d.children.length > 0
    );
  }, [displayRoot, showImmediateChildren, isMobile]);

  const mobileFocusStripContent = useMemo(() => {
    if (!stackPageChrome) return null;
    const title =
      focus.depth === 0 ? rootDisplayTitle(focus.data) : focus.data.name;
    const description = focus.data.abstract || focus.data.description;
    return { title, description };
  }, [stackPageChrome, focus]);

  const minimapFocus = useMemo(() => {
    return (
      minimapRoot.descendants().find(d => d.fullName === focus.fullName) ||
      minimapRoot
    );
  }, [minimapRoot, focus.fullName]);

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

  const focusArticleHtml = useMemo(
    () => (soleFocusCard ? getArticleHtml(focus.data) : null),
    [soleFocusCard, focus.data]
  );

  const useFocusedViewer = useMemo(
    () =>
      soleFocusCard &&
      (Boolean(focusArticleHtml) ||
        shouldUseFocusedViewer(focus.data, focusIframeSrc, focusPlainText)),
    [
      soleFocusCard,
      focus.data,
      focusArticleHtml,
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

  const sectionFillMap = useMemo(() => {
    if (!resolvedSchemeDoc || resolvedSchemeDoc.useContentColors) return null;
    return buildSectionFillMap(root, resolvedSchemeDoc);
  }, [root, resolvedSchemeDoc]);

  const sectionColorContent = useCallback(
    d => sectionColorFromContent(root, d),
    [root]
  );

  const sectionColorMain = useMemo(
    () =>
      sectionFillMap
        ? createSectionColorFn(sectionFillMap, root, sectionColorContent)
        : sectionColorContent,
    [sectionFillMap, root, sectionColorContent]
  );

  const sectionColorMini = useMemo(
    () =>
      applySchemeToMinimap ? sectionColorMain : sectionColorContent,
    [applySchemeToMinimap, sectionColorMain, sectionColorContent]
  );

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
      if (recordTrail) {
        setLocalTrail(prev => [...prev, d.fullName].slice(-10));
        if (navMemory && d.data?.slug) navMemory.visit(String(d.data.slug));
      }

      if (syncSlug && typeof window !== "undefined") {
        const slug = d.data?.slug;
        if (slug) applyCardSlugToFragment(String(slug), { replace: true });
        else stripCardHashFromHistory();
      }
    },
    [navMemory]
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
      if (reducedMotion) animate = false;
      const entry = cardIndex.bySlug.get(slug);
      if (!entry) {
        console.warn(`treesite: unknown card slug "${slug}"`);
        return;
      }

      const found =
        root.descendants().find(n => n.fullName === entry.fullName) || null;
      const targetNode = found && found.parent && isStaticCard(found.data) ? found.parent : found;
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
    [cardIndex, root, goTo, flashHighlightSlug, reducedMotion]
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
      // A blurb has nothing more to open: show the region it sits in, with it highlighted.
      if (d && d.parent && isStaticCard(d.data)) {
        goTo(d.parent);
        if (d.data.slug) flashHighlightSlug(String(d.data.slug));
        return;
      }
      goTo(d);
    },
    [goTo, flashHighlightSlug]
  );

  /** Mini map trail: the shared memory when present, otherwise this session's path. */
  const recentTrail = useMemo(() => {
    if (!navMemory) return localTrail;
    return memoryTrail
      .map(slug => cardIndex.bySlug.get(slug)?.fullName)
      .filter(Boolean);
  }, [navMemory, memoryTrail, localTrail, cardIndex]);

  const trailNodesForList = useMemo(
    () =>
      recentTrail
        .map(name => minimapRoot.descendants().find(d => d.fullName === name))
        .filter(Boolean),
    [recentTrail, minimapRoot]
  );

  useEffect(() => {
    if (onFocusChange) onFocusChange(focus);
  }, [focus, onFocusChange]);

  /** Escape steps out to the parent region (unless a form control or embed has focus). */
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (isEditableTarget(e.target)) return;
      const current = root.descendants().find(n => n.fullName === focusNameRef.current);
      if (!current?.parent) return;
      e.preventDefault();
      keyboardNavRef.current = true;
      goToInteractive(current.parent);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [root, goToInteractive]);

  /** After keyboard navigation, move focus into the new view so the reader is not dropped. */
  useEffect(() => {
    if (!keyboardNavRef.current) return undefined;
    keyboardNavRef.current = false;
    const id = window.requestAnimationFrame(() => {
      const wrap = chartWrapRef.current;
      if (!wrap) return;
      const target =
        wrap.querySelector(".tileViewer [tabindex='0']") ||
        wrap.querySelector(".tree-node-target[tabindex='0']");
      target?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [focus.fullName]);

  const onTileKeyDown = useCallback(
    (e, d) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      keyboardNavRef.current = true;
      goToInteractive(d);
    },
    [goToInteractive]
  );

  const liveAnnouncement = useMemo(() => {
    const count = focus.children?.length || 0;
    const where = focus.depth === 0 ? rootDisplayTitle(focus.data) : nodePathLabel(focus);
    return count
      ? `${sentence(where)} ${count} item${count === 1 ? "" : "s"}.`
      : sentence(where);
  }, [focus]);

  return (
    <div
      className={`treesite${sidebarExpanded ? "" : " treesite--sidebar-collapsed"}${
        minimapSize === "large" ? " treesite--minimap-large" : ""
      }${reducedMotion ? " treesite--reduced-motion" : ""}`}
      data-theme={theme}
      ref={treesiteRef}
    >
      <main
        className={`treesite-stage${stackPageChrome ? " treesite-stage--page-stack" : ""}${
          isMobile ? " treesite-stage--mobile-deck" : ""
        }`}
        style={{
          "--focus-header-ratio": FOCUS_HEADER_RATIO,
          ...(showImmediateChildren && {
            "--child-preview-fo-opacity": String(tileMapPreset.childFoOpacity),
            "--child-preview-brightness": String(tileMapPreset.childBrightness)
          })
        }}
      >
        <h1 className="treesite-visually-hidden">{rootDisplayTitle(root.data)}</h1>
        <p className="treesite-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {liveAnnouncement}
        </p>
        {stackPageChrome ? (
          <header className="treesite-mobile-header">
            <nav className="treesite-focus-back" aria-label="Go back">
              <CrumbBackButton parent={focus.parent} onSelect={goToInteractive} />
            </nav>
            {mobileFocusStripContent ? (
              <div
                className="treesite-mobile-focus-strip"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <p className="treesite-mobile-focus-strip-title">
                  {mobileFocusStripContent.title}
                </p>
                {mobileFocusStripContent.description ? (
                  <p className="treesite-mobile-focus-strip-desc">
                    {mobileFocusStripContent.description}
                  </p>
                ) : null}
              </div>
            ) : null}
            <Breadcrumbs
              focus={focus}
              onSelect={goToInteractive}
              includeBack={false}
            />
          </header>
        ) : (
          <>
            <Breadcrumbs focus={focus} onSelect={goToInteractive} />
            <nav className="treesite-focus-back" aria-label="Go back">
              <CrumbBackButton parent={focus.parent} onSelect={goToInteractive} />
            </nav>
          </>
        )}

        <div className="treesite-chart-wrap" ref={chartWrapRef}>
          <svg
            className={`treesite-chart${chartNavigating ? " treesite-chart-navigating" : ""}${
              isMobile ? " treesite-chart--deck" : ""
            }`}
            viewBox={`0 0 ${dims.width} ${deckHeight + treemapTopInset}`}
            style={
              deckHeight > contentHeight
                ? { height: `${deckHeight + treemapTopInset}px` }
                : undefined
            }
          >
          {visibleNodes.map(d => {
            const bRaw = {
              x: d.x0,
              y: d.y0 + focusHeaderHeight,
              w: d.x1 - d.x0,
              h: d.y1 - d.y0
            };
            if (isTreemapTileBoxInvalid(bRaw)) {
              if (import.meta.env?.DEV) {
                console.warn("[TreeSite] skip invalid tile box", {
                  fullName: d.fullName,
                  ...bRaw
                });
              }
              return null;
            }

            const b = {
              x: bRaw.x,
              y: bRaw.y,
              w: Math.max(0, bRaw.w),
              h: Math.max(0, bRaw.h)
            };

            const isChildPreview =
              !isMobile && showImmediateChildren && d.depth > 1;
            const isStatic = !isChildPreview && isStaticCard(d.data);
            const headerInMapOverlay =
              !isMobile &&
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
                  useFocusedViewer || isStatic
                    ? undefined
                    : isChildPreview
                      ? undefined
                      : e => {
                          e.stopPropagation();
                          goToInteractive(d);
                        }
                }
                className={`tree-node ${isChildPreview ? "tree-node-child-preview" : ""}${
                  isStatic ? " tree-node--static" : ""
                }${
                  isNavSlugHighlight ? " tree-node-nav-target" : ""
                }`}
                aria-hidden={isChildPreview ? "true" : undefined}
              >
                <rect
                  // The tile background is the keyboard target: a sibling of the tile's
                  // content, so links inside the tile are not nested in a button.
                  {...(!useFocusedViewer && !isChildPreview && !isStatic
                    ? {
                        className: "tree-node-target",
                        role: "button",
                        tabIndex: 0,
                        "aria-label": `${sentence(
                          `${d.data.name}${d.children?.length ? `, ${d.children.length} items` : ""}`
                        )} Open.`,
                        onKeyDown: e => onTileKeyDown(e, d)
                      }
                    : {})}
                  width={Math.max(0, b.w)}
                  height={Math.max(0, b.h)}
                  rx={isMobile ? 12 : 16}
                  ry={isMobile ? 12 : 16}
                  fill={sectionColorMain(d)}
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
                        articleHtml={focusArticleHtml}
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
                      isMobile={isMobile}
                      suppressTileLabels={isChildPreview}
                      headerInMapOverlay={headerInMapOverlay}
                      isStatic={isStatic}
                    />
                  )}
                </foreignObject>
              </g>
            );
          })}
          {showImmediateChildren &&
            !isMobile &&
            (displayRoot.children || [])
              .filter(d => d.children && d.children.length > 0)
              .map(d => (
                <rect
                  key={`parent-hit-${d.fullName}`}
                  className="tree-node-parent-hit"
                  aria-hidden="true"
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
          {!stackPageChrome ? (
            <FocusLabel
              focus={focus}
              headerHeight={focusHeaderHeight}
              hasParent={Boolean(focus.parent)}
              width={dims.width}
            />
          ) : null}
          </svg>
        </div>
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
            {sidebarHeader ? (
              <div className="treesite-sidebar-header">{sidebarHeader}</div>
            ) : null}
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
                aria-expanded={outlineOpen}
                aria-controls="treesite-outline-panel"
                aria-label="Outline"
                onClick={() => setOutlineOpen(v => !v)}
              >
                <OutlineIcon />
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
                    root={minimapRoot}
                    focus={minimapFocus}
                    recentTrail={recentTrail}
                    onSelect={goToInteractive}
                    sectionColor={sectionColorMini}
                    size={minimapSize}
                  />
                  <button
                    type="button"
                    className="treesite-minimap-size"
                    aria-pressed={minimapSize === "large"}
                    onClick={() =>
                      setMinimapSize(minimapSize === "large" ? "standard" : "large")
                    }
                  >
                    {minimapSize === "large" ? "Smaller mini map" : "Larger mini map"}
                  </button>
                  <VisitedTrail
                    trailNodes={trailNodesForList}
                    onSelect={goToInteractive}
                    onClear={navMemory ? () => navMemory.clearTrail() : () => setLocalTrail([])}
                  />
                </div>
              ) : null}

              {outlineOpen ? (
                <div
                  id="treesite-outline-panel"
                  className="treesite-sidebar-footer-panel"
                  role="region"
                  aria-label="Outline"
                >
                  <OutlineNav root={minimapRoot} focus={minimapFocus} onSelect={goToInteractive} />
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
                      aria-label="Search the website"
                      aria-autocomplete="list"
                      aria-controls={searchMatches.length > 0 ? "treesite-search-results" : undefined}
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
                    {spatialHelp || (
                      <p className="treesite-sidebar-intro">
                        Click any tile to enter it. Use the minimap or breadcrumbs to move
                        around. Never Lost.&nbsp;&nbsp;Contact me to make your own.
                      </p>
                    )}
                    <p className="treesite-sidebar-intro treesite-sidebar-keys">
                      Keyboard: Tab to a tile, Enter to open it, Escape to step back out.
                    </p>
                  </div>
                ) : null}

                {settingsOpen ? (
                  <div id="treesite-settings-panel" className="treesite-sidebar-footer-panel" role="region">
                    <SettingsPanel
                      tileMapLevel={tileMapLevel}
                      onTileMapLevelChange={setTileMapLevel}
                      schemeManifest={schemeManifest}
                      schemeManifestError={schemeManifestError}
                      schemeLoadError={schemeLoadError}
                      activeSchemeId={activeSchemeId}
                      onActiveSchemeIdChange={setActiveSchemeId}
                      resolvedSchemeDoc={resolvedSchemeDoc}
                      applySchemeToMinimap={applySchemeToMinimap}
                      onApplySchemeToMinimapChange={setApplySchemeToMinimap}
                      theme={theme}
                      onThemeChange={onThemeChange}
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
              aria-label="Expand sidebar and show outline"
              onClick={() => {
                setSidebarExpanded(true);
                setOutlineOpen(true);
              }}
            >
              <OutlineIcon />
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

function OutlineIcon() {
  return (
    <svg
      className="treesite-icon-outline"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 6h14M8 12h11M11 18h8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="4.5" cy="12" r="0.9" fill="currentColor" />
      <circle cx="7.5" cy="18" r="0.9" fill="currentColor" />
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

/** Links of a card, as on its tile (`links`, else `url`). */
function cardLinks(item) {
  if (Array.isArray(item.links) && item.links.length) return item.links;
  if (typeof item.url === "string" && item.url.trim()) return [{ label: "Open", href: item.url }];
  return [];
}

function hasDetail(item) {
  return Boolean(
    item &&
      (item.kicker || item.title || item.description || item.html || cardLinks(item).length)
  );
}

/**
 * Everything the card's tile shows (kicker, title, description, list/html, every link),
 * at reading size. The opened card always carries at least what its tile does.
 */
function CardDetail({ item, compact = false, bodyFollows = false }) {
  const links = cardLinks(item);
  // A long-form body carries its own heading and opening text.
  const heading = !bodyFollows && item.title && item.title !== item.name ? item.title : null;
  const description = bodyFollows ? null : item.description;
  if (!item.kicker && !heading && !description && !item.html && !links.length) return null;
  return (
    <header className={`cardDetail${compact ? " cardDetail--compact" : ""}`}>
      {item.kicker ? <div className="cardDetail-kicker">{item.kicker}</div> : null}
      {heading ? <h2 className="cardDetail-title">{heading}</h2> : null}
      {description ? <p className="cardDetail-desc">{description}</p> : null}
      {item.html ? (
        <div className="cardDetail-html" dangerouslySetInnerHTML={{ __html: item.html }} />
      ) : null}
      {links.length ? (
        <div className="cardDetail-links">
          {links.map(link => {
            const isMailto = link.href?.startsWith("mailto:");
            const inMap = link.href?.startsWith("#/card/");
            return (
              <a
                key={`${link.href}-${link.label}`}
                className="cardDetail-link"
                href={link.href}
                target={isMailto || inMap ? undefined : "_blank"}
                rel={isMailto || inMap ? undefined : "noreferrer"}
              >
                {link.label}
              </a>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}

function FocusedCardViewer({ item, iframeSrc, articleHtml, plainText, isNavHighlight }) {
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
        <div className="tileViewerFramed">
          <CardDetail item={item} compact />
          <iframe className="tileViewerFrame" src={iframeSrc} title={title} />
        </div>
      ) : articleHtml || hasDetail(item) ? (
        <article className="tileViewerArticle" tabIndex={0} aria-label={title}>
          <CardDetail item={item} bodyFollows={Boolean(articleHtml)} />
          {articleHtml ? (
            <div className="tileViewerArticleBody" dangerouslySetInnerHTML={{ __html: articleHtml }} />
          ) : null}
        </article>
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
  // The overlay has room for the full description; `abstract` is the short form
  // used where only one line fits (the focus label).
  const description = node.description || node.abstract;
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
          <h2 className="tile-title">{title}</h2>
          {description && (
            <p className="tile-desc">{description}</p>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

function FocusLabel({ focus, headerHeight, hasParent, width }) {
  const title =
    focus.depth === 0 ? rootDisplayTitle(focus.data) : focus.data.name;
  const description = focus.data.abstract || focus.data.description;
  const left = hasParent ? 48 : 16;
  // The breadcrumbs sit in the top-right corner (max min(52%, 28rem)).
  const crumbs = Math.min(width * 0.52, 448);
  const labelWidth = Math.max(200, width - crumbs - left - 16);

  return (
    <g className="focus-label" pointerEvents="none">
      <foreignObject x={left} y={0} width={labelWidth} height={Math.max(40, headerHeight)}>
        <div className="focus-label-box" xmlns="http://www.w3.org/1999/xhtml">
          <div className="focus-label-title">{title}</div>
          {description && headerHeight > 48 ? (
            <div className="focus-label-desc">{description}</div>
          ) : null}
        </div>
      </foreignObject>
    </g>
  );
}

function SettingsPanel({
  tileMapLevel,
  onTileMapLevelChange,
  schemeManifest,
  schemeManifestError,
  schemeLoadError,
  activeSchemeId,
  onActiveSchemeIdChange,
  resolvedSchemeDoc,
  applySchemeToMinimap,
  onApplySchemeToMinimapChange,
  theme,
  onThemeChange
}) {
  const preset = TILE_MAP_PRESETS[tileMapLevel];
  const datalistId = "treesite-tile-map-level-marks";

  const palettePreview =
    resolvedSchemeDoc &&
    !resolvedSchemeDoc.useContentColors &&
    resolvedSchemeDoc.colors?.length
      ? resolvedSchemeDoc.colors
      : [];

  return (
    <section className="treesite-settings" aria-label="Display settings">
      <div className="settings-heading">Settings</div>

      {onThemeChange ? (
        <div className="settings-scheme-block">
          <div className="settings-slider-row">
            <strong className="settings-slider-title">Theme</strong>
          </div>
          <div className="settings-theme-row" role="group" aria-label="Theme">
            {[
              ["light", "Light"],
              ["dark", "Dark"]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="settings-theme-btn"
                aria-pressed={theme === value}
                onClick={() => onThemeChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="settings-scheme-block">
        <div className="settings-slider-row">
          <strong className="settings-slider-title">Section colors</strong>
        </div>
        <p className="settings-slider-help">
          Treemap tile fills only (embedded cards unchanged). Pick a palette JSON from{" "}
          <code className="settings-inline-code">/color-schemes/</code>.
        </p>
        {schemeManifestError ? (
          <p className="settings-scheme-error" role="alert">
            Could not load color schemes: {schemeManifestError}
          </p>
        ) : schemeManifest ? (
          <>
            <label className="settings-scheme-label" htmlFor="treesite-scheme-select">
              Color scheme
            </label>
            <select
              id="treesite-scheme-select"
              className="settings-scheme-select"
              value={activeSchemeId || ""}
              onChange={e => onActiveSchemeIdChange(e.target.value)}
            >
              {schemeManifest.schemes.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label || s.id}
                </option>
              ))}
            </select>
            {schemeLoadError ? (
              <p className="settings-scheme-error" role="alert">
                {schemeLoadError}
              </p>
            ) : null}
            {palettePreview.length ? (
              <div className="settings-scheme-swatches" aria-hidden="true">
                {palettePreview.map((c, i) => (
                  <span
                    key={`${c}-${i}`}
                    className="settings-scheme-swatch"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            ) : resolvedSchemeDoc?.useContentColors ? (
              <p className="settings-slider-help settings-slider-help--tight">
                Using colors from content JSON for treemap fills.
              </p>
            ) : null}
            <label className="settings-scheme-checkbox-row">
              <input
                type="checkbox"
                checked={applySchemeToMinimap}
                onChange={e => onApplySchemeToMinimapChange(e.target.checked)}
              />
              <span>
                Apply scheme to mini-map section fills (navigation trail stays gold).
              </span>
            </label>
          </>
        ) : (
          <p className="settings-slider-help">Loading color schemes…</p>
        )}
      </div>

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

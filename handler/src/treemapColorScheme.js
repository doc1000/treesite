/** Match `#RGB` or `#RRGGBB` for palette / assignment validation. */
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(color) {
  if (typeof color !== "string") return null;
  const t = color.trim();
  if (!HEX_RE.test(t)) return null;
  if (t.length === 4) {
    const r = t[1];
    const g = t[2];
    const b = t[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return t.toLowerCase();
}

function normalizePalette(colors) {
  if (!Array.isArray(colors)) return { ok: false, normalized: [], error: "`colors` must be an array." };
  const normalized = [];
  for (const c of colors) {
    const n = normalizeHex(String(c));
    if (!n) {
      return {
        ok: false,
        normalized: [],
        error: `Invalid palette color: ${JSON.stringify(c)}`
      };
    }
    normalized.push(n);
  }
  return { ok: true, normalized, error: null };
}

/**
 * Validate manifest JSON from `/color-schemes/index.json`.
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
export function validateSchemeManifest(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Manifest must be an object." };
  const schemes = raw.schemes;
  if (!Array.isArray(schemes) || schemes.length === 0) {
    return { ok: false, error: "`schemes` must be a non-empty array." };
  }
  const ids = new Set();
  for (const s of schemes) {
    if (!s || typeof s !== "object") return { ok: false, error: "Each scheme entry must be an object." };
    if (typeof s.id !== "string" || !s.id.trim()) return { ok: false, error: "Each scheme needs a non-empty `id`." };
    if (typeof s.file !== "string" || !s.file.trim()) return { ok: false, error: `Scheme "${s.id}" needs a \`file\` path.` };
    if (ids.has(s.id)) return { ok: false, error: `Duplicate scheme id: ${s.id}` };
    ids.add(s.id);
  }
  const defaultSchemeId = raw.defaultSchemeId;
  if (typeof defaultSchemeId !== "string" || !defaultSchemeId.trim()) {
    return { ok: false, error: "`defaultSchemeId` must be a non-empty string." };
  }
  if (!ids.has(defaultSchemeId)) {
    return { ok: false, error: `\`defaultSchemeId\` "${defaultSchemeId}" is not listed in schemes.` };
  }
  return { ok: true, data: raw };
}

/**
 * Validate a single scheme document.
 * @returns {{ ok: boolean, scheme?: object, error?: string }}
 */
export function validateTreemapScheme(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Scheme must be an object." };

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : null;
  const label =
    typeof raw.label === "string" && raw.label.trim()
      ? raw.label.trim()
      : id || "Scheme";

  const useContentColors = Boolean(raw.useContentColors);

  if (useContentColors) {
    return {
      ok: true,
      scheme: {
        id: id || "content-default",
        label,
        useContentColors: true,
        colors: [],
        assignments: {}
      }
    };
  }

  const paletteResult = normalizePalette(raw.colors);
  if (!paletteResult.ok) return { ok: false, error: paletteResult.error };
  if (paletteResult.normalized.length === 0) {
    return { ok: false, error: "`colors` must be non-empty unless `useContentColors` is true." };
  }

  const assignmentsRaw = raw.assignments && typeof raw.assignments === "object" ? raw.assignments : {};
  const assignments = {};
  const paletteSet = new Set(paletteResult.normalized);

  for (const [key, val] of Object.entries(assignmentsRaw)) {
    const k = String(key).trim();
    if (!k) continue;
    const hex = normalizeHex(String(val));
    if (!hex) {
      return { ok: false, error: `Invalid assignment for "${k}": ${JSON.stringify(val)}` };
    }
    if (!paletteSet.has(hex)) {
      return {
        ok: false,
        error: `Assignment "${k}" uses "${hex}", which is not in the palette.`
      };
    }
    assignments[k] = hex;
  }

  return {
    ok: true,
    scheme: {
      id: id || label,
      label,
      useContentColors: false,
      colors: paletteResult.normalized,
      assignments
    }
  };
}

export async function loadSchemeManifest(baseUrl = "/color-schemes") {
  const url = `${baseUrl.replace(/\/?$/, "")}/index.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load scheme manifest (${res.status})`);
  const raw = await res.json();
  const v = validateSchemeManifest(raw);
  if (!v.ok) throw new Error(v.error || "Invalid manifest");
  return v.data;
}

export async function loadTreemapSchemeFile(baseUrl, fileName) {
  const base = baseUrl.replace(/\/?$/, "");
  const path = `${base}/${String(fileName).replace(/^\/+/, "")}`;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load scheme (${res.status})`);
  const raw = await res.json();
  const v = validateTreemapScheme(raw);
  if (!v.ok) throw new Error(v.error || "Invalid scheme");
  return v.scheme;
}

/** Resolve depth-1 ancestor for hierarchy nodes built from site root (depth 0 = Home). */
export function depth1SectionAncestor(root, d) {
  if (!root || !d) return null;
  const original = root.descendants().find(x => x.fullName === d.fullName) || d;
  if (original.depth === 1) return original;
  return original.ancestors().find(a => a.depth === 1) || null;
}

/** Fill color from section item JSON (`data.color`). */
export function sectionColorFromContent(root, d, fallback = "#8b79b8") {
  const top = depth1SectionAncestor(root, d);
  const c = top?.data?.color;
  return typeof c === "string" && c.trim() ? c.trim() : fallback;
}

/**
 * Build map from depth-1 node `fullName` → hex fill when using a palette scheme.
 * @param {import('d3').HierarchyNode} root
 * @param {{ colors: string[], assignments: Record<string,string>, useContentColors?: boolean }} scheme
 */
export function buildSectionFillMap(root, scheme) {
  if (!scheme || scheme.useContentColors || !scheme.colors?.length) return null;

  const sections = root.children ? [...root.children] : [];
  sections.sort((a, b) =>
    String(a.data?.name ?? "").localeCompare(String(b.data?.name ?? ""), undefined, {
      sensitivity: "base"
    })
  );

  const palette = scheme.colors;
  const assignments = scheme.assignments || {};
  let paletteIndex = 0;
  const map = new Map();

  function colorFromAssignments(node) {
    const slug = typeof node.data?.slug === "string" ? node.data.slug.trim() : "";
    const name = typeof node.data?.name === "string" ? node.data.name.trim() : "";
    if (slug && assignments[slug]) return assignments[slug];
    if (name && assignments[name]) return assignments[name];
    return null;
  }

  for (const node of sections) {
    let color = colorFromAssignments(node);
    if (!color) {
      color = palette[paletteIndex % palette.length];
      paletteIndex += 1;
    }
    map.set(node.fullName, color);
  }

  return map;
}

/**
 * @param {Map<string,string>|null} fillMap
 * @param {import('d3').HierarchyNode} root
 * @param {(d: object) => string} fallbackFn — typically `(d) => sectionColorFromContent(root, d)`
 */
export function createSectionColorFn(fillMap, root, fallbackFn) {
  return d => {
    const top = depth1SectionAncestor(root, d);
    if (!top) return fallbackFn(d);
    const mapped = fillMap?.get(top.fullName);
    if (mapped) return mapped;
    return fallbackFn(d);
  };
}

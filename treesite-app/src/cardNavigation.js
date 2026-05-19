/**
 * Parses `#/card/<slug>` fragment from location.hash-style input.
 */
export function parseCardHash(locationLike = null) {
  if (typeof window === "undefined" && !locationLike) return null;

  /** @type {string} */
  let raw;
  if (locationLike && typeof locationLike === "object" && "hash" in locationLike) {
    raw = String(locationLike.hash || "");
  } else if (!locationLike && typeof window !== "undefined") {
    raw = String(window.location.hash || "");
  } else return null;

  raw = raw.replace(/^#+/u, "").trim();

  let m = raw.match(/^\/card\/(.+)$/iu);
  if (!m) m = raw.match(/^card\/(.+)$/iu);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].trim());
  } catch {
    return m[1].trim();
  }
}

/**
 * Canonical URL `#/card/<slug>`.
 */
export function cardHashFragment(slug) {
  const enc = encodeURIComponent(String(slug).trim());
  return `#/card/${enc}`;
}

/**
 * @returns {boolean} true if slug was normalized into the URL hash
 */
export function applyCardSlugToFragment(slug, { replace = false } = {}) {
  const nextHash = cardHashFragment(slug);
  if (typeof window === "undefined") return false;

  const basePath = `${window.location.pathname}${window.location.search}`;
  try {
    if (replace && window.history?.replaceState) {
      window.history.replaceState({ treesiteSlug: slug }, "", `${basePath}${nextHash}`);
    } else if (!replace && window.history?.pushState) {
      window.history.pushState({ treesiteSlug: slug }, "", `${basePath}${nextHash}`);
    } else {
      window.location.hash = nextHash;
    }
    return true;
  } catch {
    window.location.hash = nextHash;
    return true;
  }
}

/** Clear fragment only (preserve path + query). */
export function stripCardHashFromHistory() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
}

/**
 * True when `ancestorCandidate` is on the path above `descendant`.
 * Same node yields true (including both root).
 */
export function isHierarchyAncestorOf(ancestorCandidate, descendant) {
  if (!ancestorCandidate || !descendant) return false;
  let d = descendant;
  while (d) {
    if (d === ancestorCandidate) return true;
    d = d.parent;
  }
  return false;
}

/** Top-down `[child,...,target]` omitting exclusive `ancestor` (normally Home). */
export function downwardPathExclusive(ancestor, descendant) {
  const chain = [];
  let cur = descendant;
  while (cur && cur !== ancestor && cur.parent) {
    chain.push(cur);
    cur = cur.parent;
  }
  chain.reverse();
  return chain;
}

/**
 * Planned steps for animated navigation toward `target` on `root` treemap hierarchy.
 */
export function planNavigateSteps({ root, focus, target }) {
  if (!root || !target) return [];

  /** @type {import("d3").HierarchyRectangularNode<object>[]} */
  let steps;

  const focusIsAboveTarget =
    isHierarchyAncestorOf(focus, target) && focus.depth <= target.depth;

  if (!focusIsAboveTarget || focus.depth > target.depth) {
    steps = [];
    if (focus !== root) steps.push(root);
    steps.push(...downwardPathExclusive(root, target));
  } else if (focus === target) {
    steps = [];
  } else {
    steps = downwardPathExclusive(focus, target);
  }

  /** Dedupe contiguous duplicates by identity */
  const out = [];
  for (const s of steps) {
    if (out[out.length - 1] !== s) out.push(s);
  }
  return out;
}

/**
 * @param {number} ms
 */
export function navigationDelay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

/**
 * Runs planned steps with cancellation support.
 */
export async function runPlannedNavigateSteps({
  steps,
  animate,
  stepMs = 420,
  getNavigateGen,
  navigateGen,
  applyGoTo
}) {
  for (let i = 0; i < steps.length; i++) {
    if (
      navigateGen !== undefined &&
      getNavigateGen &&
      getNavigateGen() !== navigateGen
    )
      break;
    const trail = animate && steps.length > 1 && i < steps.length - 1;
    applyGoTo(steps[i], { recordTrail: trail });
    if (animate && i < steps.length - 1) await navigationDelay(stepMs);
  }
}

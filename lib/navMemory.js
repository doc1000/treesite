/**
 * Navigation memory shared between views of the same site.
 *
 * Stores the visited-card trail (by slug) and small display preferences in
 * localStorage so a reader who moves between the map view and another view of the
 * same content (for example a traditional scrolling page) keeps one trail, one
 * theme and one set of navigation preferences.
 *
 * Every storage access is guarded: private windows and blocked storage fall back to
 * in-memory state for the current page.
 */

const DEFAULT_MAX_TRAIL = 12;

function safeStorage(storage) {
  if (storage) return storage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* storage blocked */
  }
  return null;
}

/**
 * @param {{ namespace?: string, maxTrail?: number, storage?: Storage }} [options]
 */
export function createNavMemory({
  namespace = "treesite",
  maxTrail = DEFAULT_MAX_TRAIL,
  storage
} = {}) {
  const store = safeStorage(storage);
  const trailKey = `${namespace}.trail`;
  const prefKey = key => `${namespace}.pref.${key}`;
  const listeners = new Set();
  const memory = new Map();

  function read(key) {
    if (store) {
      try {
        return store.getItem(key);
      } catch {
        /* fall through */
      }
    }
    return memory.has(key) ? memory.get(key) : null;
  }

  function write(key, value) {
    memory.set(key, value);
    if (!store) return;
    try {
      if (value === null) store.removeItem(key);
      else store.setItem(key, value);
    } catch {
      /* in-memory copy still holds it */
    }
  }

  function emit(change) {
    for (const fn of listeners) {
      try {
        fn(change);
      } catch {
        /* a broken listener must not stop the others */
      }
    }
  }

  function getTrail() {
    try {
      const parsed = JSON.parse(read(trailKey) || "[]");
      return Array.isArray(parsed)
        ? parsed.filter(s => typeof s === "string" && s.trim())
        : [];
    } catch {
      return [];
    }
  }

  /** Appends `slug` to the trail. Re-visiting the newest entry is a no-op. */
  function visit(slug) {
    if (typeof slug !== "string" || !slug.trim()) return getTrail();
    const prev = getTrail();
    if (prev[prev.length - 1] === slug) return prev;
    const next = [...prev, slug].slice(-maxTrail);
    write(trailKey, JSON.stringify(next));
    emit({ type: "trail", trail: next });
    return next;
  }

  function clearTrail() {
    write(trailKey, null);
    emit({ type: "trail", trail: [] });
  }

  /** Most recently visited slug, or null. */
  function lastVisited() {
    const t = getTrail();
    return t.length ? t[t.length - 1] : null;
  }

  function getPref(key, fallback = null) {
    const v = read(prefKey(key));
    return v === null || v === undefined ? fallback : v;
  }

  function setPref(key, value) {
    const v = value === null || value === undefined ? null : String(value);
    if (read(prefKey(key)) === v) return;
    write(prefKey(key), v);
    emit({ type: "pref", key, value: v });
  }

  /** Listen for trail and preference changes, including ones made in other tabs. */
  function subscribe(fn) {
    listeners.add(fn);
    let onStorage = null;
    if (typeof window !== "undefined") {
      onStorage = e => {
        if (!e.key || !e.key.startsWith(`${namespace}.`)) return;
        if (e.key === trailKey) fn({ type: "trail", trail: getTrail() });
        else fn({ type: "pref", key: e.key.slice(prefKey("").length), value: e.newValue });
      };
      window.addEventListener("storage", onStorage);
    }
    return () => {
      listeners.delete(fn);
      if (onStorage) window.removeEventListener("storage", onStorage);
    };
  }

  return {
    namespace,
    getTrail,
    visit,
    clearTrail,
    lastVisited,
    getPref,
    setPref,
    subscribe
  };
}

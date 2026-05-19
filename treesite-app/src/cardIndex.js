/** @typedef {import("d3").HierarchyNode<object>} HierarchyNode */

/**
 * Entry for resolving `#/card/<slug>` navigation.
 * @typedef {{
 *   slug: string,
 *   fullName: string,
 *   materializedPath: string,
 *   name: string,
 *   type?: string,
 *   title: string,
 * }} CardIndexEntry
 */

/**
 * Indexes hierarchy nodes by content `slug` for deep links and global search.
 * Builds from a non-layout hierarchy (dims-independent) keyed by canonical `fullName`.
 * Resolve the live rectangle node via `liveRoot.descendants().find(...)`.
 *
 * @param {HierarchyNode} root
 */
export function buildCardIndex(root) {
  const bySlug = new Map();

  /** @type {Array<{ slug: string, label: string, sublabel: string, haystack: string }>} */
  const searchRows = [];

  for (const d of root.descendants()) {
    const slug = d.data?.slug;
    if (!slug) continue;

    const materializedPath = d
      .ancestors()
      .reverse()
      .slice(1)
      .map(a => a.data.name)
      .join("/");

    const fullName =
      d.fullName ||
      d.ancestors().reverse().map(x => x.data.name).join(" / ");

    /** @type {CardIndexEntry} */
    const entry = {
      slug,
      fullName,
      materializedPath,
      name: d.data.name,
      type: d.data.type,
      title: d.data.title || d.data.name
    };
    bySlug.set(slug, entry);

    const haystack = [
      slug,
      materializedPath.replace(/\//g, " "),
      entry.name,
      entry.title,
      d.data.description,
      d.data.abstract,
      d.data.summary,
      d.data.kicker
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();

    searchRows.push({
      slug,
      label: entry.title || entry.name,
      sublabel: materializedPath,
      haystack
    });
  }

  return { bySlug, searchRows };
}

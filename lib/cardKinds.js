/**
 * A "blurb" card has nothing behind it: its tile already shows everything it holds.
 * Blurbs are read in place; they are not buttons and do not open.
 * Set `static: true` or `static: false` on an item to override the detection.
 */
export function isStaticCard(data) {
  if (!data || typeof data !== "object") return false;
  if (data.static === true) return true;
  if (data.static === false) return false;
  if (data.children?.length) return false;
  if (["htmlCard", "pdf", "website", "contact", "section"].includes(data.type)) return false;
  if (data.template) return false;
  const has = v => (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "");
  return !(
    has(data.body) ||
    has(data.html) ||
    has(data.links) ||
    has(data.url) ||
    has(data.embed) ||
    has(data.pdf) ||
    has(data.image) ||
    has(data.previewImage)
  );
}

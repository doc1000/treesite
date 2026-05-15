import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.use({
  gfm: true
});

const SANITIZE_OPTIONS = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "code",
    "pre",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "a"
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"]
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false
};

/**
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {string} body
 * @param {{ mode?: "paragraphs" | "pre" }} [options]
 * @returns {string}
 */
export function txtToHtml(body, { mode = "paragraphs" } = {}) {
  const text = String(body);
  if (mode === "pre") {
    return `<pre>${escapeHtml(text)}</pre>`;
  }

  const paras = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (paras.length === 0) {
    return "";
  }

  return paras
    .map(p => {
      const escaped = escapeHtml(p).replace(/\n/g, "<br>");
      return `<p>${escaped}</p>`;
    })
    .join("");
}

/**
 * @param {string} body
 * @returns {string}
 */
export function mdToSafeHtml(body) {
  const raw = marked.parse(String(body), { async: false });
  const html = typeof raw === "string" ? raw : "";
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

/**
 * @param {string} ext — including dot, e.g. `.md`
 * @returns {"txt" | "md" | null}
 */
export function inferFormatFromExtension(ext) {
  const lower = String(ext).toLowerCase();
  if (lower === ".md" || lower === ".markdown") return "md";
  if (lower === ".txt" || lower === ".text") return "txt";
  return null;
}

/**
 * @param {unknown} value
 * @returns {"paragraphs" | "pre"}
 */
export function normalizeTxtMode(value) {
  if (value === undefined || value === true) return "paragraphs";
  const v = String(value).toLowerCase().trim();
  if (v === "pre") return "pre";
  if (v === "paragraphs") return "paragraphs";
  throw new Error('--txt-mode must be "paragraphs" or "pre".');
}

/**
 * @param {{ format: "txt" | "md"; txtMode?: "paragraphs" | "pre"; body: string }} opts
 * @returns {string}
 */
export function bodyToSafeHtml({ format, txtMode = "paragraphs", body }) {
  if (format === "md") {
    return mdToSafeHtml(body);
  }
  if (format === "txt") {
    return txtToHtml(body, { mode: txtMode });
  }
  throw new Error('format must be "txt" or "md".');
}

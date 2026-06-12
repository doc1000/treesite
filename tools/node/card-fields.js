import { parseValue, supportedContentTypes } from "./content-utils.js";

/**
 * Safe lengths for inline font-size (number implies px).
 * @param {string} value
 * @returns {string}
 */
export function normalizeHtmlFontSize(value) {
  const v = String(value).trim();
  if (!v) {
    throw new Error("--html-font-size must be a non-empty length (e.g. 14, 14px, 1rem).");
  }

  if (/^\d+(\.\d+)?$/.test(v)) {
    return `${v}px`;
  }

  if (/^\d+(\.\d+)?(px|rem|em|%)$/i.test(v)) {
    return v;
  }

  throw new Error('--html-font-size must look like "14", "14px", "1rem", "1.1em", or "110%".');
}

export function normalizeCardType(type = "text") {
  const normalized = String(type).toLowerCase();
  if (!supportedContentTypes.includes(normalized)) {
    throw new Error(`--type must be one of: ${supportedContentTypes.join(", ")}.`);
  }

  return normalized;
}

export function applyCardFields(item, args, { allowIdentity = false } = {}) {
  if (allowIdentity) {
    if (args.title || args.name) item.name = String(args.title || args.name);
    if (args.slug) item.slug = String(args.slug);
  }

  if (args.section) item.section = String(args.section);
  if (args.type) item.type = normalizeCardType(args.type);
  if (args.description !== undefined) item.description = String(args.description);
  if (args.value !== undefined) item.value = parseValue(args.value);
  if (args.kicker !== undefined) item.kicker = String(args.kicker);
  if (args.previewImage !== undefined) item.previewImage = String(args.previewImage);
  if (args.image !== undefined) item.image = String(args.image);
  if (args.embed !== undefined) item.embed = String(args.embed);
  if (args.html !== undefined) item.html = String(args.html);
  if (args["html-font-size"] !== undefined) {
    const raw = String(args["html-font-size"]).trim();
    if (raw === "") {
      delete item.htmlFontSize;
    } else {
      item.htmlFontSize = normalizeHtmlFontSize(raw);
    }
  }
  if (args.email !== undefined) item.email = String(args.email);
  if (args.template !== undefined) item.template = String(args.template);
  if (args.linkLabel !== undefined) item.linkLabel = String(args.linkLabel);
  if (args.color !== undefined) item.color = String(args.color);

  if (args.mapFace !== undefined) {
    const v = String(args.mapFace).toLowerCase().trim();
    if (!["text", "media", ""].includes(v)) {
      throw new Error('--mapFace must be "text" or "media".');
    }
    if (v === "") {
      delete item.mapFace;
    } else {
      item.mapFace = v;
    }
  }

  const href = args.href || args.url || args.source;
  if (href !== undefined) {
    const value = String(href);
    item.source = value;

    if (item.type === "pdf") {
      item.pdf = value;
    } else if (item.type === "htmlCard") {
      item.url = value;
    } else if (item.type === "section") {
      /* structural rows use section paths only */
    } else if (["website", "link"].includes(item.type)) {
      item.url = value;
    } else if (item.type === "href" || item.type === "contact") {
      item.href = value;
    }
  }

  if (item.type === "contact") {
    item.template ||= "contact";
  }

  return item;
}

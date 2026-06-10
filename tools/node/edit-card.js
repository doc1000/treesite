import fs from "node:fs/promises";
import path from "node:path";
import { applyCardFields } from "./card-fields.js";
import { bodyToSafeHtml, inferFormatFromExtension, normalizeTxtMode } from "./html-body.js";
import { ErrorCodes } from "./error-codes.js";
import {
  fail,
  loadItems,
  parseToolArgs,
  rebuildManifest,
  resolveItemTarget,
  success,
  writeItem
} from "./tool-runner.js";

async function mergeConvertedHtml(fields) {
  const args = { ...fields };
  const htmlRaw = args.html;
  const hasVerbatimHtml =
    htmlRaw !== undefined && htmlRaw !== true && String(htmlRaw).trim() !== "";

  const filePathRaw =
    typeof args["html-file"] === "string" ? args["html-file"].trim() : undefined;
  const inlineBody =
    typeof args["html-text"] === "string" ? args["html-text"].trim() : undefined;

  const sources = [
    hasVerbatimHtml ? "html" : null,
    filePathRaw ? "html-file" : null,
    inlineBody ? "html-text" : null
  ].filter(Boolean);

  if (sources.length > 1) {
    fail(1, ErrorCodes.INVALID_INPUT, `Use only one html source (got: ${sources.join(", ")}).`);
  }

  if (sources.length === 0 || hasVerbatimHtml) return args;

  const txtMode = normalizeTxtMode(args["txt-mode"]);

  if (filePathRaw) {
    const absPath = path.resolve(filePathRaw);
    await fs.access(absPath);
    let format;
    if (args.format !== undefined) {
      format = String(args.format).toLowerCase().trim();
    } else {
      format = inferFormatFromExtension(path.extname(absPath));
    }
    if (format !== "txt" && format !== "md") {
      fail(1, ErrorCodes.INVALID_INPUT, "html-file requires format txt or md.");
    }
    const body = await fs.readFile(absPath, "utf8");
    args.html = bodyToSafeHtml({ format, txtMode, body });
    return args;
  }

  if (inlineBody) {
    const format = String(args.format || "").toLowerCase().trim();
    if (format !== "txt" && format !== "md") {
      fail(1, ErrorCodes.INVALID_INPUT, "html-text requires format txt or md.");
    }
    args.html = bodyToSafeHtml({ format, txtMode, body: inlineBody });
  }

  return args;
}

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const items = await loadItems(artifactPath);
  const existing = await resolveItemTarget(items, input);

  const fields =
    input.fields && typeof input.fields === "object" && !Array.isArray(input.fields)
      ? input.fields
      : { ...input, id: undefined, slug: undefined };

  if (fields.id && fields.id !== existing.id) {
    fail(1, ErrorCodes.INVALID_INPUT, "Cannot change immutable field 'id'.");
  }

  const mergedArgs = await mergeConvertedHtml(fields);
  const item = { ...existing };
  applyCardFields(item, mergedArgs, { allowIdentity: false });

  if (item.slug !== existing.slug) {
    fail(
      1,
      ErrorCodes.INVALID_INPUT,
      "Changing slug is not supported via edit_card; use rename_card."
    );
  }

  item.id = existing.id;
  await writeItem(artifactPath, item);
  await rebuildManifest(artifactPath);

  success({ id: item.id, manifestRebuilt: true });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

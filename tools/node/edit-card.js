import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  bodyToSafeHtml,
  inferFormatFromExtension,
  normalizeTxtMode
} from "./html-body.js";
import {
  parseArgs,
  readContentItem,
  rebuildGeneratedContent,
  requireArg,
  writeContentItem
} from "./content-utils.js";
import { applyCardFields } from "./card-fields.js";
import { mergeDescriptionArgs } from "./merge-description-arg.js";

/**
 * @param {Record<string, unknown>} args
 * @returns {string | undefined}
 */
function stringFlag(args, key) {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`--${key} requires a value.`);
  }
  return value.trim();
}

/**
 * Sets args.html from --html-file / --html-text when present; validates exclusivity with --html.
 * @param {Record<string, unknown>} args
 */
async function mergeConvertedHtml(args) {
  const htmlRaw = args.html;
  const hasVerbatimHtml =
    htmlRaw !== undefined && htmlRaw !== true && String(htmlRaw).trim() !== "";

  const filePathRaw = stringFlag(args, "html-file");
  const inlineBody = stringFlag(args, "html-text");

  const sources = [
    hasVerbatimHtml ? "html" : null,
    filePathRaw ? "html-file" : null,
    inlineBody ? "html-text" : null
  ].filter(Boolean);

  if (sources.length > 1) {
    throw new Error(`Use only one of: --html, --html-file, --html-text (got: ${sources.join(", ")}).`);
  }

  if (sources.length === 0 || hasVerbatimHtml) {
    return;
  }

  const txtMode = normalizeTxtMode(args["txt-mode"]);

  if (filePathRaw) {
    const absPath = path.resolve(process.cwd(), filePathRaw);
    await fs.access(absPath);

    let format;
    if (args.format !== undefined && args.format !== true) {
      format = String(args.format).toLowerCase().trim();
      if (format !== "txt" && format !== "md") {
        throw new Error('--format must be "txt" or "md".');
      }
    } else {
      format = inferFormatFromExtension(path.extname(absPath));
      if (!format) {
        throw new Error(
          'Unsupported extension for --html-file (use .txt or .md, or pass --format txt|md).'
        );
      }
    }

    const body = await fs.readFile(absPath, "utf8");
    args.html = bodyToSafeHtml({ format, txtMode, body });
    return;
  }

  if (inlineBody) {
    if (args.format === undefined || args.format === true) {
      throw new Error('--html-text requires --format txt or --format md.');
    }
    const format = String(args.format).toLowerCase().trim();
    if (format !== "txt" && format !== "md") {
      throw new Error('--format must be "txt" or "md".');
    }
    args.html = bodyToSafeHtml({ format, txtMode, body: inlineBody });
  }
}

async function main() {
  const args = parseArgs();
  const slug = requireArg(args, "slug");

  await mergeDescriptionArgs(args);
  await mergeConvertedHtml(args);

  const item = await readContentItem(slug);

  applyCardFields(item, args, { allowIdentity: true });

  if (item.slug !== slug) {
    throw new Error("Changing a card slug is not supported by edit:card. Create a new card instead.");
  }

  await writeContentItem(slug, item);
  const count = await rebuildGeneratedContent();

  console.log(`Edited card: ${slug}`);
  console.log(`Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

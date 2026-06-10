import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { artifactAssetRel } from "./artifact-assets.js";
import { parseValue, slugify } from "./content-utils.js";
import { ErrorCodes } from "./error-codes.js";
import { mergeDescriptionArgs } from "./merge-description-arg.js";
import { renderPdfPreview } from "./pdf-preview.js";
import { fail, parseToolArgs, rebuildManifest, success, writeItem } from "./tool-runner.js";

const handlerRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "handler");

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const args = { ...input };
  await mergeDescriptionArgs(args);

  const name = typeof args.name === "string" ? args.name.trim() : "";
  const section = typeof args.section === "string" ? args.section.trim() : "";
  const filePath = path.resolve(
    typeof args.sourcePath === "string"
      ? args.sourcePath
      : typeof args.file === "string"
        ? args.file
        : ""
  );

  if (!name) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include "name".');
  if (!section) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include "section".');
  if (!filePath) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include "sourcePath" (or legacy "file").');

  const slug = slugify(
    typeof args.slug === "string" && args.slug.trim() ? args.slug : name
  );
  if (!slug) fail(1, ErrorCodes.INVALID_INPUT, "Could not create a slug.");

  if (path.extname(filePath).toLowerCase() !== ".pdf") {
    fail(1, ErrorCodes.INVALID_INPUT, "sourcePath must point to a .pdf file.");
  }

  await fs.access(filePath);

  const pdfFilename = `${slug}.pdf`;
  const previewFilename = `${slug}.png`;
  const pdfOutputPath = path.join(artifactPath, "assets", "pdfs", pdfFilename);
  const previewOutputPath = path.join(artifactPath, "assets", "previews", previewFilename);
  const pdfRel = artifactAssetRel("pdfs", pdfFilename);
  const previewRel = artifactAssetRel("previews", previewFilename);

  await fs.mkdir(path.dirname(pdfOutputPath), { recursive: true });
  await fs.copyFile(filePath, pdfOutputPath);
  await renderPdfPreview({
    pdfPath: pdfOutputPath,
    outputPath: previewOutputPath,
    appRoot: handlerRoot
  });

  const item = {
    id: randomUUID(),
    name,
    slug,
    section,
    type: "pdf",
    description: typeof args.description === "string" ? args.description : "",
    source: pdfRel,
    pdf: pdfRel,
    previewImage: previewRel,
    value: parseValue(args.value)
  };

  if (args.kicker) item.kicker = String(args.kicker);

  const written = await writeItem(artifactPath, item);
  await rebuildManifest(artifactPath);

  success({ id: written.id, slug: written.slug, manifestRebuilt: true });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

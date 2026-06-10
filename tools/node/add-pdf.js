import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  appRoot,
  parseArgs,
  parseValue,
  publicPath,
  rebuildGeneratedContent,
  requireArg,
  slugify,
  writeContentItem
} from "./content-utils.js";
import { mergeDescriptionArgs } from "./merge-description-arg.js";
import { renderPdfPreview } from "./pdf-preview.js";

async function main() {
  const args = parseArgs();
  await mergeDescriptionArgs(args);
  const file = path.resolve(requireArg(args, "file"));
  const section = requireArg(args, "section");
  const title = requireArg(args, "title");
  const slug = slugify(args.slug || title);

  if (!slug) {
    throw new Error("Could not create a slug from the supplied title.");
  }

  const extension = path.extname(file).toLowerCase();
  if (extension !== ".pdf") {
    throw new Error("--file must point to a .pdf file.");
  }

  await fs.access(file);

  const pdfFilename = `${slug}.pdf`;
  const previewFilename = `${slug}.png`;
  const pdfOutputPath = path.join(appRoot, "public", "assets", "pdfs", pdfFilename);
  const previewOutputPath = path.join(appRoot, "public", "assets", "previews", previewFilename);
  const pdfPublicPath = publicPath("pdfs", pdfFilename);
  const previewPublicPath = publicPath("previews", previewFilename);

  await fs.mkdir(path.dirname(pdfOutputPath), { recursive: true });
  await fs.copyFile(file, pdfOutputPath);
  await renderPdfPreview({
    pdfPath: pdfOutputPath,
    outputPath: previewOutputPath,
    appRoot
  });

  const item = {
    name: title,
    slug,
    section,
    type: "pdf",
    description: args.description || "",
    source: pdfPublicPath,
    pdf: pdfPublicPath,
    previewImage: previewPublicPath,
    value: parseValue(args.value)
  };

  if (args.kicker) item.kicker = String(args.kicker);

  const itemPath = await writeContentItem(slug, item);
  const count = await rebuildGeneratedContent();

  console.log(`Added PDF item: ${title}`);
  console.log(`  item: ${path.relative(appRoot, itemPath)}`);
  console.log(`  pdf: ${pdfPublicPath}`);
  console.log(`  preview: ${previewPublicPath}`);
  console.log(`Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

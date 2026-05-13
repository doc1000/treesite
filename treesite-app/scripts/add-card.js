import path from "node:path";
import process from "node:process";
import {
  appRoot,
  parseArgs,
  rebuildGeneratedContent,
  requireArg,
  slugify,
  writeContentItem
} from "./content-utils.js";
import { applyCardFields, normalizeCardType } from "./card-fields.js";

async function main() {
  const args = parseArgs();
  const name = requireArg({ name: args.name || args.title }, "name");
  const section = requireArg(args, "section");
  const type = normalizeCardType(args.type || "text");
  const slug = slugify(args.slug || name);

  if (!slug) {
    throw new Error("Could not create a slug from the supplied name.");
  }

  const item = applyCardFields({
    name,
    slug,
    section,
    type,
    description: args.description || "",
    value: 8
  }, args);

  const itemPath = await writeContentItem(slug, item);
  const count = await rebuildGeneratedContent();

  console.log(`Added ${type} card: ${name}`);
  console.log(`  item: ${path.relative(appRoot, itemPath)}`);
  console.log(`  section: ${item.section}`);
  console.log(`Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

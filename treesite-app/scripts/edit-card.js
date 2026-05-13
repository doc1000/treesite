import process from "node:process";
import {
  parseArgs,
  readContentItem,
  rebuildGeneratedContent,
  requireArg,
  writeContentItem
} from "./content-utils.js";
import { applyCardFields } from "./card-fields.js";

async function main() {
  const args = parseArgs();
  const slug = requireArg(args, "slug");
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

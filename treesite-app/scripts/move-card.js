import process from "node:process";
import {
  parseArgs,
  readContentItem,
  rebuildGeneratedContent,
  requireArg,
  writeContentItem
} from "./content-utils.js";

async function main() {
  const args = parseArgs();
  const slug = requireArg(args, "slug");
  const section = requireArg(args, "section");
  const item = await readContentItem(slug);

  item.section = section;

  await writeContentItem(slug, item);
  const count = await rebuildGeneratedContent();

  console.log(`Moved card: ${slug}`);
  console.log(`  section: ${section}`);
  console.log(`Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

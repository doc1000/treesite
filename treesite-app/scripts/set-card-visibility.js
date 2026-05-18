import process from "node:process";
import { canonicalSectionSubtreePrefix, minimalSiteRoot } from "../src/contentItems.js";
import {
  parseArgs,
  readContentItem,
  rebuildGeneratedContent,
  requireArg,
  writeContentItem
} from "./content-utils.js";

function parseHidden(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error("--hidden must be true or false.");
}

async function main() {
  const args = parseArgs();
  const slug = requireArg(args, "slug");
  const hidden = parseHidden(args.hidden);
  const item = await readContentItem(slug);

  item.hidden = hidden;

  await writeContentItem(slug, item);
  const count = await rebuildGeneratedContent();

  console.log(`${hidden ? "Hid" : "Unhid"} card: ${slug}`);
  if (item.type === "section") {
    const path = canonicalSectionSubtreePrefix(item, minimalSiteRoot.name);
    if (path) {
      console.log(
        hidden
          ? `Subtree paths under "${path}" are omitted from the site until this section is visible again (cascade; descendant JSON unchanged).`
          : `Subtree paths under "${path}" can appear again. Cards still marked hidden stay hidden.`
      );
    }
  }
  console.log(`Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

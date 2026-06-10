import process from "node:process";
import { rebuildGeneratedContent } from "./content-utils.js";

async function main() {
  const count = await rebuildGeneratedContent();
  console.log(`Rebuilt generated content with ${count} item${count === 1 ? "" : "s"}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});

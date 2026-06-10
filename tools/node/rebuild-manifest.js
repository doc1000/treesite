import { ErrorCodes } from "./error-codes.js";
import { fail, parseToolArgs, rebuildManifest, success } from "./tool-runner.js";

async function main() {
  const { artifactPath } = await parseToolArgs();
  const { itemCount } = await rebuildManifest(artifactPath);
  success({ manifestRebuilt: true, itemCount });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

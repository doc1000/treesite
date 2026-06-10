import { ErrorCodes } from "./error-codes.js";
import { fail, loadManifest, parseToolArgs, success } from "./tool-runner.js";

async function main() {
  const { artifactPath } = await parseToolArgs();
  const manifest = await loadManifest(artifactPath);
  success({ manifest });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

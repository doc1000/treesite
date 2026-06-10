import process from "node:process";
import { ErrorCodes } from "./error-codes.js";
import { runVisibilityCli } from "./set-card-visibility-core.js";
import { fail, parseToolArgs } from "./tool-runner.js";

async function main() {
  const { input, flags } = await parseToolArgs();

  let hidden = input.hidden;
  if (hidden === undefined) {
    const argv = process.argv.slice(2);
    if (argv.includes("--hidden")) {
      const idx = argv.indexOf("--hidden");
      const val = argv[idx + 1];
      hidden = val === "true";
    }
  }

  if (hidden !== true && hidden !== false) {
    fail(
      1,
      ErrorCodes.INVALID_INPUT,
      'Set hidden via JSON {"id":"…","hidden":true} or legacy --hidden true|false with --artifact.'
    );
  }

  await runVisibilityCli(hidden);
}

main();

/**
 * Stop a detached view-only preview session (kill process trees, remove session file).
 *
 * Usage: node stop-view-preview.js
 */
import process from "node:process";
import {
  PREVIEW_SESSION_PATH,
  readPreviewSession,
  removePreviewSession,
} from "./preview-session.js";
import { killProcessTree } from "./preview-process.js";

function main() {
  const session = readPreviewSession();
  if (!session) {
    console.error(`No preview session file at ${PREVIEW_SESSION_PATH}`);
    process.exit(0);
  }

  const pids = session.pids || {};
  killProcessTree(pids.artifact);
  killProcessTree(pids.handler);

  removePreviewSession();
  console.log("Preview stopped.");
}

main();

/**
 * Standalone detached view-only preview (not used by Studio MVP).
 * Studio serves preview in-process on port 5175 — see docs/studio-preview.md.
 *
 * Fixed ports:
 *   Artifact: 5199 (override TREESITE_ARTIFACT_PORT)
 *   Handler static: 5180
 *
 * Usage:
 *   node open-view-preview.js --artifact-path <absoluteDir> [--open]
 *
 * Browser opens only with --open (default: --no-open). Prints preview URL as the last stdout line.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import {
  HANDLER_DIST,
  HANDLER_VIEW_PORT,
  PREVIEW_SESSION_PATH,
  SERVE_ARTIFACT_SCRIPT,
  SERVE_HANDLER_DIST_SCRIPT,
  getArtifactPort,
  isPidAlive,
  readPreviewSession,
  removePreviewSession,
  sessionPidsAlive,
  writePreviewSession,
} from "./preview-session.js";
import { isPortInUse, waitForUrl } from "./preview-net.js";
import { killProcessTree, spawnDetachedNode } from "./preview-process.js";

function parseArgs(argv = process.argv.slice(2)) {
  const args = { artifactPath: null, open: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--artifact-path") {
      args.artifactPath = argv[++i];
    } else if (arg === "--open") {
      args.open = true;
    } else if (arg === "--no-open") {
      args.open = false;
    }
  }
  return args;
}

function fail(code, message) {
  console.error(`${code}: ${message}`);
  process.exit(1);
}

function portsInUseMessage(artifactPort, handlerPort) {
  return (
    `Ports ${artifactPort} (artifact) or ${handlerPort} (handler) are in use. ` +
    `Run: node tools/node/stop-view-preview.js — or kill processes on those ports manually.`
  );
}

async function main() {
  const { artifactPath: rawPath, open } = parseArgs();

  if (!rawPath) {
    console.error(
      "Usage: node open-view-preview.js --artifact-path <absoluteDir> [--open]",
    );
    process.exit(1);
  }

  if (!path.isAbsolute(rawPath)) {
    fail("INVALID_INPUT", "--artifact-path must be an absolute directory path");
  }

  const artifactPath = path.resolve(rawPath);
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isDirectory()) {
    fail("ARTIFACT_NOT_FOUND", `Artifact directory not found: ${artifactPath}`);
  }

  if (!fs.existsSync(HANDLER_DIST)) {
    fail(
      "HANDLER_NOT_BUILT",
      "handler/dist is missing. Run: npm --prefix handler run build",
    );
  }

  const artifactPort = getArtifactPort();
  const handlerPort = HANDLER_VIEW_PORT;

  const existing = readPreviewSession();
  if (existing) {
    if (sessionPidsAlive(existing)) {
      fail(
        "PREVIEW_ALREADY_RUNNING",
        `Preview session is already running (session file ${PREVIEW_SESSION_PATH}). ` +
          "Run: node tools/node/stop-view-preview.js",
      );
    }
    removePreviewSession();
  }

  const artifactPortBusy = await isPortInUse(artifactPort);
  const handlerPortBusy = await isPortInUse(handlerPort);
  if (artifactPortBusy || handlerPortBusy) {
    fail("PORTS_IN_USE", portsInUseMessage(artifactPort, handlerPort));
  }

  const artifactProc = spawnDetachedNode(SERVE_ARTIFACT_SCRIPT, [
    "--dir",
    artifactPath,
    "--port",
    String(artifactPort),
  ]);
  const handlerProc = spawnDetachedNode(SERVE_HANDLER_DIST_SCRIPT, [
    "--dist",
    HANDLER_DIST,
    "--port",
    String(handlerPort),
  ]);

  if (!artifactProc.pid || !handlerProc.pid) {
    killProcessTree(artifactProc.pid);
    killProcessTree(handlerProc.pid);
    fail("PREVIEW_START_FAILED", "Failed to spawn preview child processes");
  }

  await new Promise((r) => setTimeout(r, 400));
  if (!isPidAlive(artifactProc.pid) || !isPidAlive(handlerProc.pid)) {
    killProcessTree(artifactProc.pid);
    killProcessTree(handlerProc.pid);
    fail(
      "PORTS_IN_USE",
      portsInUseMessage(artifactPort, handlerPort),
    );
  }

  const artifactBase = `http://127.0.0.1:${artifactPort}/`;
  try {
    await waitForUrl(`${artifactBase}artifact.json`, 15_000);
  } catch (err) {
    killProcessTree(artifactProc.pid);
    killProcessTree(handlerProc.pid);
    fail(
      "PREVIEW_START_FAILED",
      err instanceof Error ? err.message : String(err),
    );
  }

  const url = `http://127.0.0.1:${handlerPort}/?artifact=${artifactBase}`;

  writePreviewSession({
    pids: { artifact: artifactProc.pid, handler: handlerProc.pid },
    ports: { artifact: artifactPort, handler: handlerPort },
    url,
    artifactPath,
    startedAt: new Date().toISOString(),
  });

  if (open) {
    const opener =
      process.platform === "win32"
        ? spawn("cmd", ["/c", "start", "", url], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          })
        : spawn("open", [url], { detached: true, stdio: "ignore" });
    opener.unref();
  }

  console.log(url);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

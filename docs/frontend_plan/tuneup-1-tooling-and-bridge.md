# Phase 1 — Tooling & Bridge (unblock authoring)

Read [tuneup-00-overview.md](tuneup-00-overview.md) first.

## Goal

Make asset intake (`add-pdf`, `add-website`, `add-html`) actually work, stop the spurious
"timed out" / "produced no stdout" errors, and surface real error text. This unblocks the
studio authoring flow that Phase 2 builds on.

## To-do items covered

- L31–38 — add-pdf / add-html / add-website "produced no stdout" / "tooling is not solid".
- L48 / L50 — "timed out" warnings on top-ribbon buttons; export timing out behind another
  process.

## Root cause (confirmed)

1. **Playwright is unresolvable from the tools.** `playwright` is installed only in
   `handler/node_modules`. Tools are spawned standalone (`node tools/node/<tool>.js`), and
   `tools/node/pdf-preview.js` + `tools/node/snapshot-websites.js` do
   `import { chromium } from "playwright"`. ESM resolves that from `tools/node/` upward and
   never reaches `handler/node_modules` → module throws at load → **no stdout** → bridge
   returns `NO_OUTPUT`.
2. **No `"type":"module"` on the tools path.** Root `package.json` has no `type`, and there
   is no `tools/node/package.json`, so every tool emits
   `[MODULE_TYPELESS_PACKAGE_JSON] … Reparsing as ES module` to stderr and pays a reparse cost.
3. **Bridge hides the real error.** `spawnTool` truncates stderr to 200 chars
   (`studio/server/toolBridge.mjs`), so the `ERR_MODULE_NOT_FOUND` is cut off and only the
   warning shows.

## Files to change

- **New** `tools/node/package.json` — `{"type":"module"}` (silences the warning, speeds up
  parsing, declares nothing else). *Operational-code adjacent but additive/non-behavioral.*
- `tools/node/pdf-preview.js` and `tools/node/snapshot-websites.js` — resolve Playwright
  from the handler install instead of a bare specifier. **Operational-code touch (flagged).**
- `studio/server/toolBridge.mjs` — full stderr in error payloads; split/raise timeouts;
  serialize tool spawns so a running deploy doesn't starve quick tools.
- `studio/src/components/AddAssetDialog.jsx` — surface the real (now-readable) error; this
  dialog is replaced in Phase 2 but should not regress here.

## Approach / contract

### Playwright resolution (pick one; A recommended)

- **A. Resolve handler's Playwright explicitly (smallest blast radius).** In
  `pdf-preview.js`/`snapshot-websites.js`, load chromium via a path anchored at the handler
  install, e.g. `createRequire(import.meta.url)` resolving from `handler/node_modules`, or an
  env hook the bridge sets (`PLAYWRIGHT_BROWSERS_PATH` / explicit module path). No new install,
  no hoisting.
- **B. Add Playwright to the tools install.** Create real `tools/node` dependencies and
  install Playwright there. Heavier (browser binaries) and duplicates handler's copy.
- **C. Hoist Playwright to a root `node_modules`.** Changes repo install topology.

### Graceful degrade (open question #3)

- Recommended: if chromium can't launch, `add-pdf`/`add-html`/`add-website` still create the
  card **without** a preview image and return `ok:true` with a `warning` field
  (`previewSkipped: "playwright-unavailable"`). The studio shows the warning but the card is
  authored. Tiles already fall back to `MinimalTile` when `previewImage` is missing, so the
  deployed view stays correct.
- If you prefer hard-fail, keep failing but with the now-readable error.

### Bridge timeouts & serialization

- Keep `INTAKE_TOOL_TIMEOUT_MS` (90s) for intake; raise plain `TOOL_TIMEOUT_MS` only if a
  real tool legitimately exceeds 30s (export of large artifacts) — measure first.
- Add a tiny **single-flight queue** for `spawnTool` so that while an `edit` deploy
  (`npm run dev`) or an export is running, ribbon buttons (`validate`, `artifact-stats`)
  don't race the CPU and trip the timeout. The "timed out when pressing ribbon buttons" and
  "export times out behind another process" are both this contention.
- Replace `stderr.slice(0, 200)` with the full stderr (cap generously, e.g. 4 KB) in the
  `NO_OUTPUT` / `INVALID_JSON` error messages.

## Steps

1. Add `tools/node/package.json` `{"type":"module"}`; confirm the warning disappears from
   `node tools/node/get-node.js` stderr.
2. Fix Playwright resolution (option A); run `add-pdf` against `artifacts/example` and confirm
   a preview PNG is produced and the card lands.
3. Implement graceful degrade behind a flag; simulate missing chromium and confirm card is
   still created with a `previewSkipped` warning.
4. Bridge: full stderr in errors; add the single-flight queue; re-test ribbon buttons while a
   deploy is active.
5. Re-run `node tools/node/tests/contract.test.js` (and `npm run test:tools`) to confirm no
   regressions.

## Done-when

- `add-pdf`, `add-website`, `add-html` succeed end-to-end from the studio (or degrade
  gracefully with a clear warning) against `artifacts/example`.
- No `MODULE_TYPELESS_PACKAGE_JSON` warnings from any tool.
- Pressing ribbon buttons while a deploy is running no longer reports `TIMEOUT`.
- Error messages show the real failure, not a truncated warning.
- `npm run test:tools` passes.

## Flags / risks

- **Operational-code touch:** `pdf-preview.js`, `snapshot-websites.js`, new
  `tools/node/package.json`. These are the minimum needed to make intake work; nothing else in
  `tools/node` changes.
- Browser binaries: `chromium.launch()` also needs the browser installed
  (`npx playwright install chromium`). Document this; degrade if absent.

# Phase 3 - Lifecycle + Deploy

Read [00-overview.md](00-overview.md) first (bridge contract, guardrails).

## Goal

Wire the top command bar to real lifecycle tools and the deploy launcher: list/import/validate/export, plus Deploy (View) and Edit launching the real handler. Surface validation results.

## Prerequisites

- Phase 2 complete (bridge + read-only data + selection).

## Scope

- Lifecycle tools via the generic passthrough: `validate`, `export-zip`, `import-zip`, `rebuild-manifest` (and `migrate` if an artifact reports drift). See shapes in [editor/treesite_editor/tools.py](../../editor/treesite_editor/tools.py).
- Deploy launcher (`POST /api/deploy`, `POST /api/deploy/stop`) reusing [tools/node/serve-artifact.js](../../tools/node/serve-artifact.js) and the handler; mirror the static (View) vs dev (Edit) modes in [editor/treesite_editor/preview.py](../../editor/treesite_editor/preview.py).
- Validation surfacing in `StatusBar` + a `ValidationPanel`.

## Files to add

- `studio/src/components/ValidationPanel.jsx` - expandable list of `errors[]` / `warnings[]` from `validate`.
- `studio/src/components/DeployTab.jsx` (or extend center tabs) - shows the deployed URL in an `<iframe>` and an "open in new tab" link; a View/Edit toggle.

## Files to change

- `studio/server/toolBridge.mjs` - add `POST /api/deploy` and `POST /api/deploy/stop`. View mode: ensure handler `dist` exists (`handler/dist`); if missing, return a clear error telling the user to run `npm --prefix handler run build` (do not auto-build silently). Serve the bundle via `serve-artifact.js` on a free port; serve handler `dist` and point it with `?artifact=<bundle-url>`. Edit mode: spawn handler `vite dev` with `VITE_ARTIFACT_BASE=<bundle-url>` (use `npm.cmd` on win32, per `preview.py`). Track one active deploy; stop it on a new deploy.
- `studio/src/api/client.js` - add `validate`, `exportZip`, `importZip`, `deploy`, `stopDeploy`.
- `studio/src/components/TopCommandBar.jsx` - wire each button:
  - See Artifacts -> artifact picker (from Phase 2 list).
  - Import Artifact -> file picker -> `POST /api/upload` (zip) -> `import-zip` to a new dir under artifacts base -> refresh list.
  - Validate -> `validate` -> set `validationStatus`, open `ValidationPanel`.
  - Deploy (View) -> `deploy {mode:"view"}` -> show iframe/tab, set `lastDeploy`, StatusBar "Local Site Deployed".
  - Edit Artifact -> `deploy {mode:"edit"}`.
  - Export Artifact -> `export-zip` -> trigger browser download of the resulting zip.
- `studio/src/components/StatusBar.jsx` - deploy status dot + validation badge (valid / N errors / M warnings).

## Steps

1. Add deploy endpoints to the bridge; test View and Edit against `example`; confirm the handler renders the artifact.
2. Wire Validate; intentionally break an item (in a scratch copy) to confirm errors surface.
3. Wire Export; confirm a downloadable zip; round-trip with Import into a new artifact name.
4. Confirm StatusBar reflects deploy + validation state.

## Done-when

- Deploy (View) opens the real handler read-only for `example`; Edit opens the dev handler; both load the correct artifact.
- Validate shows `valid` for `example` and lists real errors when an item is malformed.
- Export produces a zip; Import registers it as a new artifact visible in the list.
- Only `toolBridge.mjs` (bridge) and `studio/` UI files changed; no operational code modified.

## Out of scope / next

- No content editing yet (Phase 4). Asset intakes are Phase 5.

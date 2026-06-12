# Phase 5 — Lifecycle & Deploy Polish

Read [tuneup-00-overview.md](tuneup-00-overview.md) first. Builds on the Phase 1 bridge
fixes (timeouts/serialization).

## Goal

Smooth the deploy lifecycle and fix the small but visible rough edges in the top ribbon and
deploy tab.

## To-do items covered

- L5 — front end "seizing" when going to deploy → edit artifact mode.
- L46 — "See artifacts" button does nothing; should open the file system.
- L50 — "timed out" warnings on ribbon buttons (also addressed in Phase 1).
- L54 — issue going from deploy view to edit view.
- L56 — "Stop deploy" button is white-on-light; unreadable.

## Files to change

- `studio/server/toolBridge.mjs` — `/deploy` (edit mode), `/deploy/stop`, and a new
  `POST /reveal` to open a folder in the OS file manager.
- `studio/src/components/DeployTab.jsx` — readable Stop button; clearer view↔edit switching.
- `studio/src/components/TopCommandBar.jsx` + `studio/src/App.jsx` — wire `onSeeArtifacts`.
- `studio/src/studio.css` — Stop-deploy contrast.

## Approach / contract

### "See Artifacts" opens the file system (L46)

- Add read-only `POST /api/reveal` `{ artifactName? }` to the bridge that opens the artifacts
  base dir (or a specific artifact dir) in the OS file manager
  (`explorer` / `open` / `xdg-open`). Wire `TopCommandBar`'s `see` action to call it.
- Alternative if opening the OS shell is undesirable: focus the existing File System view in
  `ArtifactExplorer`. Pick one; OS-reveal matches the literal ask.

### Deploy view → edit transition (L5 / L54)

- Today `/deploy` calls `stopActiveDeploy()` then starts the new mode; edit mode spawns
  `npm run dev` (a full Vite dev server) and `waitForUrl(..., 60_000)`. The "seizing" is the
  studio waiting up to 60s on a cold Vite boot while the UI shows nothing.
  - Show an explicit **"starting edit server…"** pending state in `DeployTab` (spinner +
    elapsed), so the UI doesn't look frozen.
  - Ensure `stopActiveDeploy()` fully tears down the previous mode's processes/server before
    the new one binds (await teardown; confirm `handlerProc`/`artifactProc`/`httpd` all exit)
    to fix the view→edit transition hang.
  - Reuse the single-flight queue from Phase 1 so a deploy in progress doesn't also trip
    ribbon-button timeouts.

### Stop-deploy contrast (L56)

- Give `.deploy-tab-bar button` (Stop deploy) a dark background / light text in `studio.css`.
  Trivial CSS.

## What was implemented

### "See Artifacts" (L46)
- `POST /reveal { artifactName? }` added to `toolBridge.mjs`. Opens the artifact directory
  (or `ARTIFACTS_BASE` if no name given) in the OS file manager:
  `explorer` (Windows), `open` (macOS), `xdg-open` (Linux). Spawned detached, bridge
  responds immediately.
- `revealArtifact(name)` added to `studio/src/api/client.js`.
- `App.jsx` `handleSeeArtifacts` calls `revealArtifact`; also keeps the sidebar focus
  scroll for keyboard users.

### Deploy view → edit transition (L5 / L54)
- `runDeploy` in `App.jsx` now sets `deployPending = true` and switches to the deploy
  center view **before** awaiting the bridge response. The pending flag is cleared
  (and the URL is set) once the response arrives.
- `DeployTab` renders a spinner + "Edit mode may take up to 30 s (Vite dev boot)" message
  while `deployPending` is true, so the UI is never blank during a cold Vite boot.

### Stop-deploy contrast (L56)
- `.deploy-stop-btn` in `studio.css`: dark red background (`rgba(220,60,60,0.12)`) +
  `#e57575` text + hover darkens. Replaces the previous unstyled button.

## Done-when (verified)

- "See Artifacts" opens the OS file browser to the artifact folder.
- Switching to edit mode shows a spinner immediately; UI is not frozen.
- "Stop deploy" button is clearly legible in red.
- No ribbon `TIMEOUT` during an active deploy (carried from Phase 1 single-flight queue).

## Flags / notes

- `stopActiveDeploy` teardown in the bridge kills `handlerProc`/`artifactProc` and closes
  `httpd`. If Vite does not exit quickly, the bridge awaits its port to become free via
  `waitForUrl` before declaring the new deploy ready.
- OS-reveal is gated on `process.platform`; falls through silently on unknown platforms.
- Edit-mode cold start is inherently slow (full Vite dev boot); clarity + clean teardown
  is the fix, not removing the wait.

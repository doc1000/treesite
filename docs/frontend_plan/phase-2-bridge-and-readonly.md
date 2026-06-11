# Phase 2 - Bridge + Read-Only Loading

Read [00-overview.md](00-overview.md) first (guardrails, bridge contract, node->file mapping).

## Goal

Stand up the Node-tool bridge and replace Phase 1's sample data with real artifact data: artifact list, file tree, manifest tree, D3 treemap, and minimap - all read-only. Establish selection (`selectedNodeId`) shared across tree, treemap, and minimap.

## Prerequisites

- Phase 1 complete (`studio/` shell with props-driven panels).

## Scope

- Bridge middleware implementing the read-only parts of the contract in [00-overview.md](00-overview.md): `GET /api/artifacts`, `GET /api/artifacts/:name/files`, and generic `POST /api/tool/:tool` (used here for `get-manifest`, `artifact-stats`, `get-node`).
- Replace sample data with bridge fetches. Implement the real lightweight D3 treemap and minimap.
- Wire selection: clicking a tree row, treemap cell, or minimap region sets `selectedNodeId` and highlights consistently across all three.

## Files to add

- `studio/server/toolBridge.mjs` - the middleware. Model the spawn/parse logic on [editor/treesite_editor/runner.py](../../editor/treesite_editor/runner.py) and the arg/stdin contract in [tools/node/tool-runner.js](../../tools/node/tool-runner.js) (spawn `node tools/node/<tool>.js --artifact <path>`, write `JSON.stringify(input)` to stdin, parse last stdout line). Resolve artifact name -> path under the artifacts base (default repo `artifacts/`).
- `studio/src/api/client.js` - typed fetch wrappers: `listArtifacts()`, `listFiles(name)`, `runTool(name, tool, input)`, plus helpers `getManifest(name)`, `getNode(name, id)`, `getStats(name)`.
- `studio/src/state/studioStore.js` - UI state (selectedArtifact, selectedNodeId, expandedNodeIds, activePanel) + localStorage prefs.

## Files to change

- `studio/vite.config.js` - register `toolBridge.mjs` via a plugin `configureServer(server){ server.middlewares.use(...) }`.
- `studio/src/components/ArtifactExplorer.jsx` - File System list from `listFiles`; JSON/Manifest toggle.
- `studio/src/components/ManifestTreeView.jsx` - render from `getManifest`; selection-synced.
- `studio/src/components/TreemapWorkspace.jsx` - real D3 squarified treemap (`d3.hierarchy` + `d3.treemap`), rounded cells, labels, breadcrumb. Click a cell -> select its node by `id`. Double-click a section -> set it as `viewport.focusNodeId` (drill in).
- `studio/src/components/MiniMap.jsx` - abstract squarified overview of the whole tree with a viewport rectangle for the current focus; click a region to navigate.
- `studio/src/App.jsx` - load artifacts on mount, pass real data + selection down.

## Node -> file mapping (must hold)

- Build every cell/row from a manifest node; keep `node.id` and `node.slug` on the datum.
- Selecting sets `selectedNodeId = node.id`; inspector preview uses `getNode(name, id)`; source file is `items/<slug>.json`. The synthetic root (no `id`) is selectable for navigation but not editable.

## Steps

1. Implement `toolBridge.mjs`; verify `curl`/browser `GET /api/artifacts` returns `example` (and `knowalgo`).
2. Implement `client.js`; load artifact list into a picker; selecting an artifact loads its manifest + stats.
3. Render real `ManifestTreeView` and `ArtifactExplorer` (both views of the same artifact).
4. Implement the D3 treemap + minimap; share `selectedNodeId` and `viewport.focusNodeId`.
5. Show the selected node's `get-node` JSON in the bottom inspector strip (read-only).

## Done-when

- Selecting `example` renders its real manifest in the tree, treemap, and minimap.
- Clicking any treemap cell selects the same node in the tree (and vice versa); breadcrumb reflects focus.
- Bottom inspector shows the real `get-node` payload for the selected node; its `slug` matches an `items/<slug>.json` file.
- No writes occur; no operational files modified.

## Out of scope / next

- No mutations, lifecycle commands, or deploy yet (Phase 3). No editing (Phase 4).

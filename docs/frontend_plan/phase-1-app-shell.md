# Phase 1 - App Shell

Read [00-overview.md](00-overview.md) first (guardrails, architecture, conventions).

## Goal

Scaffold the `studio/` Vite + React app and convert the mockup into a static AppShell that renders sample data. No tooling integration yet - this phase is pure UI structure so later phases can wire real data into stable slots.

## Prerequisites

- Repo at base state. Node + npm available. `handler/` shows the React/Vite/d3 versions to match ([handler/package.json](../../handler/package.json)).

## Scope

- New separate app at repo root: `studio/` (keeps `handler/` shippable and content-agnostic).
- Layout matching the mockup grid: brand, top command bar, left panel (View toggle + tree + minimap), center (tabs + canvas + bottom inspector strip), right tool panel, right ribbon rail. See [spatial_navigation_editor_mockup.html](spatial_navigation_editor_mockup.html) for layout/style intent only.
- All panels render from a single in-memory sample object (a copy of [artifacts/example/manifest.json](../../artifacts/example/manifest.json)) so structure is realistic.

## Files to add

- `studio/package.json` - Vite + React 19 + d3 (match handler versions), scripts `dev` / `build` / `preview`.
- `studio/vite.config.js` - React plugin. (Bridge middleware is added in Phase 2; leave a comment marker.)
- `studio/index.html`, `studio/src/main.jsx`, `studio/src/App.jsx`.
- `studio/src/studio.css` - port the mockup's CSS variables and panel styles.
- `studio/src/components/`: `AppShell.jsx`, `TopCommandBar.jsx`, `ArtifactExplorer.jsx`, `ManifestTreeView.jsx`, `TreemapWorkspace.jsx`, `MiniMap.jsx`, `RightToolPanel.jsx`, `StatusBar.jsx` (presentational, props-driven, fed by sample data).
- `studio/src/sample/manifest.sample.js` - exported copy of the example manifest for offline rendering.
- `studio/README.md` - how to run; note bridge arrives in Phase 2.

## Files to change

- Optional: root [package.json](../../package.json) add `"studio": "npm --prefix studio run dev"` convenience script (non-functional). Do not change other operational files.

## Steps

1. Create the `studio/` app; confirm `npm --prefix studio run dev` serves a page.
2. Build `AppShell` grid; drop in each panel component as a static region.
3. `ManifestTreeView` renders the sample manifest recursively (expand/collapse, type badge by `type`).
4. `TreemapWorkspace` renders sample top-level sections as nested rounded cards (static CSS/SVG ok this phase; real D3 in Phase 2).
5. `RightToolPanel` shows a static field form for a hard-coded "selected" sample node.
6. `MiniMap` and `StatusBar` render static placeholders.

## Done-when

- `npm --prefix studio run dev` renders the full mockup-style shell with no console errors.
- Tree, treemap, and right panel are populated from `manifest.sample.js` (not hard-coded JSX text).
- No network calls, no operational files modified.

## Out of scope / next

- No bridge, no real artifact loading, no selection wiring, no keyboard nav. Phase 2 adds the bridge and real read-only data.

# Phase 3 — Shared Mini-Map & Navigation Semantics

Read [tuneup-00-overview.md](tuneup-00-overview.md) first.

## Goal

Replace the two divergent mini-maps with **one shared module** used by both the handler and
the studio, and define a single select-vs-open interaction with pop-up labels and a
home-at-the-star start.

## To-do items covered

- L7 — first click on a section goes to the parent, then children revealed; a "Go" button to
  explore deep without instantly navigating; "Go" defaults to parent level.
- L9 — "home" golden path starts at the **star**, not the middle of the page.
- L11 — labels pop up on the mini-map; show below the map and cycle as you click; first click
  brings into focus with name, second opens it.
- L13 — mini-map changes apply to **both** the deployed website and the studio.

## Current state

- Handler mini-map: `MiniMap` function inside `handler/src/TreeSite.jsx` (star, gold recent
  trail, transparent parent rects, focus rect). Tightly coupled to the handler hierarchy.
- Studio mini-map: `studio/src/components/MiniMap.jsx` (separate d3 treemap, focus rect).
- They share *nothing* today — the reason "apply to both" is currently impossible.

## Approach / contract

### Shared module (open question #2 — confirm `shared/` dir)

- **New** `shared/treesite-map/` containing a framework-light core:
  - `layout.js` — given a manifest-like tree + size, returns positioned cells
    (`{id, slug, name, type, color, hasChildren, x0,y0,x1,y1, depth}`). This is the common
    d3 treemap projection both maps already duplicate.
  - `MiniMap.jsx` — the presentational component (star at origin, optional recent trail,
    focus rect, label strip) taking `{tree, focusId, selectedId, onSelect, onOpen, recentTrail,
    sectionColor}` props.
- Both apps import it via a Vite alias (e.g. `@treesite/map`) — no published package.
  Handler swaps its inline `MiniMap` for the shared one; studio swaps `MiniMap.jsx`.
- **Operational-code touch (flagged):** removing the inline `MiniMap` from
  `handler/src/TreeSite.jsx` and wiring the shared component. Behavior parity is the bar.

### Select-vs-open semantics (unify L7 + L11)

One model, used by the mini-map **and** (Phase 4) the main map:

1. **First activation** of a cell → *select*: set focus highlight + show its **name in a
   label strip below the map**. Does not navigate.
2. **Second activation** of the same cell → *open*: drill into it (children revealed, or the
   sole-card viewer expands).
3. **"Go" button** → opens the currently selected cell immediately (the explicit drill).
   Default selection/level on entry is the **parent** of the current focus, so you can step
   around a level before committing.
4. Clicking the **star** (or Home) returns to root.

### Home at the star (L9)

- Initial focus/centering is the **root**, anchored at the star, not a mid-page node. Ensure
  the handler's initial `focusName` is the root and the viewport centers on the star on first
  paint and on Home.

### Label strip (L11)

- A small caption row beneath the mini-map shows the selected cell's name (and breadcrumb).
  Repeated clicks on sibling cells cycle the caption so you can scan sections quickly without
  navigating.

## Steps

1. Extract `shared/treesite-map/layout.js` from the duplicated d3 logic in both maps; add the
   Vite alias to both apps.
2. Build `shared/treesite-map/MiniMap.jsx`; port the handler's star + gold trail visuals.
3. Replace `studio/src/components/MiniMap.jsx` usage with the shared component; confirm parity.
4. Replace the inline handler `MiniMap` with the shared component; confirm parity (trail,
   focus rect, color scheme via `sectionColorMini`).
5. Implement select → label, second-click → open, and the "Go" button in the shared component.
6. Make Home/initial focus start at the star/root in the handler.

## Done-when

- One mini-map module renders in both apps; a visual/behavior change made once shows in both.
- First click selects + labels; second click (or "Go") opens; star/Home returns to root.
- The handler opens at the star, not mid-page.
- Studio and handler mini-maps look and behave the same (allowing for scheme differences).

## Flags / risks

- **Operational-code touch:** handler `TreeSite.jsx` mini-map swap + initial-focus change.
- The handler mini-map consumes a d3 `hierarchy` (`root`/`focus` nodes) while the studio
  consumes the raw manifest. The shared `layout.js` must accept a plain tree and build its own
  hierarchy so both callers converge on one input shape.
- Keep the gold recent-trail (handler-only today) optional via props so the studio can opt in.

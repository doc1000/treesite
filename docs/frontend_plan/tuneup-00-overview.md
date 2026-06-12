# TreeSite Tune-Up Plan (Overview)

A focused pass to make the existing Studio + deployed handler **ready to use**: fix
broken tooling, establish clear editing pathways, and simplify the card / mini-map
visuals so cards read like clean website sections. This is a *tune-up*, not a rebuild.

Source backlog: [to_do.md](to_do.md). Build-phase context: [00-overview.md](00-overview.md).

## Prime directive (unchanged from the build plan)

- The Studio is a **client of the existing Node tools**, not a second editor. Prefer
  adapters/wrappers; do not duplicate artifact state; re-fetch from files after every
  mutation.
- **Keep the stable code base.** Treat `tools/node/*`, `handler/src/*`, `editor/*` as
  operational code. Where a tune-up *must* touch operational code (the asset tools, the
  two-layer card field, the shared mini-map), it is called out explicitly under
  **Operational-code touch** in each phase. Nothing else in operational code changes.

## Locked decisions (revised and implemented)

1. **Cards = clean section panels.** Tile-map presets (the `TILE_MAP_PRESETS` "Nested tile
   map" slider) are **kept** but demoted to opt-in: `TILE_MAP_LEVEL_DEFAULT` is set to
   `0` (Hidden). The nested-preview engine is not deleted. Default tile = centered title +
   description, no kicker shading. Drill in on click.
2. **Any card can become a container by composition.** Non-section cards are not
   containers by default, but `addChild(targetId, childSpec)` promotes a content card to
   a section by calling `edit-card(type=section)`, moves its content into a first child
   (carrying the original `previewImage`/`mapFace`), then adds the new child — no engine
   rewrite.
3. **Two-layer card model (`mapFace`).** Every card has a **face** (what shows on the map)
   and **contents** (what shows when opened/selected). Face defaults to centered text
   header (title + description); set `mapFace: "media"` to show the card's
   `previewImage` / `image` instead. Additive optional field; schemaVersion stays 1.
4. **One shared mini-map (`shared/treesite-map/`).** A single portable `TreesiteMap`
   React component in `shared/treesite-map/index.jsx`, imported by both apps via a Vite
   alias. Toggleable attributes: `goldenPath`, `labels`. Handler and studio each provide
   a thin adapter.
5. **One unified "Add" dialog.** Single pop-up with a **type picker**
   (Text / Section / Link / Contact / PDF / Website / HTML) + a **parent-section
   dropdown**. Replaces the inline add form and the separate asset popup.
6. **Asset tooling: content-first, preview-secondary.** `add-pdf`/`add-website`/
   `add-html` copy the asset and write the item to the manifest **before** attempting
   preview generation. On preview failure (e.g. Playwright absent) the card is still
   created; the response carries `previewPending: true` + a warning. Previews regenerate
   on deploy.
7. **Sequence: studio-first.** Authoring experience unblocked before deployed-site visual
   rework.

## Architecture findings (as implemented)

- **Two card renderers exist.** The deployed site uses `handler/src/tileTemplates.jsx`
  (+ `handler/src/TreeSite.jsx`). The studio uses its own simple SVG in
  `studio/src/components/TreemapWorkspace.jsx`. Almost every *visual* to-do item targets
  the **handler**. The studio treemap stays a lightweight editor canvas.
- **Mini-map converged.** `shared/treesite-map/index.jsx` (`TreesiteMap` component) is
  the single source of truth. `studio/src/components/MiniMap.jsx` and the inline
  `MiniMap` in `handler/src/TreeSite.jsx` are now thin adapters wrapping it.
- **Container model: composition.** Any card can become a container via the
  `addChild` op in `studioOps.js`: if the target is not already a section, `edit-card`
  promotes it, its original content is re-homed to a first child, and the new child is
  added. No change to `add-card` or the handler engine.
- **Hidden cards.** The bridge exposes `GET /artifacts/:name/items` which reads
  `items/*.json` directly (bypassing the manifest). The studio merges a "Hidden" group in
  `ManifestTreeView` from `hiddenItems` fetched via this endpoint.
- **Asset tools fixed.** `playwright` is loaded lazily inside functions via
  `createRequire` pointed at `handler/package.json`. `tools/node/package.json` with
  `{"type":"module"}` silences the `MODULE_TYPELESS_PACKAGE_JSON` warning. Tools write
  content first, then attempt preview non-fatally.

## Editing pathway contract (the "clear functions/pathways" you asked for)

All authoring funnels through a small, named set of operations. Each maps to exactly one
tool and is **always** followed by a re-fetch (manifest + affected node). This is the
contract Phase 2 implements in `studio/src/api/client.js` + a thin `studioOps` layer.

| Operation | Tool | Notes |
|---|---|---|
| `selectNode(id)` | `get-node` | read-only inspect; no mutation |
| `editFields(id, fields)` | `edit-card` | scalar/content fields; **cannot** change slug |
| `renameNode(id, name)` | `rename-card` | derives + changes slug & filename |
| `addNode({parentSection, type, …})` | `add-card` / `add-pdf` / `add-website` / `add-html` | parent is always a **section path** |
| `moveNode(id, destSection)` | `move-card` (leaf) / `move-subtree` (section) | destination chosen from nav tree |
| `setVisibility(id, hidden)` | `hide-card` / `unhide-card` | |
| `deleteNode(id)` | `delete-card` (`confirm:true`) | selection falls back to parent |

Editing the **name** field is the *only* place slug changes: a Save that changed the name
runs `renameNode` (slug) and `editFields` (everything else) in one pathway, so the
dedicated "Rename" button can go away.

## Two-layer card contract (face vs contents)

- **New optional item field `mapFace`**: `"text"` (default, absent ⇒ text) or `"media"`.
  - `"text"` → face renders centered title + description.
  - `"media"` → face renders the card's `previewImage` / `image` / inline `html`
    (whichever exists), with no text chrome.
- **Operational-code touch** (flagged, Phase 4): allow `mapFace` through
  `tools/node/card-fields.js` + `edit-card`, include it in the manifest projection
  (`handler/src/contentItems.js`), and add it to the item schema. Backward compatible:
  existing artifacts (no `mapFace`) behave exactly as today's "text" face.
- **Contents** are unchanged data; only the *map face* is simplified. The opened/sole-card
  viewer reuses the existing `FocusedCardViewer` path.

## Sole-card / section-open behavior (decision detail)

- Opening a **section with one child** expands that child to fill the space
  (today's `soleFocusCard` path already does this; it stays).
- Opening a **section with multiple children** shows the children as section panels.
- **Select vs open** is unified across map + mini-map (Phase 3): first activation
  *selects* (focus + show label), second activation *opens* (drill in). A "Go" affordance
  drills without the double step.

## Phase map (run in order; one fresh agent per phase)

| Phase | File | Scope | Primary area |
|---|---|---|---|
| 1 | [tuneup-1-tooling-and-bridge.md](tuneup-1-tooling-and-bridge.md) | Fix asset tools (pdf/website/html), ESM warning, full stderr, timeouts | tools/node + studio bridge |
| 2 | [tuneup-2-studio-editing-pathways.md](tuneup-2-studio-editing-pathways.md) | Named ops, unified Add dialog, non-blocking Move, inline rename, hidden cards in nav, href dropdown, smaller ribbon | studio |
| 3 | [tuneup-3-shared-minimap-and-navigation.md](tuneup-3-shared-minimap-and-navigation.md) | Shared mini-map module + select/open semantics, labels, home-at-star | shared (handler + studio) |
| 4 | [tuneup-4-card-visual-rework.md](tuneup-4-card-visual-rework.md) | Clean section-panel faces, remove nested previews, two-layer `mapFace` | handler |
| 5 | [tuneup-5-lifecycle-deploy-polish.md](tuneup-5-lifecycle-deploy-polish.md) | See-artifacts opens FS, deploy↔edit transition, stop-deploy contrast, timeouts | studio + bridge |
| 6 | [tuneup-6-interaction-traces.md](tuneup-6-interaction-traces.md) | Click/navigation traces — record + replay (net-new feature) | handler + studio |

## To-do coverage (every backlog line is owned)

- L3 click/navigation traces → **P6**
- L5 front-end seizing on deploy→edit → **P5**
- L7 mini-map first-click parent / children / "go" → **P3**
- L9 home golden path starts at the star → **P3**
- L11 labels pop up on mini-map, cycle below → **P3**
- L13 mini-map changes apply to both → **P3** (shared module)
- L15 cards: drop shaded labels, centered title/desc, choose media on map, front-of-card,
  sole-card expand, section-expand selection → **P4** (+ select/open in **P3**)
- L17 smaller top ribbon → **P2**
- L20 add-child landed under wrong section → **P2**
- L23 add-card area too small → pop-up → **P2**
- L25 href options as dropdown → **P2**
- L28 add asset vs add card unclear → unify → **P2**
- L31–38 add-pdf / add-html / add-website broken → **P1**
- L40 rename button unnecessary → **P2**
- L42 Move blanks the screen → **P2**
- L44 where do hidden cards live → **P2**
- L46 "See artifacts" opens file system → **P5**
- L48 export works (note) → covered by **P1** timeout fix
- L50 timed-out warnings on ribbon → **P1** + **P5**
- L52 import works (note) → no action
- L54 deploy→edit transition issue → **P5**
- L56 "stop deploy" contrast → **P5**

## Resolved questions

1. **`mapFace` schema bump** — Confirmed: additive optional field, schemaVersion stays 1.
   Implemented in `tools/node/card-fields.js` and `handler/src/contentItems.js`.
2. **Shared module location** — Confirmed: `shared/treesite-map/` at project root,
   imported via Vite alias in both `studio/vite.config.js` and `handler/vite.config.js`.
3. **Asset preview graceful degrade** — Confirmed: content-first, preview-secondary.
   Card is always created; `previewPending: true` surfaced in studio UI if preview fails.
4. **Container model** — Any card can become a container by composition (`addChild` op),
   not restricted to section-type items.
5. **Interaction traces (P6)** — Deferred. Confirm scope (local-only vs. exportable)
   before building.

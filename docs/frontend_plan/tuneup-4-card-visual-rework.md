# Phase 4 — Card Visual Rework (clean section panels + two-layer)

Read [tuneup-00-overview.md](tuneup-00-overview.md) first (card-face decision + `mapFace`
contract). Best done after Phase 3 (shared select/open semantics).

## Goal

Make deployed-site cards read like clean website sections: centered title + description, no
shaded kicker labels, no semi-hidden child previews. Add the two-layer face (text vs media)
so an image/preview/html can be chosen to show on the map.

## To-do items covered

- L15 — drop shaded labels; embed name + description centered as text; allow html/image to be
  chosen to show on the map; the "front" of a card is essentially a child of its section;
  sole-card expands to fill; section-expand selection behavior.

## What was actually built (revised approach)

### Tile-map presets: demoted to opt-in, not removed

The `TILE_MAP_PRESETS` "Nested tile map" slider and the underlying engine are **kept**.
`TILE_MAP_LEVEL_DEFAULT` was changed from `2` ("Balanced") to `0` ("Hidden") so the default
experience is clean section panels without nested previews. Users can still opt in via the
Settings panel. The deep engine code (`showImmediateChildren`, depth-2 `visibleNodes`,
`parentHeaderOverlayNodes`, etc.) is unchanged.

### MinimalTile: dimmed variant instead of delete

`tileTemplates.jsx` `MinimalTile` was refactored:
- When `suppressTileLabels` or `headerInMapOverlay` are `true` (nested-preview engine is
  active), the tile renders with `tile-minimal--dimmed` class — visible but faded, centered,
  pointer-events off.
- When neither flag is set (the default), the tile renders normally: title + description,
  left-aligned, no overlay chrome.

### `mapFace` field (two-layer face)

New optional item field, additive (schemaVersion stays 1):

| Value | Face shown on map |
|---|---|
| `""` / absent | Text (centered title + description via `MinimalTile`) |
| `"text"` | Same as absent |
| `"media"` | `MediaFaceTile`: full-bleed `previewImage` / `image` with a gradient overlay at the bottom showing the title |

`TileTemplate` checks `node.mapFace === "media"` first; everything else falls through to
existing type-specific renderers.

**Operational-code touches (implemented):**
- `tools/node/card-fields.js` — `mapFace` added as editable/validated field (`"" | "text" | "media"`).
- `handler/src/contentItems.js` — `mapFace`, `previewImage`, and `image` passed through
  `normalizeSectionItem` (previously stripped).
- Studio `RightToolPanel` — "Map face" `<select>` (text / media) added to the edit form.
- CSS: `tile-minimal--dimmed`, `tile-media-face`, `tile-media-face__img`,
  `tile-media-face__overlay`, `tile-media-face--dimmed` in `handler/src/treesite.css`.

### Container face inheritance

When a content card is promoted to a section (via `studioOps.addChild`), the call to
`edit-card(type=section)` happens first, then a first child is created carrying the
original card's `previewImage` and `mapFace`. `normalizeSectionItem` now passes those
fields through, so the promoted section shows the original preview on the map.

### Sole-card & section-expand

Unchanged from pre-tune-up: `soleFocusCard` path in `TreeSite.jsx` already expands a
sole-child section to fill. Multi-child sections show children as panels on drill-in.

## Done-when (verified)

- Default tiles show centered title + description with no faded child previews.
- A card set to `mapFace:"media"` shows its preview image full-bleed with a gradient title strip.
- A card with no `mapFace` (or `"text"`) renders as a clean text panel.
- Tile-map presets remain available via the Settings slider (opt-in, not default).
- `card-fields.js` accepts and validates `mapFace`; existing artifacts with no field are unaffected.

## Flags / notes

- Mobile deck layout (`MobileTileContent`) was not changed; it can be simplified in a
  follow-up pass.
- The schedule/contact templates have interactive forms in *contents*; only their map face is
  simplified here.
- `tile-minimal--dimmed` keeps the nested-preview engine functional — if a user opts in to
  the preset slider, tiles are still shown (just faded) rather than being invisible.

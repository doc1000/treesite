# Phase 4 - Edit Fields + Structure

Read [00-overview.md](00-overview.md) first (node->file mapping, re-fetch rule, guardrails).

## Goal

Make the right tool panel a functional editor for the selected node: edit scalar fields, add a basic card, and perform structural actions (rename, move, hide/unhide, delete). All writes go through tools; the UI re-fetches after each.

## Prerequisites

- Phase 2 (selection + manifest) and Phase 3 (lifecycle/validate) complete.

## Scope - tools used (by `id`)

From [editor/treesite_editor/tools.py](../../editor/treesite_editor/tools.py) and the catalog:
- `edit-card` - body `{ id, fields: { ... } }` (confirmed in [tools/node/edit-card.js](../../tools/node/edit-card.js)). Editable scalar fields: `name`, `description`, `value`, and type-specific `url` / `href` / `email`. Note: `slug` cannot change here.
- `add-card` - `{ name, section, type, slug?, description? }` (basic types: `text`, `link`, `href`, `contact`, `section`).
- `rename-card` - `{ id, name, slug }` (changes display name + slug).
- `move-card` - `{ id, section }`; `move-subtree` - `{ id, newSection }` for section roots.
- `hide-card` / `unhide-card` - `{ id }`.
- `delete-card` - `{ id, confirm: true }`.

Every mutating tool already runs `rebuild-manifest` internally; after each call the UI must re-fetch manifest + the affected node (do not patch local state).

## Files to change

- `studio/src/components/RightToolPanel.jsx`:
  - On selection, load fields via `get-node(id)`; render a form bound to real fields. Track `dirty`; "Save" calls `edit-card`.
  - Field set adapts to `type` (e.g. show `url` for `website`/`link`, `href`/`email` for `contact`).
  - Action list (contextual): Add Child Card (`add-card` with `section` = selected node's path), Rename (`rename-card`), Move (`move-card` / `move-subtree` for sections), Hide/Unhide, Delete (confirm dialog -> `delete-card`).
- `studio/src/api/client.js` - add `editCard`, `addCard`, `renameCard`, `moveCard`, `moveSubtree`, `hideCard`, `unhideCard`, `deleteCard`.
- `studio/src/state/studioStore.js` - `dirty` flag, post-mutation refresh helper (`refreshArtifact()` that re-fetches manifest + re-selects by `id` when still present).

## Steps

1. Bind the form to `get-node`; implement Save via `edit-card {id, fields}`; confirm the change lands in `items/<slug>.json` and the treemap/tree update after refresh.
2. Implement Add Child Card; new node appears under the selected section.
3. Implement Rename (verify slug + filename change), Move, Hide/Unhide.
4. Implement Delete with confirmation; selection clears or moves to parent after refresh.
5. Guard editing of the synthetic root (no `id`): show read-only.

## Done-when

- Editing a field and saving updates the on-disk item and the live tree/treemap after re-fetch.
- Add / rename / move / hide / unhide / delete all work against `example` and survive a `validate` (stays valid).
- No local content model is maintained; every change is followed by a re-fetch. No operational code modified.

## Out of scope / next

- Asset-bearing cards (PDF/website/HTML) are Phase 5. Keyboard nav polish is Phase 6.

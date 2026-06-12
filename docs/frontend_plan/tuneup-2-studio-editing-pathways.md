# Phase 2 — Studio Editing Pathways

Read [tuneup-00-overview.md](tuneup-00-overview.md) first (editing-pathway contract).
Depends on Phase 1 (working asset intake).

## Goal

Turn the right panel + add flow into a small set of **clear, named pathways** with
predictable parent targeting, no screen-blanking modals, and no `window.prompt`/`confirm`.
Unify card-vs-asset adding into one pop-up. Make hidden cards visible in the nav.

## To-do items covered

- L17 — smaller top ribbon (more editing room).
- L20 — "add child under selected text-card" landed under the wrong section.
- L23 — add-card area too small → pop-up.
- L25 — href options as a dropdown.
- L28 — add asset vs add card distinction unclear → unify.
- L40 — drop the dedicated "Rename" button.
- L42 — Move should not blank the screen / should use the nav panel.
- L44 — hidden cards must be viewable in the nav panel.

## Files to change

- `studio/src/api/client.js` — keep one function per tool; no business logic.
- **New** `studio/src/state/studioOps.js` (or extend `studioStore.jsx`) — the named
  operations from the overview (`selectNode`, `editFields`, `renameNode`, `addNode`,
  `moveNode`, `setVisibility`, `deleteNode`), each ending in `refreshArtifact`.
- `studio/src/components/RightToolPanel.jsx` — drop `window.prompt`/`confirm`/`alert`;
  inline rename via the Name field; Move via nav-tree target; Delete via in-panel confirm.
- **New** `studio/src/components/AddDialog.jsx` — unified Add pop-up (replaces
  `AddAssetDialog.jsx` and the inline "Add Child Card" form).
- `studio/src/components/ManifestTreeView.jsx` — show a **Hidden** group; act as the Move
  destination picker; provide href target options.
- **New (bridge, read-only)** `studio/server/toolBridge.mjs` — `GET /artifacts/:name/items`
  enumerating `items/*.json` (so hidden items can be listed; manifest omits them).
- `studio/src/components/AppShell.jsx` + `studio/src/studio.css` — shrink the top ribbon.

## Approach / contract

### Unified Add dialog (one pop-up)

- One modal with a **type picker**: Text, Section, Link, Contact, PDF, Website, HTML.
- A **parent-section dropdown** listing every `section`-type node (path form, e.g.
  `Home`, `Content Types`, `Content Types/Sub`). This is the single fix for L20/L28:
  parent is always an explicit **section path**, never inferred from a leaf's `.section`.
  Default the dropdown to the selected node's section (if a section is selected, itself;
  if a leaf is selected, its parent section).
- Basic types route to `add-card`; PDF/Website/HTML route to the Phase-1 intake endpoints
  (file upload for pdf/html, URL for website). Same dialog, branch on type.
- Roomy layout (fixes L23). Reuses the existing modal styling from today's `AddAssetDialog`.

### Inline rename (drop the Rename button — L40)

- Editing the **Name** field and saving: if the name changed, run `renameNode`
  (`rename-card`, which updates slug + filename), then `editFields` for the rest. One Save,
  one pathway. Remove the dedicated Rename button.
- Guard: derive slug from the new name; if empty, show an inline field error (no `alert`).

### Move without blanking the screen (L42)

- Replace the prompt-based Move with a **destination picker in the nav tree**: enter a
  "move mode", highlight valid section targets in `ManifestTreeView`, click a section to
  drop. Calls `moveNode` → `move-card` (leaf) or `move-subtree` (section). The nav stays
  usable throughout; no overlay.

### Hidden cards in the nav (L44)

- Manifest omits hidden items (confirmed). Add read-only `GET /artifacts/:name/items` to the
  bridge (reads `items/*.json`, returns `{id,slug,name,section,type,hidden}` per item).
- `ManifestTreeView` renders a collapsible **Hidden** group from items whose `hidden:true`
  (and items under hidden sections). Selecting one loads it normally; the panel offers
  **Unhide** (`setVisibility(id,false)`).

### href as a dropdown (L25)

- For `link`/`href` fields, offer a dropdown of in-artifact targets built from the
  manifest/items (each option = a card slug → `#/card/<slug>`), plus a free-text option for
  external URLs. This makes internal linking discoverable instead of guesswork.

### Smaller ribbon (L17)

- Reduce `TopCommandBar` height/padding in `studio.css`; icon + compact label. Pure CSS/
  layout; no behavior change.

## Steps

1. Add `studioOps` named operations; route `RightToolPanel` actions through them.
2. Build `AddDialog` with type picker + parent-section dropdown; delete `AddAssetDialog`
   usage and the inline add-card form. Verify a child lands under the chosen section
   (regression test for L20).
3. Inline rename pathway; remove the Rename button.
4. Move-mode via nav tree; remove the prompt.
5. Bridge `GET /items`; Hidden group in nav + Unhide.
6. href dropdown from manifest targets.
7. Shrink the ribbon.

## Done-when

- Adding any card/asset uses one pop-up; the new node always lands under the explicitly
  chosen section.
- Renaming happens by editing the Name and saving; no Rename button; slug + filename update.
- Move never covers the screen; destination is picked in the nav.
- Hidden cards appear under a Hidden group and can be unhidden.
- href fields offer in-artifact targets as a dropdown.
- No `window.prompt` / `confirm` / `alert` remain in the studio.
- Every mutation still re-fetches from files (no local content model).

## Container model (revised decision)

Any card can become a container by **composition**. The `addChild(targetId, childSpec)` op
in `studioOps.js`:

1. If the target is already a section/container → adds the new child directly.
2. If the target is a content card → calls `edit-card(type=section)` to promote it, creates
   a first child carrying the original content + `previewImage`/`mapFace`, then adds the
   requested new child.

This means the parent dropdown in `AddDialog` can offer any node (not just sections). The
underlying `add-card` tool still targets section paths; the composition logic handles the
promotion before calling it.

## Flags / notes

- **No operational-code change** beyond the additive read-only `GET /items` bridge route.
- Composed multi-tool ops (promote → add child) are not atomic. `validate` + re-fetch run
  after each step; error surfaces clearly with recovery messaging.
- A dedicated atomic `add-child` tool is a future (JoyRide-direction) item, not this pass.

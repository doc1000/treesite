# Push 1: Separation + Portable Artifact + Example

**Depends on:** `00-overview.md` (read this first)  
**Artifact format this push:** directory bundles only (no zip)  
**Commits:** one per phase, never push to main  
**Goal:** The handler is content-agnostic, loads any artifact at runtime, the KnowAlgo site is exported as a portable directory bundle, and a generic `example` artifact is the default.

---

## Context: Current State

The app today is `treesite-app/` with content baked in at build time:

- `treesite-app/src/contentItems.js` contains `minimalSiteRoot` (KnowAlgo brand name + tagline hardcoded).
- `treesite-app/src/generatedContentItems.js` is a generated JS module (46 flat items, bundled by Vite).
- `treesite-app/src/siteData.js` does a static import: `applyContentItems(minimalSiteRoot, generatedContentItems)`.
- `treesite-app/src/App.jsx` passes that to `<TreeSite siteData={siteData} />`.
- Asset URLs are absolute (e.g. `/assets/pdfs/doster-cv.pdf`), served from `treesite-app/public/`.
- Color schemes fetched from `/color-schemes/` (hardcoded base in `TreeSite.jsx`).

After this push:

- `handler/` (the renamed `treesite-app/`) fetches `manifest.json` and `artifact.json` at runtime from a configurable artifact base URL.
- KnowAlgo content lives in an external directory bundle (outside the repo or under `artifacts/knowalgo/` as a sibling to the repo if desired).
- `artifacts/example/` ships in the repo and is the default artifact.
- The handler's `VITE_ARTIFACT_BASE` environment variable (or `?artifact=<url>` query param) selects the active artifact.

---

## Pre-flight Checklist (before starting Phase 1)

- [ ] Read `docs/planning/00-overview.md` in full.
- [ ] Understand the three hard invariants (immutable IDs, derived manifest, versioned schema).
- [ ] Confirm `git status` is clean on a new branch (e.g. `push-1-separation`).
- [ ] Verify `npm run build` passes in `treesite-app/` before touching anything.

---

## Phase 1 — Artifact Schema + Spec Files

**Goal:** Produce the JSON Schemas, a written spec, and a migration scaffold. No code changes to the handler or tools yet.

### Deliverables

1. `docs/artifact-spec.md` — human-readable spec for the artifact bundle format (mirrors the structure in `00-overview.md` but with full field tables, validation rules, and examples).

2. `schemas/artifact.schema.json` — JSON Schema for `artifact.json`:
   ```json
   {
     "$schema": "http://json-schema.org/draft-07/schema#",
     "title": "ArtifactMeta",
     "type": "object",
     "required": ["name", "schemaVersion", "displayName", "tagline", "defaultSchemeId"],
     "properties": {
       "name":            { "type": "string" },
       "schemaVersion":   { "type": "integer", "minimum": 1 },
       "displayName":     { "type": "string" },
       "tagline":         { "type": "string" },
       "defaultSchemeId": { "type": "string" }
     }
   }
   ```

3. `schemas/item.schema.json` — JSON Schema for a single item in `items/`:
   ```json
   {
     "$schema": "http://json-schema.org/draft-07/schema#",
     "title": "ContentItem",
     "type": "object",
     "required": ["id", "name", "slug", "section", "type"],
     "properties": {
       "id":   { "type": "string", "format": "uuid", "description": "Immutable UUID, never changes" },
       "name": { "type": "string" },
       "slug": { "type": "string" },
       "section": { "type": "string" },
       "type": { "type": "string", "enum": ["text","link","href","contact","pdf","website","htmlCard","section"] },
       "description": { "type": "string" },
       "value":  { "type": "number" },
       "hidden": { "type": "boolean" },
       "html":   { "type": "string" },
       "url":    { "type": "string" },
       "source": { "type": "string" },
       "pdf":    { "type": "string" },
       "previewImage": { "type": "string" },
       "image":  { "type": "string" },
       "embed":  { "type": "string" },
       "color":  { "type": "string" },
       "kicker": { "type": "string" },
       "template": { "type": "string" },
       "email":  { "type": "string" },
       "href":   { "type": "string" }
     },
     "additionalProperties": true
   }
   ```

4. `schemas/manifest.schema.json` — JSON Schema for `manifest.json` (the generated tree node, recursive). Must document that this file is **generated, not edited directly**.

5. `artifacts/example/` — skeleton directory with:
   - `artifact.json` (placeholder, `schemaVersion: 1`)
   - `items/` (empty, `.gitkeep`)
   - `assets/pdfs/.gitkeep`, `assets/html/.gitkeep`, `assets/previews/.gitkeep`
   - `schemes/` (empty `index.json`)
   - `migrations/` (empty, `.gitkeep`)

### Notes

- Keep `schemaVersion` at `1` for this entire push.
- The `migrations/` directory is scaffolded but empty; the first real migration script is only written when a breaking schema change occurs.
- `schemas/` lives at the repo root (not inside `handler/` or `editor/`), since all three components reference the same schemas.

### Check-in

After this phase: `schemas/` exists with three JSON Schema files, `docs/artifact-spec.md` exists, `artifacts/example/` skeleton exists. Commit: `feat(push1-p1): artifact schema + spec + example skeleton`.

---

## Phase 2 — Handler Runtime Loader

**Goal:** Replace the static `generatedContentItems` import in the handler with a runtime fetch of `manifest.json` + `artifact.json`. The handler becomes content-agnostic.

### Files to change

| File | Change |
|---|---|
| `treesite-app/src/siteData.js` | Delete (or gut to empty re-export placeholder; see below) |
| `treesite-app/src/contentItems.js` | Remove `minimalSiteRoot` brand data; keep `applyContentItems` (still used by Node tools) |
| `treesite-app/src/App.jsx` | Replace static `siteData` import with async artifact loading |
| `treesite-app/src/TreeSite.jsx` | Accept `siteData` prop as before; add `artifactBase` prop for asset/scheme URL resolution |
| `treesite-app/src/treemapColorScheme.js` | Replace hardcoded `COLOR_SCHEMES_BASE = "/color-schemes"` with `artifactBase + "/schemes"` |
| `treesite-app/src/tileTemplates.jsx` | Accept `artifactBase` context or prop; prepend to asset paths that are artifact-relative |
| `treesite-app/vite.config.js` | Expose `VITE_ARTIFACT_BASE` env var |

### Loading strategy

`App.jsx` should use a `useEffect` + `useState` pattern (or React Suspense + a resource loader) to:

1. Resolve the artifact base:
   - Check `?artifact=<url>` query param first.
   - Fall back to `import.meta.env.VITE_ARTIFACT_BASE`.
   - Fall back to `"/artifact"` (a local path, served by Vite from `public/artifact/` which symlinks or copies the example artifact during dev).

2. `fetch("{base}/artifact.json")` — parse, validate `schemaVersion` (refuse gracefully if unknown version), extract `displayName`, `tagline`, `defaultSchemeId`.

3. `fetch("{base}/manifest.json")` — parse, pass to `<TreeSite siteData={manifest} />`.

4. Pass `artifactBase` down to `TreeSite` and `tileTemplates`.

### Asset URL resolution

Today: `src="/assets/pdfs/foo.pdf"` — absolute, handler-hosted.  
After: `src="{artifactBase}/assets/pdfs/foo.pdf"` — prefixed at render time.

In `tileTemplates.jsx`, asset fields (`pdf`, `source`, `url`, `previewImage`, `image`, `embed`) that are artifact-relative (start with `assets/`) are prefixed with `artifactBase`. Fields that are absolute URLs (`https://...`) or absolute paths (`/` not `assets/`) are passed through unchanged.

**Heuristic:** an artifact-relative path does NOT start with `/` or `http`. The handler prepends `{artifactBase}/` to these. Legacy absolute paths (`/assets/...`) from the KnowAlgo export are rewritten to artifact-relative by the export tool in Phase 3.

### schemaVersion gating

```js
const SUPPORTED_SCHEMA_VERSIONS = [1];

if (!SUPPORTED_SCHEMA_VERSIONS.includes(meta.schemaVersion)) {
  // render a clear error UI: "This artifact uses schemaVersion N which is not supported..."
  return;
}
if (meta.schemaVersion < CURRENT_SCHEMA_VERSION) {
  // render a prompt: "This artifact needs migration. Run the migrate tool."
  return;
}
```

### Color scheme resolution

`treemapColorScheme.js` currently hardcodes `baseUrl = "/color-schemes"`. Change the default to accept an `artifactBase` parameter. `TreeSite.jsx` passes `{artifactBase}/schemes` as the base when calling `loadSchemeManifest`.

### `VITE_ARTIFACT_BASE` in dev

For local development:

- Place or symlink `artifacts/example/` at `treesite-app/public/artifact/`.
- Default `VITE_ARTIFACT_BASE=""` (empty) so relative paths under `/artifact/` work.
- Or set `VITE_ARTIFACT_BASE="http://localhost:5174/artifact"` explicitly.

Document in `handler/README.md` how to point at a different artifact in dev.

### Loading states

The handler must render appropriate loading/error states:
- While fetching: spinner or skeleton.
- Fetch error: "Could not load artifact from {base}."
- Schema version mismatch: "Artifact schema version N is not supported."

### Check-in

After this phase: `npm run dev` in `treesite-app/` loads from the example artifact skeleton (empty tree, no items — handler should show an empty but functional treemap). Commit: `feat(push1-p2): handler runtime artifact loader`.

---

## Phase 3 — KnowAlgo Export Tool

**Goal:** Package the current KnowAlgo content (all 46 items, `public/assets/**`, `public/color-schemes/**`) into a self-contained directory bundle that the handler can load.

### New file: `tools/node/export-artifact.js`

This script packages a legacy `treesite-app/` directory into an artifact bundle. It is a **one-time migration tool** for the KnowAlgo site; it also serves as the reference implementation for the general `export_dir` tool in Push 2.

**Input (CLI args):**
```
node export-artifact.js \
  --source ./treesite-app \
  --dest   ./artifacts/knowalgo \
  --name   knowalgo
```

**Steps the script performs:**

1. Read all JSON files from `{source}/content/items/*.json`.
2. **Back-fill immutable UUIDs:** for any item that lacks an `id` field, generate a UUID v4 and write it back to the source `content/items/<slug>.json` file. Log each back-fill. After this step, all source items have a frozen `id`.
3. Copy items to `{dest}/items/`, preserving all existing fields.
4. Write `{dest}/artifact.json`:
   ```json
   {
     "name": "knowalgo",
     "schemaVersion": 1,
     "displayName": "Knowledge Algorithms",
     "tagline": "Unify data. Evaluate models. Visualize results.",
     "defaultSchemeId": "brand-slate"
   }
   ```
   (Extract `displayName`/`tagline` from `minimalSiteRoot` in `contentItems.js`.)
5. Copy `{source}/public/assets/` → `{dest}/assets/`.
6. Copy `{source}/public/color-schemes/` → `{dest}/schemes/`.
7. Rewrite all asset paths in `{dest}/items/*.json` from absolute (`/assets/pdfs/foo.pdf`) to artifact-relative (`assets/pdfs/foo.pdf`). Strip the leading `/`.
8. Run `applyContentItems(rootMeta, items)` (using the existing `contentItems.js` merge logic) to generate the full hierarchy tree.
9. Write the tree to `{dest}/manifest.json`.
10. Create empty `{dest}/migrations/` directory.
11. Run a basic validation:
    - All items have `id`, `name`, `slug`, `section`, `type`.
    - All `id` values are unique.
    - Asset files referenced in items exist on disk under `{dest}/assets/`.
    - Log any missing assets as warnings (do not fail; some previews may be missing).
12. Print a summary: item count, asset count, any warnings.

**Output (stdout JSON):**
```json
{
  "ok": true,
  "artifactPath": "./artifacts/knowalgo",
  "itemCount": 46,
  "assetCount": 120,
  "warnings": []
}
```

### Verify parity

After exporting, point the handler at the KnowAlgo artifact and visually verify:
- All sections and cards appear.
- PDF tiles render with previews.
- htmlCard tiles load their bundled pages.
- Website tiles show preview images.
- Color scheme matches the current site.

This is a manual verification step (automated parity check deferred to Push 2 tooling).

### Check-in

After this phase: `artifacts/knowalgo/` (or external path) contains the full KnowAlgo bundle with frozen UUIDs and `manifest.json`. Source `content/items/*.json` files have `id` fields. Handler loads KnowAlgo artifact without regressions. Commit: `feat(push1-p3): knowalgo export + uuid backfill`.

---

## Phase 4 — Generic Example Artifact

**Goal:** Populate `artifacts/example/` with a small but complete generic artifact that demonstrates the treesite structure without any KnowAlgo branding. This becomes the default artifact for the handler.

### Content design

The example artifact should:
- Have 2–3 top-level sections (e.g. "About This Site", "Content Types", "Navigation").
- Include one card of each supported type: `text`, `section`, `website` (using a public URL), and at least one card that demonstrates nested sections.
- Have no brand names, real PDFs, or personal information.
- Be self-contained: no assets required beyond what can be provided as a placeholder or public URL.
- Have clear, instructional content that explains what treesite is and how it works.

### Files to create

`artifacts/example/artifact.json`:
```json
{
  "name": "example",
  "schemaVersion": 1,
  "displayName": "TreeSite Example",
  "tagline": "An interactive treemap site. Tap any tile to explore.",
  "defaultSchemeId": "content-default"
}
```

`artifacts/example/items/` — one JSON file per item, each with a frozen UUID. Suggested items:

| slug | type | section | name |
|---|---|---|---|
| `sec-about` | section | Home | About This Site |
| `sec-content-types` | section | Home | Content Types |
| `sec-navigation` | section | Home | Navigation |
| `what-is-treesite` | text | About This Site | What Is TreeSite? |
| `how-it-works` | text | About This Site | How It Works |
| `text-card-example` | text | Content Types | Text Card |
| `website-card-example` | website | Content Types | Website Card |
| `section-card-example` | section | Content Types | Nested Section |
| `nested-item` | text | Content Types/Nested Section | Nested Item |
| `tap-to-zoom` | text | Navigation | Tap to Zoom |
| `breadcrumbs` | text | Navigation | Breadcrumbs |
| `minimap` | text | Navigation | Mini Map |

`artifacts/example/schemes/index.json`:
```json
{
  "schemes": [
    { "id": "content-default", "label": "Default", "file": "content-default.json" }
  ],
  "defaultSchemeId": "content-default"
}
```

`artifacts/example/schemes/content-default.json` — copy from `treesite-app/public/color-schemes/content-default.json`.

`artifacts/example/manifest.json` — generated by running the rebuild-manifest logic over the example items (the agent can use the existing `applyContentItems` function from `contentItems.js` to generate this, or run a small Node script).

### Check-in

After this phase: `artifacts/example/` is a complete, loadable artifact. The handler dev server loads it by default and shows a functional treesite with the example content. Commit: `feat(push1-p4): generic example artifact`.

---

## Phase 5 — Artifact Selection, Reload Wiring, Repo Reorg, Docs

**Goal:** Wire up runtime artifact switching, rename `treesite-app/` to `handler/`, and write updated docs.

### Artifact selection

The handler supports three ways to select an artifact (in priority order):

1. `?artifact=<url>` query parameter — reload the page with a new base URL.
2. `VITE_ARTIFACT_BASE` environment variable — set at build or dev time.
3. Default: `/artifact` served from the handler's own `public/artifact/` (which should contain or symlink `artifacts/example/`).

Add a small **artifact switcher** (development-mode only, hidden in production) — a text input in the UI that lets you type an artifact base URL and reload. This is useful for quickly switching between the example and KnowAlgo artifacts during development without restarting the server.

The switcher should be visible only when `import.meta.env.DEV` is true.

### Repo reorg

Rename `treesite-app/` → `handler/` in the git repository:
```
git mv treesite-app handler
```

Update any references to `treesite-app` in:
- Root `README.md`
- `docs/SCAFFOLD_MIGRATION_PLAN.md`
- Any scripts that reference the old path

Move existing Node scripts:
```
treesite-app/scripts/ → tools/node/
```
These scripts are not yet refactored to the new contract (that is Push 2's job); they are only moved in this phase. Update `handler/package.json` npm script paths to point to `../../tools/node/` instead of `./scripts/`.

### npm script: `npm run serve:artifact`

Add a convenience script to `handler/package.json` that serves an artifact directory over HTTP for local development:
```json
"serve:artifact": "node ../../tools/node/serve-artifact.js"
```

`tools/node/serve-artifact.js` is a minimal static file server (using Node's built-in `http` or the `serve` package) that accepts `--dir <path>` and `--port <n>` and serves the artifact with correct CORS headers for the Vite dev server.

### Documentation

Update or create:

- `handler/README.md` — how to run the handler, configure `VITE_ARTIFACT_BASE`, develop with the example artifact, point at an external artifact.
- `tools/node/README.md` — placeholder for the tool contract doc (detailed in Push 2).
- Root `README.md` — update overview section to describe the new monorepo structure.

### Check-in

After this phase: `handler/` runs cleanly as the renamed app, `tools/node/` contains the moved scripts, `artifacts/example/` is the default, artifact switching works in dev. Commit: `feat(push1-p5): repo reorg + artifact switcher + docs`.

---

## Smoke Test

Follow these steps manually after completing all five phases.

### Setup

```bash
cd handler
npm install
npm run dev
# Open http://localhost:5174 (or whatever Vite port)
```

### Steps

1. **Example artifact loads by default**
   - [ ] The treemap renders with the example artifact content (sections: About This Site, Content Types, Navigation).
   - [ ] Title / tagline shows "TreeSite Example" / "An interactive treemap site."
   - [ ] No console errors related to content loading.

2. **Navigation works**
   - [ ] Click a section tile to zoom in. Confirm breadcrumb updates.
   - [ ] Click back / breadcrumb to return to Home.
   - [ ] Minimap shows the full tree (squarified layout, not slice).
   - [ ] Mobile layout (resize browser to < 700px): slice/stack layout renders.

3. **Content types render**
   - [ ] Text card tiles display title + description.
   - [ ] Website card tile shows (no preview image needed for example; graceful fallback expected).

4. **Artifact switcher (dev mode)**
   - [ ] Artifact switcher input is visible.
   - [ ] Type the path to `artifacts/knowalgo` (or `http://localhost:<port>` if served) and reload.

5. **KnowAlgo artifact loads**
   - [ ] Treemap renders with KnowAlgo sections (About KnowAlgo, Services, Articles, Projects, Contact Me).
   - [ ] PDF tiles render with preview images.
   - [ ] htmlCard tiles load their bundled pages in the iframe viewer.
   - [ ] Color scheme (brand-slate) applies correctly.
   - [ ] Minimap works.
   - [ ] Mobile stack layout works.
   - [ ] No console errors from asset path resolution.

6. **Switch back to example**
   - [ ] Clear the artifact switcher or reload without `?artifact=` param.
   - [ ] Example artifact loads again cleanly.

7. **Schema version guard**
   - [ ] Temporarily edit `artifacts/example/artifact.json`, set `schemaVersion: 99`.
   - [ ] Reload the handler.
   - [ ] Confirm the handler shows a clear "unsupported schema version" error (not a blank screen or JS crash).
   - [ ] Revert `artifact.json`.

### Pass criteria

All checkboxes above pass with no console errors and no visual regressions versus the current `treesite-app/` behavior.

---

## Course-Correction Report Template

Fill in after completing the push and return to planning mode before starting Push 2.

```markdown
## Course-Correction Report: Push 1 — Separation + Portable Artifact + Example

**Date completed:**  
**Executing agent conversation ID:**

### What was built (vs. plan)
- [ ] Phase 1: Artifact schema + spec files
- [ ] Phase 2: Handler runtime loader
- [ ] Phase 3: KnowAlgo export tool + UUID backfill
- [ ] Phase 4: Generic example artifact
- [ ] Phase 5: Repo reorg + artifact switcher + docs

### Deviations from plan

### Smoke test results

### Hard invariants check
- [ ] All 46 legacy KnowAlgo items have frozen UUIDs in source JSON
- [ ] manifest.json in KnowAlgo and example bundles was generated, not hand-edited
- [ ] schemaVersion: 1 in both artifact.json files; handler refuses schemaVersion 99

### Issues / blockers encountered

### Recommendations for Push 2
```

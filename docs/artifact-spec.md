# TreeSite content artifact bundle

Self-contained directory bundles are the portable content format for TreeSite (Pushes 1–3). The handler loads an artifact at runtime; the editor and Node tools read and write the same layout.

## Directory layout

```
<artifact-root>/
  artifact.json       ← metadata (required, hand-edited)
  manifest.json       ← generated tree (never hand-edited)
  items/              ← source of truth: one JSON file per card/section
  assets/
    pdfs/
    html/
    previews/
    images/
  schemes/
    index.json
    *.json              ← color scheme documents
  migrations/           ← vN_to_vN+1 upgraders (empty until schema bumps)
```

## Hard invariants

1. **Immutable `id`** — Every item has a UUID v4 `id` assigned once and never changed. Tools target nodes by `id`, not slug.
2. **`manifest.json` is derived** — Regenerated from `items/` via `rebuild_manifest`. Never edit directly.
3. **Versioned schema** — `artifact.json` includes `schemaVersion`. The handler refuses unknown future versions and prompts migration when the version is below the current supported version.

## `artifact.json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Short artifact identifier (e.g. `example`, `knowalgo`). |
| `schemaVersion` | integer ≥ 1 | yes | Artifact schema version; current version is `1`. |
| `displayName` | string | yes | Site title shown in the handler UI. |
| `tagline` | string | yes | Subtitle / description for the home focus strip. |
| `defaultSchemeId` | string | yes | Must match an `id` in `schemes/index.json`. |

Example:

```json
{
  "name": "example",
  "schemaVersion": 1,
  "displayName": "TreeSite Example",
  "tagline": "An interactive treemap site. Tap any tile to explore.",
  "defaultSchemeId": "content-default"
}
```

JSON Schema: `schemas/artifact.schema.json`.

## Item files (`items/<slug>.json`)

One file per card or section. Filename should match `slug`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID string | yes | Permanent identifier. |
| `name` | string | yes | Display name. |
| `slug` | string | yes | Human-readable key; may change via rename tools. |
| `section` | string | yes | Section path (e.g. `Home`, `About/Services`). |
| `type` | string | yes | One of: `text`, `link`, `href`, `contact`, `pdf`, `website`, `htmlCard`, `section`. |
| `description` | string | no | Tile body text. |
| `value` | number | no | Treemap weight (default applied at build time if omitted). |
| `hidden` | boolean | no | Exclude from site when true. |
| `pdf`, `source`, `url`, `previewImage`, `image`, `embed`, `html`, … | string | no | Type-specific payload; see handler tile templates. |

JSON Schema: `schemas/item.schema.json` (`additionalProperties: true` for forward-compatible fields).

## Asset paths

Paths in item JSON are **artifact-relative** (no leading slash), e.g. `assets/pdfs/report.pdf`, `assets/previews/report.png`.

The handler resolves them as `{artifactBase}/{path}`. Absolute URLs (`https://…`) and legacy absolute paths (`/…`) are passed through unchanged; exports should rewrite legacy `/assets/…` paths to artifact-relative form.

## `manifest.json`

- Output of merging flat `items/` into a hierarchy (same logic as the handler’s former build-time `applyContentItems` step).
- **Generated only.** After any change under `items/`, run `rebuild_manifest`.
- Root node uses `name: "Home"`, with optional `displayName` / `description` supplied from `artifact.json` at load time.

JSON Schema: `schemas/manifest.schema.json`.

## Color schemes (`schemes/`)

`schemes/index.json` mirrors the former `public/color-schemes/index.json`:

```json
{
  "schemes": [
    { "id": "content-default", "label": "Default", "file": "content-default.json" }
  ],
  "defaultSchemeId": "content-default"
}
```

Each scheme file is validated by the handler’s existing treemap color-scheme loader. The handler fetches schemes from `{artifactBase}/schemes/`.

## `migrations/`

Named upgraders (`v1_to_v2.js`, etc.) run in sequence when `artifact.json` `schemaVersion` is below the tooling current version. Empty in schema version 1.

## Validation rules (summary)

- All items: required fields present; `type` in allowed enum; unique `id` across items.
- `artifact.json`: required fields; `schemaVersion` known to handler.
- Asset references: warn if files missing under `assets/` (non-fatal for optional previews).
- Manifest drift: expected manifest from `items/` must equal on-disk `manifest.json`.

## Handler loading

1. Resolve artifact base URL: `?artifact=` query param → `VITE_ARTIFACT_BASE` → default `/artifact`.
2. `GET {base}/artifact.json` — validate `schemaVersion`.
3. `GET {base}/manifest.json` — render treemap.
4. Assets and schemes loaded relative to the same base.

## Example bundle

The repo ships `artifacts/example/` as the default generic artifact (no site-specific branding).

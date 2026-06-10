# Push 2: Stable Editor Tool Contract (JSON-in/out over Node)

**Depends on:** Push 1 complete — `handler/` loads artifacts at runtime, `artifacts/example/` exists, `tools/node/` contains moved scripts, all KnowAlgo items have frozen UUIDs.  
**Artifact format this push:** directory bundles only  
**Commits:** one per phase, never push to main  
**Goal:** Every Node editing script is wrapped behind a stable, machine-callable contract. Read-only inspection tools are built first. All mutation tools are ID-addressed and preserve `id`. Lifecycle tools (validate, rebuild, migrate) are implemented and tested.

---

## Context: Current State of Node Scripts

After Push 1, `tools/node/` contains the scripts moved from `treesite-app/scripts/`. They currently:
- Accept CLI flags in various formats (no single convention).
- Assume a fixed working directory (`content/items/`, `src/generatedContentItems.js`).
- Output a mix of human-readable logs and sometimes JSON.
- Have no machine-readable structured error format.
- Do not reference items by `id` (they use slug or name).

After this push, every script follows the same contract, and new inspection scripts are added.

---

## The Tool Contract

Every tool in `tools/node/` must conform to this contract. This contract is the stable interface that Push 3 (Python SDK), Push 4 (API), and Push 5 (MCP) adapt over without modification.

### Invocation

```
node tools/node/<tool-name>.js --artifact <path> [--input <json-string>]
```

Or with stdin:
```
echo '{"id":"...","name":"..."}' | node tools/node/<tool-name>.js --artifact <path>
```

### Input

A JSON object passed as `--input '<json>'` CLI argument or via stdin. Each tool defines its own input schema (documented in `tools/node/schemas/`).

### Output

Always a JSON object on stdout. Never mix human-readable text and JSON on stdout; logging goes to stderr.

Success:
```json
{
  "ok": true,
  "data": { ... }
}
```

Error:
```json
{
  "ok": false,
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "No item with id '550e8400-...' found in artifact.",
    "details": {}
  }
}
```

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Input validation error (bad arguments, schema violation) |
| 2 | Artifact error (path not found, malformed artifact) |
| 3 | Operation error (item not found, constraint violation) |
| 4 | Filesystem error |

### Artifact path

Every tool receives `--artifact <path>` pointing to the artifact root directory. It reads/writes `items/` and `manifest.json` within that path. **No hidden global state; no assumption about working directory.**

### ID addressing

Mutation tools target nodes by `id` (immutable UUID), not by `slug` or `name`. Input schemas for mutations require `id` as the primary key for the target node.

### Manifest auto-rebuild

Any tool that writes to `items/` **must** call `rebuild_manifest` internally before returning. The returned `data` includes a `manifestRebuilt: true` field so callers know the manifest is current.

### Shared plumbing module

`tools/node/tool-runner.js` — a shared module that all tools import. Provides:
- `parseArgs()` — parse `--artifact`, `--input`; read stdin if no `--input`.
- `loadArtifact(path)` — read and validate `artifact.json`; check `schemaVersion`.
- `loadItems(artifactPath)` — read all `items/*.json`, validate each against `item.schema.json`.
- `writeItem(artifactPath, item)` — write one item; assign UUID if missing.
- `deleteItem(artifactPath, slug)` — delete item file.
- `rebuildManifest(artifactPath)` — run `applyContentItems` over loaded items, write `manifest.json`.
- `success(data)` — print `{"ok":true,"data":...}` and exit 0.
- `fail(code, errorCode, message, details)` — print `{"ok":false,"error":...}` to stdout, log to stderr, and exit with code.
- `validateItemSchema(item)` — validate against `schemas/item.schema.json`.

---

## Phase 1 — Tool Contract Definition

**Goal:** Define the full operation catalog, write input/output JSON Schemas for every tool, write the structured error code registry, and write the `tool-runner.js` shared plumbing. No mutation logic yet.

### Deliverables

1. `tools/node/schemas/` — one input/output JSON Schema pair per tool. File naming: `<tool-name>.input.schema.json` and `<tool-name>.output.schema.json`. Schemas for all tools in the operation catalog (see `00-overview.md`).

2. `tools/node/error-codes.js` — an exported object enumerating all structured error codes:
   ```js
   export const ErrorCodes = {
     ITEM_NOT_FOUND:         "ITEM_NOT_FOUND",
     DUPLICATE_ID:           "DUPLICATE_ID",
     INVALID_INPUT:          "INVALID_INPUT",
     ARTIFACT_NOT_FOUND:     "ARTIFACT_NOT_FOUND",
     ARTIFACT_MALFORMED:     "ARTIFACT_MALFORMED",
     SCHEMA_VERSION_UNKNOWN: "SCHEMA_VERSION_UNKNOWN",
     MANIFEST_DRIFT:         "MANIFEST_DRIFT",
     ASSET_NOT_FOUND:        "ASSET_NOT_FOUND",
     MIGRATION_FAILED:       "MIGRATION_FAILED",
     FILESYSTEM_ERROR:       "FILESYSTEM_ERROR",
   };
   ```

3. `tools/node/tool-runner.js` — the shared plumbing module (described above). Import it in every tool.

4. `tools/node/README.md` — tool contract documentation: invocation, input/output format, exit codes, error codes, ID addressing, manifest auto-rebuild rule, one example for each catalog operation.

### Check-in

`tools/node/schemas/` contains all schema files. `tool-runner.js` is importable and its unit functions are testable. No existing scripts have been modified yet. Commit: `feat(push2-p1): tool contract definition + shared plumbing`.

---

## Phase 2 — Read-only Inspection Tools

**Goal:** Implement all read-only inspection tools. These are built first because future agents, the Python SDK, and the API lean on them more than on mutations.

### Tools to implement (new files in `tools/node/`)

#### `get-node.js`

Input: `{ "id": "<uuid>" }`  
Output: `{ "ok": true, "data": { "item": { ...full item fields... } } }`  
Logic: Load items, find by `id`, return. Error `ITEM_NOT_FOUND` if not found.

#### `get-children.js`

Input: `{ "id": "<uuid>" }` (or `{ "id": null }` for root)  
Output: `{ "ok": true, "data": { "children": [ ...items... ] } }`  
Logic: Load manifest (not items), traverse to the node matching `id`, return its immediate children from the hierarchy. If `id` is null or omitted, return the root's children.

Note: this uses `manifest.json` for tree traversal (efficient, hierarchy already computed). `get_node` uses `items/` (authoritative flat data).

#### `search.js`

Input: `{ "query": "string", "fields": ["name","description","html","slug"], "limit": 20 }`  
Output: `{ "ok": true, "data": { "results": [ { "id": "...", "name": "...", "slug": "...", "matchedField": "...", "excerpt": "..." } ] } }`  
Logic: Load all items. For each item, check each specified field for the query string (case-insensitive substring match). Return up to `limit` results with a short excerpt of the matched text.

#### `inspect-subtree.js`

Input: `{ "id": "<uuid>", "maxDepth": 3 }`  
Output: `{ "ok": true, "data": { "subtree": { ...recursive node... } } }`  
Logic: Load manifest, find node matching `id`, return the subtree rooted there (up to `maxDepth` levels).

#### `artifact-stats.js`

Input: `{}` (no required fields)  
Output:
```json
{
  "ok": true,
  "data": {
    "schemaVersion": 1,
    "itemCount": 46,
    "sectionCount": 8,
    "leafCount": 38,
    "typeBreakdown": { "text": 12, "pdf": 4, "website": 6, "htmlCard": 5, "contact": 3, "section": 8, "link": 6, "href": 2 },
    "assetCounts": { "pdfs": 4, "html": 5, "previews": 15, "images": 2 },
    "assetTotalBytes": 12345678,
    "hiddenCount": 2
  }
}
```

#### `get-manifest.js`

Input: `{}`  
Output: `{ "ok": true, "data": { "manifest": { ...full tree... } } }`  
Logic: Read and return `manifest.json` as-is.

#### `inspect-tree.js` (refactor existing)

Refactor the existing `inspect-tree.js` to conform to the tool contract (accept `--artifact`, output JSON). The human-readable tree print goes to stderr; the `data` in the JSON output is a compact representation (array of `{ depth, id, slug, name, type }` lines). Preserve existing human-readable behavior when called with `--human` flag.

### Check-in

All seven read-only tools pass basic manual tests on `artifacts/example/`. Commit: `feat(push2-p2): read-only inspection tools`.

---

## Phase 3 — Mutation Tools (Refactor Existing Scripts)

**Goal:** Refactor all existing Node mutation scripts to the tool contract. Preserve behavior; only change the interface.

### Rules for refactoring each script

1. Add `--artifact <path>` as a required argument.
2. Accept input JSON via `--input` or stdin instead of per-field CLI flags (keep per-field flags as an alternative for backwards compatibility, but JSON-in is canonical).
3. Import `tool-runner.js` for shared plumbing.
4. Target the item by `id` (primary key). Accept `slug` as a fallback lookup for convenience, but resolve to `id` immediately and log a deprecation notice on stderr when `slug` is used.
5. Preserve the item's `id` field verbatim on any write.
6. Call `rebuildManifest()` before returning.
7. Output `{"ok":true,"data":{...}}` on stdout.
8. Use the structured error format on failure.

### Tools to refactor

| Script | Input `id` field? | Notes |
|---|---|---|
| `add-card.js` | No — assign new UUID | Generate UUID v4; output the new `id` in `data` |
| `edit-card.js` | Yes — target by `id` | Merge provided fields; `id` is read-only (reject if caller tries to change it) |
| `delete-card.js` | Yes | Confirm item exists; delete file; rebuild manifest |
| `rename-card.js` | Yes | Update `name` and `slug`; `id` unchanged |
| `move-card.js` | Yes | Update `section`; `id` unchanged |
| `hide-card.js` / `unhide-card.js` | Yes | Set `hidden: true/false`; `id` unchanged |
| `move-subtree.js` | Yes — section by `id` | Re-parent a section and all its children; IDs all unchanged |
| `add-pdf.js` | No — creates new | Assign UUID; copy asset; write item; rebuild |
| `add-website.js` | No — creates new | Assign UUID; Playwright screenshot; write item; rebuild |
| `add-html.js` | No — creates new | Assign UUID; copy bundle; write item; rebuild |

### Important: `edit-card.js` — protect `id`

The `edit-card.js` refactor must explicitly reject any attempt to change `id`:
```js
if (input.fields?.id && input.fields.id !== existingItem.id) {
  return fail(1, ErrorCodes.INVALID_INPUT, "Cannot change immutable field 'id'.");
}
```

### Check-in

All refactored scripts accept `--artifact` + JSON-in and produce JSON-out. Existing behavior preserved. `handler/package.json` npm scripts updated to pass `--artifact ./path/to/artifact` (the example artifact in dev). Commit: `feat(push2-p3): mutation tools refactored to contract`.

---

## Phase 4 — Lifecycle Tools

**Goal:** Implement `validate`, `rebuild_manifest`, and `migrate` tools.

### `validate.js`

Input: `{ "strict": false }`  
Output:
```json
{
  "ok": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": [
      { "code": "ASSET_NOT_FOUND", "itemId": "...", "field": "previewImage", "path": "assets/previews/foo.png" }
    ]
  }
}
```

Or if invalid:
```json
{
  "ok": false,
  "error": {
    "code": "MANIFEST_DRIFT",
    "message": "manifest.json does not match the output of rebuild_manifest on current items/.",
    "details": { "diffSummary": "3 items differ" }
  }
}
```

**Checks performed:**

1. All `items/*.json` validate against `schemas/item.schema.json`.
2. All items have `id` field (UUID format).
3. All `id` values are unique across the artifact (error if duplicate).
4. `artifact.json` validates against `schemas/artifact.schema.json`.
5. `artifact.json.schemaVersion` is a known version (warn if below current, error if unknown future).
6. Manifest drift check: run `applyContentItems` over items, compare hash/deep-equal to `manifest.json`. Error on drift.
7. Asset existence: for each item field that is artifact-relative (`assets/...`), check the file exists. Warn (not error by default; error in strict mode) if missing.
8. Check for any items missing `section` or with an invalid `section` path. Warn.

### `rebuild-manifest.js`

Input: `{}`  
Output: `{ "ok": true, "data": { "manifestRebuilt": true, "itemCount": 46 } }`  
Logic: Load items, run `applyContentItems`, write `manifest.json`. This is exactly what `tool-runner.rebuildManifest()` does, exposed as a standalone tool.

### `migrate.js`

Input: `{ "targetVersion": 1 }` (defaults to current known version if omitted)  
Output:
```json
{
  "ok": true,
  "data": {
    "fromVersion": 1,
    "toVersion": 1,
    "stepsRun": [],
    "manifestRebuilt": true
  }
}
```

Logic:
1. Read `artifact.json.schemaVersion`.
2. If already at target, return no-op.
3. If `migrations/v{N}_to_v{N+1}.js` exists for each step from current to target, run them in sequence.
4. Each migration script exports `async function migrate(artifactPath)` and modifies items in place.
5. After all migrations, increment `schemaVersion` in `artifact.json` and call `rebuildManifest`.
6. Error `MIGRATION_FAILED` on any step failure (with rollback notes for manual recovery).

For Push 2, no actual migration scripts exist (still on `schemaVersion: 1`). The `migrate` tool is implemented but runs zero steps when called on any v1 artifact.

### Check-in

`validate`, `rebuild-manifest`, and `migrate` all work on both example and KnowAlgo artifacts. `validate` catches manifest drift when an item is manually edited without rebuilding. Commit: `feat(push2-p4): lifecycle tools (validate, rebuild-manifest, migrate)`.

---

## Phase 5 — Conformance / Golden Tests

**Goal:** A test suite that verifies the tool contract invariants on the example artifact. Tests run via `npm test` in `tools/node/`.

### Test setup

Use Node's built-in test runner (`node:test`) or Jest — prefer the built-in runner to minimize dependencies.

Tests operate on a **copy** of `artifacts/example/` in a temp directory so the real artifact is never mutated.

### Test categories

#### Inspection tests (read-only, run against frozen fixture)

- `get_node` returns correct item for a known `id`.
- `get_node` returns `ITEM_NOT_FOUND` for an unknown `id`.
- `get_children` of root returns the expected section items.
- `get_children` of a section returns its leaf items.
- `search` returns results for a query that matches item names.
- `search` returns empty results for a query with no matches.
- `inspect_subtree` returns a correctly nested subtree.
- `artifact_stats` returns correct counts for the example artifact.
- `get_manifest` returns the same tree as `manifest.json`.

#### ID-preservation tests (mutation, run against temp copy)

- `add_card`: new item has a UUID `id` in the output.
- `rename_card`: `id` unchanged after rename; `slug` updated.
- `move_card`: `id` unchanged after move; `section` updated.
- `edit_card`: `id` unchanged after field edit.
- `delete_card`: item removed; `id` no longer appears in `get_manifest`.
- Attempt to change `id` via `edit_card`: returns `INVALID_INPUT`.

#### Manifest derivation tests

- After any mutation, `manifest.json` equals the output of `rebuild_manifest` (i.e., auto-rebuild happened).
- Manual edit of an item without running a tool: `validate` detects manifest drift.

#### Lifecycle tests

- `validate` passes on a fresh example artifact.
- `validate` fails with `DUPLICATE_ID` after manually duplicating an `id`.
- `validate` fails with `MANIFEST_DRIFT` after manually editing `manifest.json`.
- `rebuild_manifest` fixes a manually drifted manifest.
- `migrate` runs zero steps on a v1 artifact and exits successfully.

### Test runner script

Add to `tools/node/package.json` (if tools/node has its own package.json) or root:
```json
"test:tools": "node --test tools/node/tests/**/*.test.js"
```

### Check-in

All tests pass against the example artifact. Commit: `feat(push2-p5): conformance + golden tests for tool contract`.

---

## Smoke Test

Follow these steps manually after completing all five phases.

### Setup

```bash
# Terminal 1: serve example artifact
node tools/node/serve-artifact.js --dir artifacts/example --port 8001

# Terminal 2: run handler
cd handler && npm run dev
```

### Steps

1. **Inspection via CLI**
   ```bash
   node tools/node/artifact-stats.js --artifact artifacts/example
   # Expect: {"ok":true,"data":{"schemaVersion":1,"itemCount":12,...}}
   
   node tools/node/search.js --artifact artifacts/example --input '{"query":"treesite"}'
   # Expect: results matching items with "treesite" in name/description
   
   node tools/node/get-node.js --artifact artifacts/example \
     --input '{"id":"<id-of-what-is-treesite-item>"}'
   # Expect: full item data
   ```

2. **Add a card**
   ```bash
   node tools/node/add-card.js --artifact /tmp/example-copy \
     --input '{"name":"Smoke Test Card","section":"About This Site","type":"text","description":"Added by smoke test."}'
   # Expect: {"ok":true,"data":{"id":"<new-uuid>","manifestRebuilt":true,...}}
   ```

3. **Confirm `id` is unchanged after rename**
   ```bash
   # Note the id from the previous step
   node tools/node/rename-card.js --artifact /tmp/example-copy \
     --input '{"id":"<new-uuid>","name":"Smoke Test Card Renamed","slug":"smoke-test-card-renamed"}'
   # Expect: same id in output
   
   node tools/node/get-node.js --artifact /tmp/example-copy \
     --input '{"id":"<new-uuid>"}'
   # Expect: name is "Smoke Test Card Renamed", id unchanged
   ```

4. **Validate**
   ```bash
   node tools/node/validate.js --artifact /tmp/example-copy
   # Expect: {"ok":true,"data":{"valid":true,"errors":[],...}}
   ```

5. **Detect manifest drift**
   ```bash
   # Manually edit manifest.json in /tmp/example-copy (change any value)
   node tools/node/validate.js --artifact /tmp/example-copy
   # Expect: {"ok":false,"error":{"code":"MANIFEST_DRIFT",...}}
   
   # Rebuild
   node tools/node/rebuild-manifest.js --artifact /tmp/example-copy
   node tools/node/validate.js --artifact /tmp/example-copy
   # Expect: valid again
   ```

6. **Load modified artifact in handler**
   - Point the handler's artifact switcher at `/tmp/example-copy`.
   - [ ] Confirm "Smoke Test Card Renamed" appears in the treemap under "About This Site".

7. **Run test suite**
   ```bash
   npm run test:tools
   # All tests pass
   ```

### Pass criteria

All CLI steps produce `{"ok":true,...}` output. Test suite passes. Handler renders the modified artifact without errors.

---

## Course-Correction Report Template

```markdown
## Course-Correction Report: Push 2 — Stable Editor Tool Contract

**Date completed:**  
**Executing agent conversation ID:**

### What was built (vs. plan)
- [ ] Phase 1: Tool contract definition + shared plumbing
- [ ] Phase 2: Read-only inspection tools
- [ ] Phase 3: Mutation tools refactored
- [ ] Phase 4: Lifecycle tools
- [ ] Phase 5: Conformance / golden tests

### Deviations from plan

### Smoke test results

### Hard invariants check
- [ ] All mutation tools target by `id`; `id` is preserved in all writes
- [ ] manifest.json is always rebuilt after any items/ mutation
- [ ] validate detects both id-uniqueness violations and manifest drift
- [ ] No tool reads/writes without explicit --artifact path

### Issues / blockers encountered

### Recommendations for Push 3
```

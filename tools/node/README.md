# Node tools

Machine-callable editing and inspection tools for TreeSite **content artifact** directory bundles. Every tool shares the same JSON-in / JSON-out contract (Push 2+).

## Invocation

```bash
node tools/node/<tool-name>.js --artifact <path> [--input '<json>']
```

Or pipe JSON on stdin:

```bash
echo '{"id":"..."}' | node tools/node/get-node.js --artifact artifacts/example
```

Run from the **repository root** unless noted. Logging and human-readable output go to **stderr** only. **stdout** is always a single JSON object.

## Output

Success:

```json
{ "ok": true, "data": { } }
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "No item with id '…' found in artifact.",
    "details": {}
  }
}
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Input validation error |
| 2 | Artifact error (missing path, malformed bundle) |
| 3 | Operation error (item not found, constraint violation) |
| 4 | Filesystem error |

Structured error codes are defined in `error-codes.js`.

## Artifact path

`--artifact` must point at an artifact **root** containing `artifact.json`, `items/`, and `manifest.json`. Tools do not assume a fixed working directory.

## ID addressing

Mutations target nodes by immutable UUID **`id`**. Slug may be accepted as a deprecated fallback; new integrations should pass `id` only.

## Manifest auto-rebuild

Any tool that writes under `items/` calls `rebuildManifest` before returning. Successful mutation responses include `"manifestRebuilt": true` in `data`.

## Shared plumbing

`tool-runner.js` provides `parseToolArgs`, `loadArtifact`, `loadItems`, `writeItem`, `deleteItem`, `rebuildManifest`, `success`, `fail`, and `validateItemSchema`.

Input/output JSON Schemas live in `schemas/` (one pair per operation).

## Operation examples

All paths use the shipped example artifact.

```bash
# get_node
node tools/node/get-node.js --artifact artifacts/example \
  --input '{"id":"a1000001-0000-4000-8000-000000000011"}'

# get_children (root)
node tools/node/get-children.js --artifact artifacts/example --input '{}'

# search
node tools/node/search.js --artifact artifacts/example \
  --input '{"query":"treesite","limit":5}'

# inspect_subtree
node tools/node/inspect-subtree.js --artifact artifacts/example \
  --input '{"id":"a1000001-0000-4000-8000-000000000001","maxDepth":2}'

# artifact_stats
node tools/node/artifact-stats.js --artifact artifacts/example

# get_manifest
node tools/node/get-manifest.js --artifact artifacts/example

# inspect_tree (compact JSON on stdout; use --human for text tree on stderr)
node tools/node/inspect-tree.js --artifact artifacts/example

# add_card
node tools/node/add-card.js --artifact artifacts/example \
  --input '{"name":"New Card","section":"About This Site","type":"text"}'

# edit_card
node tools/node/edit-card.js --artifact artifacts/example \
  --input '{"id":"<uuid>","fields":{"description":"Updated."}}'

# delete_card
node tools/node/delete-card.js --artifact artifacts/example --input '{"id":"<uuid>"}'

# rename_card
node tools/node/rename-card.js --artifact artifacts/example \
  --input '{"id":"<uuid>","name":"Renamed","slug":"renamed-slug"}'

# move_card
node tools/node/move-card.js --artifact artifacts/example \
  --input '{"id":"<uuid>","section":"Content Types"}'

# hide_card / unhide_card
node tools/node/hide-card.js --artifact artifacts/example --input '{"id":"<uuid>"}'
node tools/node/unhide-card.js --artifact artifacts/example --input '{"id":"<uuid>"}'

# move_subtree
node tools/node/move-subtree.js --artifact artifacts/example \
  --input '{"id":"<uuid>","section":"Home"}'

# validate / rebuild_manifest / migrate
node tools/node/validate.js --artifact artifacts/example
node tools/node/rebuild-manifest.js --artifact artifacts/example
node tools/node/migrate.js --artifact artifacts/example
```

Legacy one-off export (not yet on the JSON contract):

```bash
node tools/node/export-artifact.js --source ./handler --dest ./artifacts/knowalgo --name knowalgo
```

## Local artifact server

```bash
cd handler
npm run serve:artifact -- --dir ../artifacts/example --port 8001
```

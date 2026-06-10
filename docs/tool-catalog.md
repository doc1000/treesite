# TreeSite tool catalog

Operations are implemented once in **Node** (`tools/node/*.js`). **SDK**, **HTTP API**, and **MCP** are thin adapters over that contract.

Schemas live in `tools/node/schemas/<tool>.input.schema.json` and `.output.schema.json`.

| Layer | Location |
|-------|----------|
| Node | `tools/node/<kebab-tool>.js` |
| SDK | `treesite_editor.tools.<snake_name>` |
| API | `editor/treesite_editor/api/routers/` |
| MCP | `python -m treesite_editor.mcp.server` (same names as SDK, plus `set_artifact`, `list_tools`) |

## Inspection (read-only)

| MCP / SDK name | Node tool | Description |
|----------------|-----------|-------------|
| `get_node` | `get-node` | Full item JSON by immutable `id` |
| `get_children` | `get-children` | Direct children of `id` (or root if omitted) |
| `search` | `search` | Full-text search (`query`, optional `fields`, `limit`) |
| `inspect_subtree` | `inspect-subtree` | Nested subtree from `id` |
| `artifact_stats` | `artifact-stats` | Counts, schema version, types |
| `get_manifest` | `get-manifest` | Generated `manifest.json` tree |
| `inspect_tree` | `inspect-tree` | Human-readable tree lines |

**API:** `GET /artifacts/{name}/nodes/{id}`, `/search`, `/children`, `/subtree`, `/stats`, `/manifest`.

## Mutations (target by `id`)

| MCP / SDK name | Node tool | Notes |
|----------------|-----------|--------|
| `add_card` | `add-card` | Server assigns UUID `id` |
| `edit_card` | `edit-card` | `id` immutable; MCP strips `id` from `fields` |
| `delete_card` | `delete-card` | |
| `rename_card` | `rename-card` | Updates `name` + `slug` only |
| `move_card` | `move-card` | Changes `section` |
| `hide_card` | `hide-card` | |
| `unhide_card` | `unhide-card` | |
| `move_subtree` | `move-subtree` | Reparent section subtree |

**API:** `POST/PATCH/DELETE` under `/artifacts/{name}/nodes`.

Additional Node-only intakes (SDK/API as implemented): `add-pdf`, `add-website`, `add-html`.

## Lifecycle

| MCP / SDK name | Node tool | Description |
|----------------|-----------|-------------|
| `validate_artifact` | `validate` | Schema, unique ids, manifest drift |
| `rebuild_manifest` | `rebuild-manifest` | Regenerate manifest from `items/` |
| `migrate_artifact` | `migrate` | Run `migrations/` chain |
| `export_artifact_zip` | `export-zip` | Write zip (`destZip`) |
| `import_artifact_zip` | `import-zip` | Extract to directory (`srcZip`, `destDir`) |

**API:** `POST /artifacts/{name}/validate`, `/rebuild`, `/migrate`, `GET .../export`, `POST /artifacts/import`.

Directory lifecycle (no MCP alias in Push 5): `export-dir`, `import-dir`.

## MCP session

| Tool | Description |
|------|-------------|
| `set_artifact` | Set active artifact directory (`artifactPath`); validates on load |
| `list_tools` | JSON list of tool names, descriptions, categories |

## Response shape (SDK adapters)

Successful tool calls return `{"ok": true, "data": ...}`. Failures return `{"ok": false, "error": {"code", "message"}}` without raising through MCP.

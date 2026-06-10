# TreeSite Editor (Python SDK)

Python orchestration for TreeSite content artifacts. Every edit operation delegates to the Node tools in `tools/node/` via subprocess; this package adds typed Pydantic models, a deterministic LangGraph edit session, and a local handler preview server.

## Installation

From the repository root:

```bash
pip install -e "editor/[dev]"
```

Requires Python 3.11+ and Node.js on your `PATH`.

## Configuration

Environment variables (prefix `TREESITE_`) or an `.env` file in the repo root:

| Variable | Default | Meaning |
|----------|---------|---------|
| `TREESITE_NODE_BIN` | `node` | Node executable |
| `TREESITE_TOOLS_DIR` | `tools/node` | Node tools directory (relative to repo root) |
| `TREESITE_DEFAULT_ARTIFACT` | `artifacts/example` | Default artifact path |
| `TREESITE_LOG_LEVEL` | `INFO` | Structured log level |

## Quick start — inspect

```bash
python editor/examples/inspect_artifact.py
```

```python
from treesite_editor import tools

stats = tools.artifact_stats("artifacts/example")
print(stats.item_count)
```

## Quick start — edit session

```bash
python editor/examples/basic_edit.py --no-preview   # skip browser preview
```

```python
from treesite_editor import EditSession

session = EditSession("artifacts/example")
session.load()
session.queue_operation("add_card", name="Demo", section="Home", type="text")
result = session.run(preview=False)
print(result.status, result.manifest_rebuilt)
```

Build the handler once before using `preview=True`:

```bash
cd handler && npm install && npm run build
```

## LangGraph session flow

Deterministic graph (no LLM): `load_artifact` → `apply_operation`* → `validate_artifact` → `rebuild_manifest` → optional `start_preview` → `done`.

Checkpoint IDs are LangGraph `thread_id` values (`<artifact-path>::<timestamp>`), stored in `editor/sessions.db`.

## Tests

```bash
python -m pytest editor/tests -v
# or from repo root:
npm run test:all
```

## Public API

- `treesite_editor.tools` — one function per Node tool (typed returns)
- `treesite_editor.EditSession` — queued operations + `run()`
- `treesite_editor.ArtifactPreviewServer` — static (default) or `mode="dev"` Vite preview

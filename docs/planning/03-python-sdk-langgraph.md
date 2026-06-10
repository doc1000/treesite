# Push 3: Python SDK + LangGraph (Manual Editor / Viewer Workflow)

**Depends on:** Push 2 complete — all Node tools conform to the JSON-in/out contract, inspection tools exist, ID addressing is enforced, `validate`/`rebuild_manifest`/`migrate` work.  
**Artifact format this push:** directory bundles only  
**Commits:** one per phase, never push to main  
**Goal:** A Python package (`treesite_editor`) that wraps every Node tool via subprocess, exposes Pydantic models for all data structures, orchestrates the edit-session workflow through a deterministic LangGraph graph, and provides a local handler preview server. The result is a fully usable manual editor/viewer workflow in Python without an LLM.

---

## Context

The Node tools from Push 2 are the execution primitives. Python is the orchestration and user-facing layer. The Python package must never re-implement content editing logic; every operation delegates to a Node tool via subprocess.

The LangGraph graph in this push is deterministic: no LLM nodes. All edges are condition-based (tool succeeded? validation passed? manifest built?). LLM nodes are a later opt-in.

---

## Pre-flight Checklist

- [ ] All Push 2 tools pass their test suite.
- [ ] `node tools/node/validate.js --artifact artifacts/example` returns `{"ok":true,...}`.
- [ ] Python 3.11+ available.
- [ ] `git status` clean on a new branch (e.g. `push-3-python-sdk`).

---

## Phase 1 — Python Package Scaffold + Subprocess Tool Wrappers

**Goal:** Establish the `editor/` Python package structure, project tooling, logging/config, structured error model, and one Python callable per Node tool via subprocess. Implement inspection callables first.

### Package structure

```
editor/
  pyproject.toml
  README.md
  treesite_editor/
    __init__.py           ← public API re-exports
    config.py             ← settings (artifact path defaults, node path, log level)
    logging_config.py     ← structured JSON logging (structlog or standard logging)
    errors.py             ← Python error hierarchy mirroring Node error codes
    runner.py             ← low-level subprocess executor (calls Node tools)
    tools.py              ← one Python function per Node tool
    models.py             ← Pydantic models (Phase 2)
    graph.py              ← LangGraph graph (Phase 3)
    preview.py            ← local handler server (Phase 4)
  tests/
    test_tools.py
    test_models.py
    test_graph.py
  examples/
    basic_edit.py
    inspect_artifact.py
```

### `pyproject.toml`

Use `hatch` or `setuptools` as the build backend. Dependencies:
- `langchain-core` (for tool abstractions)
- `langgraph`
- `pydantic >= 2`
- `structlog` (structured logging)
- `pytest` (dev dependency)

### `config.py`

```python
from pydantic_settings import BaseSettings

class TreeSiteConfig(BaseSettings):
    node_bin: str = "node"                  # path to node executable
    tools_dir: str = "tools/node"           # relative to repo root
    default_artifact: str = "artifacts/example"
    log_level: str = "INFO"
    
    class Config:
        env_prefix = "TREESITE_"
        env_file = ".env"
```

Configuration is read from environment variables prefixed `TREESITE_` or from `.env`. No hardcoded paths.

### `errors.py`

Python exception hierarchy corresponding to Node error codes:

```python
class TreeSiteError(Exception):
    code: str
    details: dict

class ItemNotFoundError(TreeSiteError):
    code = "ITEM_NOT_FOUND"

class DuplicateIdError(TreeSiteError):
    code = "DUPLICATE_ID"

class InvalidInputError(TreeSiteError):
    code = "INVALID_INPUT"

class ArtifactNotFoundError(TreeSiteError):
    code = "ARTIFACT_NOT_FOUND"

class ArtifactMalformedError(TreeSiteError):
    code = "ARTIFACT_MALFORMED"

class ManifestDriftError(TreeSiteError):
    code = "MANIFEST_DRIFT"

class MigrationFailedError(TreeSiteError):
    code = "MIGRATION_FAILED"
```

### `runner.py`

The single point of Node subprocess invocation:

```python
def run_tool(tool_name: str, artifact: str, input_data: dict | None = None) -> dict:
    """
    Runs tools/node/<tool-name>.js with --artifact and --input.
    Returns parsed JSON output dict.
    Raises the appropriate TreeSiteError subclass on ok:false.
    Logs the call (tool, artifact, elapsed_ms) at DEBUG level.
    """
```

- Invokes: `node {tools_dir}/{tool_name}.js --artifact {artifact} --input '{json}'`
- Captures stdout (JSON), stderr (logs forwarded to Python logger at DEBUG).
- Parses output; raises `TreeSiteError` subclass matching `error.code` if `ok: false`.
- Enforces a configurable timeout (default 30s).
- Logs structured: `tool_name`, `artifact`, `elapsed_ms`, `ok`.

### `tools.py` — inspection callables (Phase 1 scope)

Implement these first. Each function is a thin wrapper over `runner.run_tool`:

```python
def get_node(artifact: str, id: str) -> ContentItem: ...
def get_children(artifact: str, id: str | None = None) -> list[ContentItem]: ...
def search(artifact: str, query: str, fields: list[str] | None = None, limit: int = 20) -> list[SearchResult]: ...
def inspect_subtree(artifact: str, id: str, max_depth: int = 3) -> SubtreeNode: ...
def artifact_stats(artifact: str) -> ArtifactStats: ...
def get_manifest(artifact: str) -> dict: ...
def inspect_tree(artifact: str) -> list[TreeLine]: ...
```

Return types are Pydantic models (defined in Phase 2); in Phase 1 they can return raw dicts.

Also implement mutation and lifecycle wrappers in Phase 1 (they can return raw dicts too):
```python
def add_card(artifact, *, name, section, type, **fields) -> dict: ...
def edit_card(artifact, *, id, **fields) -> dict: ...
def delete_card(artifact, *, id) -> dict: ...
def rename_card(artifact, *, id, name, slug) -> dict: ...
def move_card(artifact, *, id, section) -> dict: ...
def hide_card(artifact, *, id) -> dict: ...
def unhide_card(artifact, *, id) -> dict: ...
def move_subtree(artifact, *, id, new_section) -> dict: ...
def validate(artifact, strict=False) -> dict: ...
def rebuild_manifest(artifact) -> dict: ...
def migrate(artifact, target_version=None) -> dict: ...
```

### Logging

Set up `structlog` in `logging_config.py`. Every tool call emits a structured log event:
```json
{"event": "tool_call", "tool": "get_node", "artifact": "artifacts/example", "elapsed_ms": 45, "ok": true}
```
Errors emit:
```json
{"event": "tool_error", "tool": "edit_card", "error_code": "ITEM_NOT_FOUND", "message": "..."}
```

### Check-in

`pip install -e editor/` works. `from treesite_editor.tools import get_node, search, artifact_stats` imports cleanly. `artifact_stats("artifacts/example")` returns a dict. Commit: `feat(push3-p1): python package scaffold + subprocess wrappers`.

---

## Phase 2 — Pydantic Models + Validation

**Goal:** Replace raw dict returns with typed Pydantic models throughout `tools.py`. Models mirror the JSON Schemas from `tools/node/schemas/`.

### Models to define in `models.py`

```python
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional, Literal

class ArtifactMeta(BaseModel):
    name: str
    schema_version: int = Field(alias="schemaVersion")
    display_name: str = Field(alias="displayName")
    tagline: str
    default_scheme_id: str = Field(alias="defaultSchemeId")

class ContentItem(BaseModel):
    id: UUID                        # immutable; never changed
    name: str
    slug: str
    section: str
    type: Literal["text","link","href","contact","pdf","website","htmlCard","section"]
    description: Optional[str] = None
    value: Optional[float] = None
    hidden: Optional[bool] = None
    html: Optional[str] = None
    url: Optional[str] = None
    source: Optional[str] = None
    pdf: Optional[str] = None
    preview_image: Optional[str] = Field(None, alias="previewImage")
    image: Optional[str] = None
    embed: Optional[str] = None
    color: Optional[str] = None
    kicker: Optional[str] = None
    template: Optional[str] = None
    email: Optional[str] = None
    href: Optional[str] = None

    model_config = {"populate_by_name": True}

class ManifestNode(BaseModel):
    id: UUID
    name: str
    slug: str
    type: str
    children: list["ManifestNode"] = []
    # ... other fields

class ArtifactStats(BaseModel):
    schema_version: int
    item_count: int
    section_count: int
    leaf_count: int
    type_breakdown: dict[str, int]
    asset_counts: dict[str, int]
    asset_total_bytes: int
    hidden_count: int

class SearchResult(BaseModel):
    id: UUID
    name: str
    slug: str
    matched_field: str
    excerpt: str

class TreeLine(BaseModel):
    depth: int
    id: UUID
    slug: str
    name: str
    type: str

class ValidationResult(BaseModel):
    valid: bool
    errors: list[dict]
    warnings: list[dict]

class ToolResult(BaseModel):
    ok: bool
    data: Optional[dict] = None
    error: Optional[dict] = None
```

### Key model rules

- `ContentItem.id` is typed as `UUID`. Any tool that returns an item parses the `id` field as `UUID`. Any tool that writes an item serializes it as a string. This enforces valid UUID format at the Python boundary.
- `ContentItem` must not allow the `id` field to be overwritten: any function that accepts `ContentItem` for update purposes strips `id` from the update payload before passing to the Node tool (the Node tool also rejects it, but defense-in-depth).

### Update `tools.py`

Add Pydantic parsing to all return values:
```python
def get_node(artifact: str, id: str) -> ContentItem:
    result = runner.run_tool("get-node", artifact, {"id": id})
    return ContentItem.model_validate(result["data"]["item"])
```

### Validation helper

Add a `validate_item(item: dict) -> ContentItem` helper that validates a dict against the `ContentItem` model before it reaches any tool, so schema violations are caught Python-side before spawning a subprocess.

### Check-in

`get_node("artifacts/example", "<id>")` returns a `ContentItem` instance with a `UUID` `id`. `search(...)` returns `list[SearchResult]`. Type errors from malformed artifacts surface as Pydantic `ValidationError`. Commit: `feat(push3-p2): pydantic models + typed tool returns`.

---

## Phase 3 — LangGraph Deterministic Edit-Session Graph

**Goal:** A LangGraph state graph representing a complete edit session: load artifact → run operations → validate → rebuild manifest → optional preview → checkpoint/save. No LLM nodes.

### State model

```python
from langgraph.graph import StateGraph
from pydantic import BaseModel
from typing import Annotated
import operator

class EditSessionState(BaseModel):
    artifact_path: str
    artifact_meta: ArtifactMeta | None = None
    operations: list[dict] = []               # log of operations applied
    last_validation: ValidationResult | None = None
    manifest_rebuilt: bool = False
    preview_url: str | None = None
    errors: Annotated[list[str], operator.add] = []
    status: str = "idle"                      # idle | loading | editing | validating | rebuilding | previewing | done | error
```

### Graph nodes

Define these as Python functions decorated with `@node`:

| Node | Description |
|---|---|
| `load_artifact` | Call `artifact_stats` + `get_manifest` to confirm artifact is loadable. Set `artifact_meta`. |
| `apply_operation` | Dispatch a single operation dict to the appropriate `tools.*` callable. Append to `operations` log. |
| `validate_artifact` | Call `validate(artifact_path)`. Set `last_validation`. If errors → go to `handle_error`. |
| `rebuild_manifest` | Call `rebuild_manifest(artifact_path)`. Set `manifest_rebuilt = True`. |
| `start_preview` | Call the preview server (Phase 4). Set `preview_url`. |
| `handle_error` | Log the error; set `status = "error"`. Terminal node. |
| `done` | Set `status = "done"`. Terminal node. |

### Graph edges (deterministic)

```
load_artifact
  → (success) → apply_operation (if operations queued)
  → (error) → handle_error

apply_operation
  → (success, more ops) → apply_operation
  → (success, no more ops) → validate_artifact
  → (error) → handle_error

validate_artifact
  → (valid) → rebuild_manifest
  → (invalid) → handle_error

rebuild_manifest
  → (with preview) → start_preview
  → (no preview) → done

start_preview
  → done
```

### Session API

The graph is exposed through a clean session interface in `graph.py`:

```python
class EditSession:
    def __init__(self, artifact_path: str, config: TreeSiteConfig | None = None): ...
    
    def load(self) -> ArtifactMeta: ...
    
    def queue_operation(self, operation: str, **kwargs) -> "EditSession":
        """
        Queue an operation for the next run.
        operations: add_card, edit_card, delete_card, rename_card, move_card, ...
        Returns self for chaining.
        """
    
    def run(self, preview: bool = False) -> EditSessionState:
        """Execute the graph synchronously. Returns final state."""
    
    def checkpoint(self) -> str:
        """Return a checkpoint ID (LangGraph built-in checkpointing)."""
    
    @classmethod
    def from_checkpoint(cls, checkpoint_id: str) -> "EditSession": ...
```

### Checkpointing

Use LangGraph's built-in `MemorySaver` for in-process sessions. For file-backed persistence across Python process restarts, use `SqliteSaver` from `langgraph-checkpoint-sqlite`.

```python
from langgraph.checkpoint.sqlite import SqliteSaver

checkpointer = SqliteSaver.from_conn_string("editor/sessions.db")
```

Sessions are identified by `thread_id` (artifact path + timestamp). The user can resume an interrupted session using the checkpoint ID.

### Example usage

```python
from treesite_editor.graph import EditSession

session = EditSession("artifacts/example")
session.load()
session.queue_operation("add_card", name="New Section", section="Home", type="section")
session.queue_operation("add_card", name="My Article", section="New Section", type="text",
                        description="An article I wrote.")
result = session.run(preview=True)

print(result.status)       # "done"
print(result.operations)   # list of applied operations with ids
print(result.preview_url)  # "http://localhost:8002"
```

### Logging + observability

Every graph node emits a structured log event at the start and end of execution:
```json
{"event": "node_enter", "node": "validate_artifact", "session_id": "...", "artifact": "..."}
{"event": "node_exit",  "node": "validate_artifact", "elapsed_ms": 120, "valid": true}
```

### Check-in

`EditSession` can run a multi-operation edit session end-to-end against a temp copy of `artifacts/example`. `result.status == "done"` and `result.manifest_rebuilt == True`. Commit: `feat(push3-p3): langgraph deterministic edit-session graph`.

---

## Phase 4 — Local Viewer / Preview Server

**Goal:** A callable that starts the handler (Vite dev server or a static file server) against a specific artifact, for manual visual review during an edit session.

### `preview.py`

```python
class ArtifactPreviewServer:
    def __init__(self, artifact_path: str, handler_dir: str, port: int = 8002): ...
    
    def start(self) -> str:
        """
        Start the handler dev server pointing at artifact_path.
        Returns the URL (http://localhost:{port}).
        """
    
    def stop(self): ...
    
    def __enter__(self) -> str: ...
    def __exit__(self, *args): ...
```

### Implementation strategy

Two options (agent should pick based on what is easier given Push 1's handler reorg):

**Option A: Vite dev server**
- Set env `VITE_ARTIFACT_BASE=http://localhost:{artifact_port}` and serve the artifact with `serve-artifact.js`.
- Run `npm run dev` in `handler/` as a subprocess.
- Wait for the dev server to be ready (poll `/artifact.json` endpoint).
- Return the handler URL.

**Option B: Serve pre-built static handler**
- Run `npm run build` in `handler/` once (or use cached build).
- Serve `handler/dist/` + the artifact dir with a single static server (e.g. `serve` or Python's `http.server`).
- Faster for repeated use; build step only needed when handler code changes.

Prefer **Option B** for the preview server (faster to spin up in a Python session, no Vite watch overhead). Provide **Option A** as `ArtifactPreviewServer(mode="dev")` for cases where live handler code changes are needed.

### Integration with `EditSession`

When `session.run(preview=True)`, `graph.py` calls `preview.py`'s `start()` after a successful run and sets `state.preview_url`. The server stays alive until `session.stop_preview()` or the Python process exits (use `atexit` to clean up).

### `serve:preview` npm script

Add to root or `handler/package.json`:
```json
"serve:preview": "node tools/node/serve-artifact.js --dir $ARTIFACT_DIR --port ${ARTIFACT_PORT:-8001}"
```

For use from CLI without Python.

### Check-in

`ArtifactPreviewServer("artifacts/example", "handler").start()` returns a URL; the handler loads at that URL showing the example artifact. `stop()` cleanly terminates the server. Commit: `feat(push3-p4): local artifact preview server`.

---

## Phase 5 — SDK Examples, Tests, Docs

**Goal:** Runnable example scripts, a pytest test suite, and updated documentation.

### Examples (`editor/examples/`)

#### `inspect_artifact.py`

Demonstrates inspection workflow:
```python
from treesite_editor.tools import artifact_stats, search, get_node, inspect_subtree

stats = artifact_stats("artifacts/example")
print(f"Items: {stats.item_count}, Sections: {stats.section_count}")

results = search("artifacts/example", query="treesite")
for r in results:
    print(f"  {r.name} ({r.matched_field}): {r.excerpt}")

node = get_node("artifacts/example", id=results[0].id)
subtree = inspect_subtree("artifacts/example", id=str(node.id), max_depth=2)
```

#### `basic_edit.py`

Demonstrates a complete edit session:
```python
import shutil
from treesite_editor.graph import EditSession
from treesite_editor.preview import ArtifactPreviewServer

# Work on a copy
shutil.copytree("artifacts/example", "/tmp/edit-session")

session = EditSession("/tmp/edit-session")
session.load()
(session
  .queue_operation("add_card", name="Demo Section", section="Home", type="section",
                   description="A section added by the SDK.")
  .queue_operation("add_card", name="Demo Article", section="Demo Section", type="text",
                   description="An article in the demo section.")
)
result = session.run(preview=True)

print(f"Status: {result.status}")
print(f"Preview: {result.preview_url}")
# Open result.preview_url in browser to inspect
input("Press Enter to stop preview...")
```

### Tests (`editor/tests/`)

#### `test_tools.py`

- `artifact_stats` returns an `ArtifactStats` with correct `item_count`.
- `get_node` returns a `ContentItem` with valid `UUID` `id`.
- `get_node` raises `ItemNotFoundError` for unknown id.
- `search` returns a list of `SearchResult`.
- `add_card` returns a `ContentItem` with a new UUID `id`.
- `rename_card` preserves `id` and updates `name`.
- `edit_card` raises `InvalidInputError` when attempting to change `id`.
- `validate` passes on fresh example copy.
- `rebuild_manifest` succeeds.

#### `test_models.py`

- `ContentItem` with valid UUID parses correctly.
- `ContentItem` with invalid UUID raises `ValidationError`.
- `ContentItem` without `id` raises `ValidationError`.
- `ArtifactMeta` requires `schemaVersion`.

#### `test_graph.py`

- `EditSession.run()` with no queued operations returns `status == "done"`.
- `EditSession.run()` with one `add_card` returns `status == "done"` and `manifest_rebuilt == True`.
- `EditSession.run()` fails gracefully when artifact path doesn't exist.
- Checkpoint round-trip: save and restore session state.

### Docs

- `editor/README.md` — installation, configuration, quick-start (copy the `basic_edit.py` example), available callables, LangGraph graph overview.
- Update root `README.md` to describe the Python SDK and how to install/use it.

### `npm run test:all` (root)

Add a root-level convenience script that runs both:
- `npm run test:tools` (Node tool tests)
- `pytest editor/tests` (Python SDK tests)

### Check-in

All tests pass. `basic_edit.py` runs end-to-end without errors. Commit: `feat(push3-p5): sdk examples + tests + docs`.

---

## Smoke Test

### Setup

```bash
pip install -e editor/
cd handler && npm run build   # build handler once for preview server
```

### Steps

1. **Inspect the example artifact**
   ```python
   # Run: python editor/examples/inspect_artifact.py
   ```
   - [ ] Prints item counts, sections, search results.
   - [ ] No exceptions.

2. **Run a full edit session with preview**
   ```python
   # Run: python editor/examples/basic_edit.py
   ```
   - [ ] Status: "done".
   - [ ] `manifest_rebuilt: True` in result.
   - [ ] Preview URL printed (e.g. `http://localhost:8002`).

3. **Open preview in browser**
   - [ ] Handler loads at the preview URL.
   - [ ] "Demo Section" appears in the treemap.
   - [ ] Clicking "Demo Section" shows "Demo Article".
   - [ ] Breadcrumbs work; minimap works.

4. **Error handling**
   ```python
   from treesite_editor.tools import get_node
   from treesite_editor.errors import ItemNotFoundError
   try:
       get_node("artifacts/example", id="00000000-0000-0000-0000-000000000000")
   except ItemNotFoundError as e:
       print(f"Caught: {e.code} — {e}")
   ```
   - [ ] Exception is raised and caught cleanly.

5. **ID invariant**
   ```python
   from treesite_editor.tools import add_card, rename_card
   result = add_card("/tmp/sdk-test", name="ID Test", section="Home", type="text")
   original_id = str(result.id)
   renamed = rename_card("/tmp/sdk-test", id=original_id, name="ID Test Renamed", slug="id-test-renamed")
   assert str(renamed.id) == original_id, "ID changed during rename!"
   print("ID invariant: PASS")
   ```
   - [ ] "ID invariant: PASS" printed.

6. **Run test suite**
   ```bash
   pytest editor/tests -v
   ```
   - [ ] All tests pass.

### Pass criteria

All steps pass. Edit session completes with `status == "done"`. Handler preview renders the modified artifact.

---

## Course-Correction Report Template

```markdown
## Course-Correction Report: Push 3 — Python SDK + LangGraph

**Date completed:**  
**Executing agent conversation ID:**

### What was built (vs. plan)
- [ ] Phase 1: Python package scaffold + subprocess wrappers
- [ ] Phase 2: Pydantic models + typed tool returns
- [ ] Phase 3: LangGraph deterministic edit-session graph
- [ ] Phase 4: Local artifact preview server
- [ ] Phase 5: SDK examples + tests + docs

### Deviations from plan

### Smoke test results

### Hard invariants check
- [ ] ContentItem.id is UUID type; edit_card rejects id-change attempts Python-side
- [ ] All tool calls go through runner.run_tool (no direct Node logic in Python)
- [ ] LangGraph graph has no LLM nodes (deterministic)
- [ ] Preview server stops cleanly on session.stop_preview()

### Issues / blockers encountered

### Recommendations for Push 4
```

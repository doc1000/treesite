# Push 5: MCP Adapter

**Depends on:** Push 4 complete — FastAPI API works, zip export/import works, all Node tools conform to contract, Python SDK is fully tested.  
**Artifact format this push:** directory bundles and zip archives (existing)  
**Commits:** one per phase, never push to main  
**Goal:** Expose the proven editor operations as an MCP (Model Context Protocol) server. MCP is a thin adapter over the existing Python SDK tools. No editing logic is reimplemented; the MCP layer only defines tool descriptions, validates inputs, routes to SDK callables, and formats outputs. Optionally demonstrate LLM-driven editing with the deterministic tools underneath.

---

## Context

MCP allows AI agents and LLM-powered UIs to call structured tools via a standard protocol. In this architecture, MCP is the **outermost adapter**: it translates MCP tool call requests into Python SDK calls, which in turn invoke Node tools via subprocess.

```
MCP client
  → MCP server (this push)
    → treesite_editor.tools / EditSession (Push 3)
      → node tools/node/*.js (Push 2)
        → artifacts/ (Push 1)
```

The MCP server exposes:
- All read-only inspection tools (highest priority — agents spend most time inspecting).
- All mutation tools (ID-addressed).
- Lifecycle tools (validate, rebuild, migrate).
- Artifact lifecycle (list, get manifest, export zip, import zip).

No new editing logic is written in this push.

---

## Pre-flight Checklist

- [ ] Push 4 complete: `make test:api` passes.
- [ ] `artifacts/example` is valid: `node tools/node/validate.js --artifact artifacts/example` returns ok.
- [ ] MCP Python SDK available: `pip install mcp` (or `anthropic-mcp`, depending on latest package name — verify at implementation time).
- [ ] `git status` clean on a new branch (e.g. `push-5-mcp`).

---

## Phase 1 — MCP Server Scaffold + Tool Registry

**Goal:** A runnable MCP server that advertises all tools (descriptions + input schemas), accepts connections, and returns a structured error for any call until tools are wired in subsequent phases. No tool implementations yet.

### Application structure

```
editor/
  treesite_editor/
    mcp/
      __init__.py
      server.py         ← MCP server factory + tool registry
      tools.py          ← MCP tool definitions (wired in Phases 2-4)
      session.py        ← artifact session management
      config.py         ← MCP-specific settings
```

### `mcp/config.py`

```python
class McpConfig(TreeSiteConfig):
    mcp_transport: str = "stdio"        # "stdio" or "sse"
    default_artifact: str = "artifacts/example"
    session_timeout_seconds: int = 300
```

`stdio` transport is the default for local agent use; `sse` (server-sent events) for hosted/web use.

### Tool registry

Define all tools in `mcp/tools.py` as a list of `ToolDefinition` objects. Each definition includes:
- `name` — matches the SDK function name (e.g. `get_node`, `search`, `add_card`).
- `description` — natural language description of what the tool does, written for an LLM agent.
- `input_schema` — JSON Schema for the tool's input. **Reuse the schemas from `tools/node/schemas/`** (do not reduplicate; load them at server startup).
- `output_schema` — JSON Schema for the tool's output.
- `category` — one of `"inspection"`, `"mutation"`, `"lifecycle"`, `"artifact"`.

Example:
```python
ToolDefinition(
    name="get_node",
    description=(
        "Retrieve the full data for a single content item by its immutable UUID id. "
        "Use this to inspect a specific card, section, or node in the artifact. "
        "The id never changes across renames, moves, or exports."
    ),
    input_schema=load_schema("get-node.input.schema.json"),
    output_schema=load_schema("get-node.output.schema.json"),
    category="inspection"
)
```

### Startup

On startup, the MCP server:
1. Loads `McpConfig`.
2. Reads all schemas from `tools/node/schemas/`.
3. Registers all tool definitions.
4. Opens the artifact session for the default artifact (or waits for the client to specify one via `set_artifact`).
5. Logs the server startup: transport, artifact, tool count.

A special tool `list_tools` is always available (in addition to the MCP protocol's built-in tool listing) and returns all tool names, descriptions, and categories as JSON.

### Stub behavior

Until tools are wired (Phases 2–4), every tool call returns:
```json
{
  "ok": false,
  "error": { "code": "NOT_IMPLEMENTED", "message": "Tool '{name}' is not yet wired." }
}
```

### Running the server

```bash
# stdio mode (for agent use)
python -m treesite_editor.mcp.server

# SSE mode (for web/hosted use)
python -m treesite_editor.mcp.server --transport sse --port 8001
```

Add to root Makefile:
```bash
serve:mcp:
	python -m treesite_editor.mcp.server
```

### Check-in

MCP server starts without errors. `list_tools` returns all expected tool names. Each call returns `NOT_IMPLEMENTED`. Commit: `feat(push5-p1): mcp server scaffold + tool registry`.

---

## Phase 2 — Artifact Session Handling + Read-only Tools

**Goal:** Implement artifact session management (which artifact is active for a given MCP session) and wire all read-only inspection tools. These are the highest-priority tools; agents use them far more than mutations.

### Artifact sessions

An MCP session is associated with one active artifact. The client can change the active artifact using a special `set_artifact` tool.

`mcp/session.py`:
```python
class ArtifactSession:
    artifact_path: str
    artifact_meta: ArtifactMeta
    
    @classmethod
    def open(cls, artifact_path: str) -> "ArtifactSession": ...
    
    def refresh(self) -> None:
        """Re-read artifact_meta from artifact.json."""
```

The MCP server maintains a session per MCP client connection (keyed by connection ID or thread ID). For `stdio` transport, there is one session per process.

#### `set_artifact` tool

```
name: set_artifact
input: { "artifactPath": "<path-to-artifact-dir>" }
output: { "ok": true, "data": { "name": "...", "displayName": "...", "itemCount": N } }
```

Changes the active artifact for the current session. Validates the artifact on load.

### Read-only tools to wire

Each tool delegates to the corresponding `treesite_editor.tools.*` Python function:

| MCP tool | SDK function | Notes |
|---|---|---|
| `get_node` | `tools.get_node` | Input: `{id}` |
| `get_children` | `tools.get_children` | Input: `{id}` or `{}` for root |
| `search` | `tools.search` | Input: `{query, fields?, limit?}` |
| `inspect_subtree` | `tools.inspect_subtree` | Input: `{id, maxDepth?}` |
| `artifact_stats` | `tools.artifact_stats` | Input: `{}` |
| `get_manifest` | `tools.get_manifest` | Input: `{}` |
| `inspect_tree` | `tools.inspect_tree` | Input: `{}` |

**Output format:** All tools return their Pydantic model serialized to dict (via `.model_dump()`), wrapped in `{"ok": true, "data": {...}}`.

**Error mapping:** `TreeSiteError` subclasses are caught and returned as `{"ok": false, "error": {"code": ..., "message": ...}}`. MCP transport errors (connection issues, malformed input) are logged and returned as `{"ok": false, "error": {"code": "TRANSPORT_ERROR", ...}}`.

### Check-in

Connect a MCP client (or use a test harness). `set_artifact` changes the active artifact. `search` returns results. `get_node` returns a `ContentItem`. `artifact_stats` returns counts. Commit: `feat(push5-p2): artifact sessions + read-only mcp tools`.

---

## Phase 3 — Mutation Tools + Lifecycle Tools

**Goal:** Wire all mutation and lifecycle tools. Enforce ID-addressing invariants at the MCP boundary.

### Mutation tools to wire

| MCP tool | SDK function |
|---|---|
| `add_card` | `tools.add_card` |
| `edit_card` | `tools.edit_card` |
| `delete_card` | `tools.delete_card` |
| `rename_card` | `tools.rename_card` |
| `move_card` | `tools.move_card` |
| `hide_card` | `tools.hide_card` |
| `unhide_card` | `tools.unhide_card` |
| `move_subtree` | `tools.move_subtree` |

### ID-addressing enforcement at MCP boundary

Before calling any mutation SDK function:
1. Validate the input against the tool's input schema (schema requires `id` for all update/delete/rename/move tools).
2. If `id` is missing or not a valid UUID, return `INVALID_INPUT` immediately (do not forward to SDK).
3. If the input contains an `id` field in the mutation payload (e.g. in `edit_card` body), strip it and log a warning: "Attempted to modify immutable field 'id' via MCP; field ignored."

These checks are defense-in-depth (SDK and Node tools enforce the same rules), but catching them early at the MCP boundary produces better LLM agent error messages.

### Lifecycle tools to wire

| MCP tool | SDK function |
|---|---|
| `validate_artifact` | `tools.validate` |
| `rebuild_manifest` | `tools.rebuild_manifest` |
| `migrate_artifact` | `tools.migrate` |
| `export_artifact_zip` | `tools.export_zip` |
| `import_artifact_zip` | `tools.import_zip` |

### Tool descriptions (LLM-facing)

Write descriptions for mutation tools that guide an LLM agent correctly:

```
add_card:
  "Create a new content card or section in the active artifact. 
   Assign a name, section path (e.g. 'Home' or 'Home/Services'), and type.
   A permanent UUID id is automatically assigned; you cannot set it manually.
   The manifest is automatically rebuilt after creation.
   Returns the full item including its new id."

edit_card:
  "Update fields on an existing content card by its id.
   The id field is immutable and cannot be changed.
   Provide only the fields you want to update.
   The manifest is automatically rebuilt after editing."

rename_card:
  "Change the name and slug of an existing card by its id.
   The id is preserved; only name and slug change.
   Use this instead of edit_card when you only want to rename."
```

Similar description quality required for all tools.

### Check-in

`add_card` via MCP creates a card; subsequent `get_node` retrieves it. `rename_card` preserves `id`. `validate_artifact` runs successfully. Commit: `feat(push5-p3): mutation + lifecycle mcp tools`.

---

## Phase 4 — Optional LLM-Driven Demo

**Goal:** A runnable demonstration where an LLM agent (e.g. Claude via `langchain-anthropic`) uses the MCP tools to explore and edit an artifact. The underlying tools are still deterministic; only the agent's decision-making uses the LLM.

### Design principle

The LLM is a **tool user**, not a tool implementer. Every edit operation it issues goes through the same MCP → SDK → Node path. The LLM cannot bypass the ID invariant, manifest-derivation rule, or schema validation.

### Demo script: `editor/examples/llm_agent_demo.py`

```python
"""
Optional LLM demo: an agent explores the example artifact and adds a summary card.
Requires ANTHROPIC_API_KEY or OPENAI_API_KEY env var.
"""
from langchain_anthropic import ChatAnthropic
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

# Connect to the running MCP server (stdio or SSE)
mcp_client = MultiServerMCPClient({
    "treesite": {
        "command": "python",
        "args": ["-m", "treesite_editor.mcp.server"],
        "transport": "stdio"
    }
})

tools = await mcp_client.get_tools()
model = ChatAnthropic(model="claude-3-5-sonnet-latest")
agent = create_react_agent(model, tools)

response = await agent.ainvoke({
    "messages": [{
        "role": "user",
        "content": (
            "Look at the example artifact. "
            "Find the 'About This Site' section and add a new text card called 'LLM Demo Card' "
            "with a description summarizing what you found in that section. "
            "Then validate the artifact."
        )
    }]
})

print(response["messages"][-1].content)
```

### Key constraints documented in the demo

- The demo script is **optional** and requires an API key env var. If the key is not present, the script prints a message and exits cleanly.
- The script uses `langchain-mcp-adapters` to bridge LangChain tool calling with the MCP server (use the latest available version).
- The LLM cannot access the filesystem directly; it can only call the MCP tools.
- All IDs in the demo output should be stable UUIDs (no UUIDs generated by the LLM).

### LangGraph integration note

The demo uses `create_react_agent` (prebuilt ReAct agent from LangGraph). The agent's tool calls go through MCP, which goes through the SDK. This is the intended extension point: existing `EditSession` graphs from Push 3 can optionally be given LLM tool-calling nodes that route through MCP tools instead of calling SDK functions directly.

### Check-in

The demo script runs end-to-end (with a real API key). The LLM successfully uses `search`, `get_node`, `add_card`, and `validate_artifact`. The new card has a server-generated UUID (not one the LLM invented). Commit: `feat(push5-p4): optional llm-driven mcp demo`.

---

## Phase 5 — MCP Tests + Docs

**Goal:** Automated tests for the MCP server, complete documentation, and a final integration test that covers the full stack.

### MCP tests

`editor/tests/test_mcp.py` — tests using the MCP test client or a local stdio subprocess.

**Scope:**
- `list_tools` returns all expected tool names.
- `set_artifact` with a valid path changes the active artifact.
- `set_artifact` with an invalid path returns `ARTIFACT_NOT_FOUND`.
- `search` returns results matching a known query.
- `get_node` with a valid id returns a `ContentItem`.
- `get_node` with unknown id returns `ITEM_NOT_FOUND`.
- `add_card` creates a card with a UUID id; id is not in the input.
- `rename_card` preserves id.
- `edit_card` with id in the mutation payload: id is stripped (not changed).
- `validate_artifact` passes on the example artifact.
- All tools return `{"ok": false, "error": {...}}` on error (never crash the server).

### Full stack integration test

`editor/tests/test_integration.py` — one test that exercises the complete stack:

1. Start the Node tools (validate the example artifact).
2. Call Python SDK directly to add a card.
3. Start the MCP server (subprocess).
4. Connect MCP client.
5. `search` via MCP to find the newly added card.
6. `rename_card` via MCP.
7. `validate_artifact` via MCP.
8. Connect to the API (or use `TestClient`).
9. `GET /artifacts/example/nodes/{id}` via HTTP — confirm card is present with original id.
10. `GET /artifacts/example/export` — download zip.
11. `import_zip` the downloaded zip to a new artifact.
12. Confirm all ids are identical.

This test validates that the entire adapter chain (Node → SDK → MCP → API) preserves the three hard invariants end-to-end.

### Documentation

- `editor/treesite_editor/mcp/README.md` — how to start the MCP server, configure transport, connect a client, list tools, use with Claude/OpenAI, LLM demo.
- Update root `README.md` — add MCP section.
- Update `docs/planning/00-overview.md` if any deviations need documenting.
- `docs/tool-catalog.md` — a combined reference listing every tool with name, description, input schema, output schema, and which layer implements it (Node / SDK / API / MCP).

### `make test:mcp` and `make test:integration`

```bash
test:mcp:
	pytest editor/tests/test_mcp.py -v

test:integration:
	pytest editor/tests/test_integration.py -v

test:all:
	npm run test:tools && pytest editor/tests -v
```

### Check-in

All MCP tests pass. Integration test passes. Docs committed. `make test:all` runs clean. Commit: `feat(push5-p5): mcp tests + integration test + docs`.

---

## Smoke Test

### Setup

```bash
# Terminal 1: API server
cd editor && uvicorn treesite_editor.api.main:app --port 8000

# Terminal 2: MCP server (SSE mode for easy manual testing)
python -m treesite_editor.mcp.server --transport sse --port 8001

# Terminal 3: smoke test commands
```

### Steps

1. **List MCP tools**
   ```bash
   # Using an MCP test client or curl against SSE endpoint
   # Expect: list includes get_node, search, add_card, validate_artifact, etc.
   ```
   - [ ] All expected tools listed.
   - [ ] Each tool has a description and input schema.

2. **Inspection via MCP**
   - Call `artifact_stats` → confirm item count matches example artifact.
   - Call `search` with `{"query": "treesite"}` → confirm results.
   - Call `get_node` with a known id → confirm full item returned.
   - [ ] All three calls succeed with `ok: true`.

3. **Mutation via MCP**
   - Call `add_card` with `{"name": "MCP Smoke Card", "section": "About This Site", "type": "text"}`.
   - Note the returned `id`.
   - Call `rename_card` with the returned id.
   - Call `get_node` with the same id → confirm renamed, id unchanged.
   - [ ] ID invariant: `id` returned from `add_card` matches `id` returned from `get_node` after rename.

4. **ID protection at MCP boundary**
   - Call `edit_card` with `{"id": "<correct-id>", "fields": {"id": "00000000-0000-0000-0000-000000000000", "description": "test"}}`.
   - [ ] Tool call succeeds (description updated); `id` field in response is the original id, not the attempted replacement.

5. **Validate via MCP**
   - Call `validate_artifact` → `{"valid": true}`.
   - [ ] Passes.

6. **Run MCP tests**
   ```bash
   make test:mcp
   ```
   - [ ] All tests pass.

7. **Run full integration test**
   ```bash
   make test:integration
   ```
   - [ ] Passes end-to-end.

8. **Optional LLM demo (if API key available)**
   ```bash
   export ANTHROPIC_API_KEY=...
   python editor/examples/llm_agent_demo.py
   ```
   - [ ] LLM agent successfully adds a card; card appears in `search` results.
   - [ ] LLM-added card has a server-generated UUID (not text invented by the LLM).

9. **`make test:all`**
   ```bash
   make test:all
   ```
   - [ ] All tools tests, SDK tests, API tests, MCP tests, and integration tests pass.

### Pass criteria

Steps 1–7 and 9 must pass. Step 8 is optional (API key required).

---

## Program Completion Checklist

After Push 5, verify the following across the entire program:

- [ ] `handler/` loads any well-formed artifact at runtime; loads `artifacts/example` by default.
- [ ] KnowAlgo artifact is a standalone portable directory with all 46 items having frozen UUIDs.
- [ ] All Node tools accept `--artifact <path>` and produce `{"ok":true/false,...}` JSON on stdout.
- [ ] All mutations are ID-addressed; `id` never changes.
- [ ] `manifest.json` is always derived from `items/`; `validate` detects drift.
- [ ] Python SDK wraps all Node tools; Pydantic models type-check all data.
- [ ] LangGraph `EditSession` runs a complete edit workflow end-to-end.
- [ ] FastAPI service exposes all operations over HTTP with OpenAPI docs.
- [ ] Zip round-trip preserves all ids verbatim.
- [ ] MCP server exposes all tools; LLM agent can use them without bypassing invariants.
- [ ] `make test:all` passes.

---

## Course-Correction Report Template

```markdown
## Course-Correction Report: Push 5 — MCP Adapter

**Date completed:**  
**Executing agent conversation ID:**

### What was built (vs. plan)
- [ ] Phase 1: MCP server scaffold + tool registry
- [ ] Phase 2: Artifact sessions + read-only tools
- [ ] Phase 3: Mutation + lifecycle tools
- [ ] Phase 4: Optional LLM demo
- [ ] Phase 5: MCP tests + integration test + docs

### Deviations from plan

### Smoke test results

### Hard invariants check
- [ ] MCP boundary strips attempted id changes before forwarding to SDK
- [ ] All MCP tools return structured errors (never crash the server)
- [ ] Integration test confirms id preservation through full Node → SDK → MCP → API → zip chain
- [ ] LLM demo (if run): LLM-added cards have server-generated UUIDs

### Issues / blockers encountered

### Program-wide retrospective
<!-- How did the overall push sequence work? What would you change for a future program? -->
```

# TreeSite MCP server

The MCP (Model Context Protocol) adapter exposes the same editor operations as the Python SDK and HTTP API. MCP is a thin layer: tool descriptions, JSON Schema validation, and routing to `treesite_editor.tools` — no editing logic is duplicated here.

## Install

From the repository root:

```bash
pip install -e "editor/[dev]"
```

Requires Python 3.11+, Node.js on `PATH`, and the `mcp` package (installed with the editor).

## Configuration

Uses the same `TREESITE_*` settings as the SDK (`treesite_editor.config.TreeSiteConfig`), plus:

| Variable | Default | Meaning |
|----------|---------|---------|
| `TREESITE_MCP_TRANSPORT` | `stdio` | `stdio` or `sse` |
| `TREESITE_DEFAULT_ARTIFACT` | `artifacts/example` | Artifact opened at startup |
| `TREESITE_SESSION_TIMEOUT_SECONDS` | `300` | Reserved for future session expiry |

## Start the server

**stdio** (Claude Desktop, Cursor, local agents):

```bash
python -m treesite_editor.mcp.server
# or from repo root:
make serve:mcp
```

**SSE** (manual testing with an MCP client over HTTP):

```bash
python -m treesite_editor.mcp.server --transport sse --port 8001
```

On startup the server logs transport, default artifact, and tool count.

## Tool responses

Every tool returns JSON (as MCP text content) in the shared contract shape:

```json
{"ok": true, "data": { ... }}
```

Errors never crash the server:

```json
{"ok": false, "error": {"code": "ITEM_NOT_FOUND", "message": "..."}}
```

## Session artifact

One active artifact directory per MCP process (stdio) or connection. Switch artifacts with the `set_artifact` tool:

```json
{"artifactPath": "artifacts/example"}
```

The custom `list_tools` tool returns names, descriptions, and categories for all operations (in addition to the protocol `tools/list`).

## Connect a client

Point your MCP client at:

- **Command:** `python`
- **Args:** `-m`, `treesite_editor.mcp.server`
- **Working directory:** `editor/` (or set `PYTHONPATH` to the `editor` folder)
- **Env:** optional `TREESITE_DEFAULT_ARTIFACT`

Input schemas are loaded from `tools/node/schemas/` at startup (same as Node tools). Lifecycle MCP names map to SDK functions (`validate_artifact` → `validate`, `export_artifact_zip` → `export_zip`, etc.).

## Optional LLM demo

Requires `ANTHROPIC_API_KEY` and `pip install -e "editor/[llm]"`:

```bash
python editor/examples/llm_agent_demo.py
```

The demo uses LangChain MCP adapters so the model only calls TreeSite tools (no direct filesystem access). New item UUIDs are assigned by the Node tools, not the LLM.

## Tests

```bash
make test:mcp
make test:integration
```

# Push 4: Hosted API Service (FastAPI) + Zip Packaging

**Depends on:** Push 3 complete — Python SDK works, LangGraph edit session runs, all Node tools conform to contract, `artifacts/example` is the default artifact.  
**Artifact format this push:** directory bundles **and** zip archives  
**Commits:** one per phase, never push to main  
**Goal:** Introduce zip packaging for portable artifact exchange, then wrap the entire SDK behind a FastAPI service with read-only endpoints first, followed by editing and lifecycle endpoints.

---

## Context

Up to this point, artifacts have been plain directories. Zip packaging is introduced now (after the directory format is proven) because it adds edge cases: path normalization, asset inclusion/exclusion, temp-dir handling, validation-on-import, and round-trip ID preservation. Handling these first in isolation (Phase 1) means the API only sees clean, validated artifacts.

The API is a thin HTTP adapter over the Python SDK. It must not reimplement any editing logic; every endpoint delegates to an `EditSession` or a direct `tools.*` call.

---

## Pre-flight Checklist

- [ ] Push 3 complete: `pytest editor/tests` passes, `basic_edit.py` runs end-to-end.
- [ ] `artifacts/example/` and an exported KnowAlgo artifact are both loadable by the handler.
- [ ] `git status` clean on a new branch (e.g. `push-4-hosted-api`).

---

## Phase 1 — Zip Packaging

**Goal:** Implement `export_zip` and `import_zip` as Python functions (backed by Node tools) and as standalone Node tools. Validate that zip<→dir round-trips preserve all data including immutable IDs.

### Approach

Zip packaging lives at two levels:
1. **Node tools** `export-zip.js` and `import-zip.js` — filesystem-level, handle path normalization and asset inclusion.
2. **Python wrappers** `treesite_editor.tools.export_zip` and `import_zip` — call the Node tools via subprocess.

### `tools/node/export-zip.js`

Input:
```json
{ "srcDir": "./artifacts/example", "destZip": "./artifacts/example.zip" }
```

Steps:
1. Validate the source directory (run `validate` tool internally; fail if invalid).
2. Create a deterministic zip: all files from the artifact directory, paths relative to artifact root (not absolute), sorted for reproducible builds.
3. Include: `artifact.json`, `manifest.json`, `items/`, `assets/`, `schemes/`, `migrations/`.
4. Exclude: `.gitkeep`, `*.DS_Store`, temp files.
5. Write to `destZip`.
6. Compute a SHA-256 hash of the zip file.

Output:
```json
{
  "ok": true,
  "data": {
    "zipPath": "./artifacts/example.zip",
    "sizeBytes": 123456,
    "sha256": "abc123..."
  }
}
```

### `tools/node/import-zip.js`

Input:
```json
{ "srcZip": "./artifacts/example.zip", "destDir": "./artifacts/example-imported", "overwrite": false }
```

Steps:
1. Unzip to a temp directory first.
2. Run `validate` on the temp directory (fail with `ARTIFACT_MALFORMED` if invalid).
3. Check all item `id` fields are present and unique (fail with `DUPLICATE_ID` if not).
4. If `destDir` exists and `overwrite: false`, fail with `FILESYSTEM_ERROR`.
5. Move temp directory to `destDir`.

Output:
```json
{
  "ok": true,
  "data": {
    "artifactPath": "./artifacts/example-imported",
    "itemCount": 12,
    "schemaVersion": 1
  }
}
```

### Python wrappers

Add to `treesite_editor/tools.py`:
```python
def export_zip(artifact: str, dest_zip: str) -> ZipExportResult: ...
def import_zip(src_zip: str, dest_dir: str, overwrite: bool = False) -> ImportResult: ...
```

Add Pydantic models:
```python
class ZipExportResult(BaseModel):
    zip_path: str
    size_bytes: int
    sha256: str

class ImportResult(BaseModel):
    artifact_path: str
    item_count: int
    schema_version: int
```

### Golden tests for zip round-trip

Add to `editor/tests/test_zip.py`:
- `export_zip` produces a valid zip file.
- `import_zip` of the exported zip produces a directory identical to the source.
- All `id` fields are identical before and after zip round-trip.
- `import_zip` on a zip with a duplicate `id` raises `DuplicateIdError`.
- `import_zip` on a malformed zip (missing `artifact.json`) raises `ArtifactMalformedError`.
- `export_zip` output is deterministic: two exports of the same artifact produce the same SHA-256.

### Check-in

`export_zip` and `import_zip` Node tools pass their CLI tests. Python tests in `test_zip.py` pass. Commit: `feat(push4-p1): zip export/import + round-trip golden tests`.

---

## Phase 2 — FastAPI Scaffold + Configuration

**Goal:** A runnable FastAPI application with health check, configuration, structured logging, and a clean error-to-HTTP mapping. No content endpoints yet.

### Application structure

```
editor/
  treesite_editor/
    api/
      __init__.py
      main.py           ← FastAPI app factory
      config.py         ← API-specific settings (extends TreeSiteConfig)
      deps.py           ← FastAPI dependency injection
      errors.py         ← exception handlers: TreeSiteError → HTTP response
      middleware.py     ← request ID, logging middleware
      routers/
        __init__.py
        health.py
        artifacts.py    ← Phase 3
        nodes.py        ← Phase 3
        editing.py      ← Phase 4
```

### `api/config.py`

```python
class ApiConfig(TreeSiteConfig):
    host: str = "0.0.0.0"
    port: int = 8000
    artifacts_base_dir: str = "artifacts"   # root dir where uploaded artifacts are stored
    max_artifact_size_bytes: int = 500_000_000
    api_key: str | None = None              # if set, require X-API-Key header
    allow_origins: list[str] = ["*"]        # CORS
```

### Health check

`GET /health`  
Response: `{"status": "ok", "version": "1.0.0"}`

### Error handling

Map `TreeSiteError` subclasses to HTTP status codes:

| Python exception | HTTP status | Example |
|---|---|---|
| `InvalidInputError` | 400 | Schema validation failure |
| `ItemNotFoundError` | 404 | Item not found by id |
| `ArtifactNotFoundError` | 404 | Artifact not found |
| `ArtifactMalformedError` | 422 | Artifact fails validation |
| `ManifestDriftError` | 409 | Artifact needs rebuild |
| `DuplicateIdError` | 409 | Duplicate ID in artifact |
| `MigrationFailedError` | 500 | Migration step failed |
| `TreeSiteError` (base) | 500 | Unexpected error |

All error responses share a common body:
```json
{
  "ok": false,
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "No item with id '...' found.",
    "details": {}
  }
}
```

### Structured request logging

Log every request on completion: `method`, `path`, `status_code`, `elapsed_ms`, `request_id`. Use a middleware that assigns a UUID request ID (propagated in response header `X-Request-ID`).

### Running the API

```bash
cd editor
uvicorn treesite_editor.api.main:app --reload --port 8000
```

Add to `editor/pyproject.toml` scripts or root Makefile:
```bash
make serve:api
```

### Check-in

`GET /health` returns 200. Requests are logged with request IDs. `TreeSiteError` raised from any route returns the structured error JSON at the correct HTTP status. Commit: `feat(push4-p2): fastapi scaffold + config + error mapping`.

---

## Phase 3 — Read-only Endpoints + Artifact Lifecycle

**Goal:** Implement all read-only inspection endpoints and artifact lifecycle endpoints (upload, list, export/download). Read-only first per the cross-cutting convention.

### Artifact management

**Artifacts are stored server-side** in `{artifacts_base_dir}/` as directories. Each artifact is identified by its `name` field from `artifact.json`.

#### `POST /artifacts/import`

Upload a zip file or a multipart directory as a new artifact.

Request: `multipart/form-data` with field `file` (zip) and optional `name` override.  
Steps: receive file, write to temp, call `import_zip`, validate, move to `{artifacts_base_dir}/{name}/`.  
Response:
```json
{
  "ok": true,
  "data": { "name": "example", "itemCount": 12, "schemaVersion": 1 }
}
```

#### `GET /artifacts`

List all artifacts stored in `artifacts_base_dir`.  
Response:
```json
{
  "ok": true,
  "data": {
    "artifacts": [
      { "name": "example", "displayName": "TreeSite Example", "schemaVersion": 1, "itemCount": 12 }
    ]
  }
}
```

#### `GET /artifacts/{name}/manifest`

Return the full `manifest.json` for an artifact.

#### `GET /artifacts/{name}/stats`

Return `artifact_stats` for an artifact.

#### `GET /artifacts/{name}/export`

Return the artifact as a zip download.  
Headers: `Content-Disposition: attachment; filename="{name}.zip"`.  
Steps: call `export_zip` to a temp file, stream to response.

#### `DELETE /artifacts/{name}`

Delete an artifact from the server. Requires explicit confirmation header `X-Confirm-Delete: yes`.

### Read-only node inspection endpoints

All scoped under `/artifacts/{name}/nodes`.

#### `GET /artifacts/{name}/nodes/{id}`

Call `get_node`. Returns `ContentItem`.

#### `GET /artifacts/{name}/nodes/{id}/children`

Call `get_children`.

#### `GET /artifacts/{name}/nodes/{id}/subtree?maxDepth=3`

Call `inspect_subtree`.

#### `GET /artifacts/{name}/nodes/search?q=...&fields=name,description&limit=20`

Call `search`.

### Dependency injection

`deps.py` provides a `get_artifact_path(name: str)` dependency that resolves the server-side artifact path and raises `ArtifactNotFoundError` if it doesn't exist. All artifact-scoped routes use this dependency.

```python
def get_artifact_path(name: str) -> str:
    path = f"{settings.artifacts_base_dir}/{name}"
    if not os.path.isdir(path):
        raise ArtifactNotFoundError(f"Artifact '{name}' not found.")
    return path
```

### Check-in

All Phase 3 endpoints pass manual tests with the example artifact. `GET /artifacts/example/nodes/search?q=treesite` returns results. Commit: `feat(push4-p3): read-only endpoints + artifact lifecycle`.

---

## Phase 4 — Editing Endpoints + Handler Serving

**Goal:** Add editing (mutation) and lifecycle (validate, rebuild, migrate) API endpoints. Add a handler-serving endpoint that allows the API to serve the handler pointed at an artifact.

### Editing endpoints

All under `/artifacts/{name}/nodes`.

#### `POST /artifacts/{name}/nodes`

Add a new card.  
Body: `ContentItem` without `id` (assigned server-side).  
Response: created `ContentItem` with new `id`.

#### `PATCH /artifacts/{name}/nodes/{id}`

Edit fields on an existing card. `id` in body must match path or be absent.  
Body: partial `ContentItem` (only fields to update).  
Response: updated `ContentItem`.

#### `DELETE /artifacts/{name}/nodes/{id}`

Delete a card. Response: `{"ok": true, "data": {"deleted": true}}`.

#### `POST /artifacts/{name}/nodes/{id}/rename`

Body: `{"name": "New Name", "slug": "new-name"}`.  
Response: updated `ContentItem`.

#### `POST /artifacts/{name}/nodes/{id}/move`

Body: `{"section": "New Section/Path"}`.  
Response: updated `ContentItem`.

#### `POST /artifacts/{name}/nodes/{id}/hide`

Set `hidden: true`. Response: updated `ContentItem`.

#### `POST /artifacts/{name}/nodes/{id}/unhide`

Set `hidden: false`. Response: updated `ContentItem`.

### Lifecycle endpoints

#### `POST /artifacts/{name}/validate`

Body: `{"strict": false}`.  
Response: `ValidationResult`.

#### `POST /artifacts/{name}/rebuild`

Rebuild `manifest.json` from `items/`.  
Response: `{"ok": true, "data": {"manifestRebuilt": true, "itemCount": N}}`.

#### `POST /artifacts/{name}/migrate`

Body: `{"targetVersion": 1}`.  
Response: migration result.

### Handler serving endpoint

#### `GET /artifacts/{name}/preview`

Starts (or returns the URL of an already-running) preview server for this artifact. Response:
```json
{ "ok": true, "data": { "previewUrl": "http://localhost:8002/?artifact=http://localhost:8000/artifacts/example" } }
```

The API serves the artifact's static files under `/artifacts/{name}/static/` with appropriate CORS headers, so the handler can fetch `manifest.json`, `assets/`, and `schemes/` directly from the API.

Add a static file mount:
```python
app.mount("/artifacts/{name}/static", StaticFiles(directory=artifact_path), name="artifact_static")
```

The handler loads the artifact via `?artifact=http://{api_host}/artifacts/{name}/static`.

### Auth (optional but scaffolded)

If `api_key` is set in `ApiConfig`, all write endpoints (`POST`/`PATCH`/`DELETE`) require `X-API-Key: {api_key}` header. Read endpoints (`GET`) are unauthenticated. Middleware handles this uniformly.

### Check-in

`POST /artifacts/example-copy/nodes` creates a card; `GET /artifacts/example-copy/nodes/{id}` returns it; `POST /artifacts/example-copy/validate` passes; `GET /artifacts/example-copy/preview` returns a preview URL that opens in a browser. Commit: `feat(push4-p4): editing endpoints + handler serving`.

---

## Phase 5 — Contract Tests + OpenAPI Docs

**Goal:** Automated contract tests, complete OpenAPI documentation, and user-facing docs.

### Contract tests

`editor/tests/test_api.py` — uses `httpx` with `TestClient` (FastAPI's test client) to test all endpoints. Tests run in-memory against a temp copy of `artifacts/example`.

Test coverage:

**Artifact lifecycle:**
- `POST /artifacts/import` with valid zip → 200.
- `POST /artifacts/import` with malformed zip → 422.
- `GET /artifacts` → lists imported artifact.
- `GET /artifacts/{name}/manifest` → returns tree.
- `GET /artifacts/{name}/export` → returns zip binary.

**Read-only inspection:**
- `GET /artifacts/{name}/nodes/{id}` with valid id → 200 with item.
- `GET /artifacts/{name}/nodes/{id}` with unknown id → 404.
- `GET /artifacts/{name}/nodes/search?q=treesite` → 200 with results.
- `GET /artifacts/{name}/nodes/{id}/subtree` → 200 with tree.

**Editing:**
- `POST /artifacts/{name}/nodes` → 201 with new item; `id` is a UUID.
- `PATCH /artifacts/{name}/nodes/{id}` → 200; `id` unchanged.
- `PATCH /artifacts/{name}/nodes/{id}` with `id` in body mismatching path → 400.
- `POST /artifacts/{name}/nodes/{id}/rename` → `id` unchanged; `name`/`slug` updated.
- `DELETE /artifacts/{name}/nodes/{id}` → 200; subsequent `GET` returns 404.

**Lifecycle:**
- `POST /artifacts/{name}/validate` on clean artifact → `{"valid": true}`.
- `POST /artifacts/{name}/rebuild` → `{"manifestRebuilt": true}`.

**Error format:**
- Every 4xx/5xx response has `{"ok": false, "error": {"code": ..., "message": ...}}`.

### OpenAPI documentation

FastAPI auto-generates `/docs` (Swagger UI) and `/redoc`. Ensure:
- Every endpoint has a `summary` and `description`.
- All request/response models have docstrings in the Pydantic models.
- Error responses are documented using `responses=` parameter on routes.
- `tags=` used to group routes: `["Artifacts"]`, `["Nodes (read-only)"]`, `["Editing"]`, `["Lifecycle"]`.

Export the OpenAPI schema to `docs/api-schema.json` as part of the build:
```bash
python -c "from treesite_editor.api.main import app; import json; print(json.dumps(app.openapi(), indent=2))" > docs/api-schema.json
```

### User-facing docs

- `editor/README.md` — add API section: how to start the server, authentication, endpoint overview, link to `/docs`.
- `docs/api-schema.json` — committed to repo for reference.

### `make test:api`

Add to root Makefile:
```bash
test:api:
	pytest editor/tests/test_api.py -v
```

### Check-in

All contract tests pass. `/docs` is navigable and all endpoints are documented. OpenAPI schema committed. Commit: `feat(push4-p5): contract tests + openapi docs`.

---

## Smoke Test

### Setup

```bash
# Terminal 1: start API server
cd editor
uvicorn treesite_editor.api.main:app --reload --port 8000

# Terminal 2: run smoke test commands
```

### Steps

1. **Health check**
   ```bash
   curl http://localhost:8000/health
   # Expect: {"status":"ok","version":"1.0.0"}
   ```

2. **Upload artifact (dir zip)**
   ```bash
   # First export example to zip
   python -c "from treesite_editor.tools import export_zip; export_zip('artifacts/example', '/tmp/example.zip')"
   
   curl -X POST http://localhost:8000/artifacts/import \
     -F "file=@/tmp/example.zip"
   # Expect: {"ok":true,"data":{"name":"example","itemCount":12,...}}
   ```

3. **List artifacts**
   ```bash
   curl http://localhost:8000/artifacts
   # Expect: {"ok":true,"data":{"artifacts":[{"name":"example",...}]}}
   ```

4. **Search**
   ```bash
   curl "http://localhost:8000/artifacts/example/nodes/search?q=treesite"
   # Expect: results with matched items
   ```

5. **Get node**
   ```bash
   # Use an id from search results
   curl http://localhost:8000/artifacts/example/nodes/<id>
   # Expect: full item JSON
   ```

6. **Add a card**
   ```bash
   curl -X POST http://localhost:8000/artifacts/example/nodes \
     -H "Content-Type: application/json" \
     -d '{"name":"API Test Card","section":"About This Site","type":"text","description":"Created via API."}'
   # Expect: {"ok":true,"data":{"id":"<uuid>","name":"API Test Card",...}}
   # Note the id
   ```

7. **Confirm id unchanged after rename**
   ```bash
   curl -X POST "http://localhost:8000/artifacts/example/nodes/<id>/rename" \
     -H "Content-Type: application/json" \
     -d '{"name":"API Test Card Renamed","slug":"api-test-card-renamed"}'
   # Expect: same id in response
   ```

8. **Validate**
   ```bash
   curl -X POST http://localhost:8000/artifacts/example/validate
   # Expect: {"ok":true,"data":{"valid":true,"errors":[],...}}
   ```

9. **Download zip**
   ```bash
   curl -o /tmp/example-export.zip http://localhost:8000/artifacts/example/export
   # Confirm file exists and is non-empty
   ls -la /tmp/example-export.zip
   ```

10. **Re-import zip and verify IDs**
    ```bash
    curl -X POST http://localhost:8000/artifacts/import \
      -F "file=@/tmp/example-export.zip" \
      # Will fail if "example" already exists and no overwrite flag; use name override
      # or delete first:
      curl -X DELETE -H "X-Confirm-Delete: yes" http://localhost:8000/artifacts/example
      curl -X POST http://localhost:8000/artifacts/import -F "file=@/tmp/example-export.zip"
    # Confirm: same item count, same ids
    ```

11. **Preview**
    ```bash
    curl http://localhost:8000/artifacts/example/preview
    # Expect: {"ok":true,"data":{"previewUrl":"http://localhost:8002/..."}}
    # Open previewUrl in browser
    ```
    - [ ] Handler loads at the preview URL.
    - [ ] "API Test Card Renamed" appears in the treemap.

12. **Run contract tests**
    ```bash
    make test:api
    # All tests pass
    ```

### Pass criteria

All steps succeed. Contract tests pass. Handler preview shows updated content. IDs are stable through export/import.

---

## Course-Correction Report Template

```markdown
## Course-Correction Report: Push 4 — Hosted API + Zip Packaging

**Date completed:**  
**Executing agent conversation ID:**

### What was built (vs. plan)
- [ ] Phase 1: Zip export/import + round-trip tests
- [ ] Phase 2: FastAPI scaffold + config + error mapping
- [ ] Phase 3: Read-only endpoints + artifact lifecycle
- [ ] Phase 4: Editing endpoints + handler serving
- [ ] Phase 5: Contract tests + OpenAPI docs

### Deviations from plan

### Smoke test results

### Hard invariants check
- [ ] ZIP round-trip preserves all item id fields verbatim
- [ ] PATCH /nodes/{id} rejects body id != path id with 400
- [ ] manifest.json is rebuilt after every editing endpoint call
- [ ] /docs is accessible and all endpoints are documented

### Issues / blockers encountered

### Recommendations for Push 5
```

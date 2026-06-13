# Studio view preview (in-process)

Studio edits artifacts in the treemap; **view preview** is served by the same Vite dev server as the editor (port **5175**). No detached processes, no session file, no ports 5180/5199.

## One command

```text
npm --prefix studio run dev
```

Studio serves:

| Path | Content |
|------|---------|
| `/` (and app routes) | Studio editor UI |
| `/preview/*` | Built handler from `handler/dist` (must use preview base — see below) |
| `/artifact/:artifactName/*` | Artifact bundle files on disk |

Preview URL (self-contained per artifact; safe for multiple tabs):

```text
http://localhost:5175/preview/?artifact=/artifact/example/
```

(`example` is the artifact folder name under `artifacts/`.)

## Handler build for Studio preview

Preview assets must be built with base `/preview/`:

```text
npm --prefix handler run build:studio-preview
```

Normal `npm --prefix handler run build` keeps base `/` for standalone deploys. Studio returns a clear error if `handler/dist` is missing or was built with the wrong base.

## Studio bridge

| Endpoint | Behavior |
|----------|----------|
| `POST /api/preview/open` | `{ artifactName }` — validates dist + artifact; returns `{ ok, url, data: { url, artifactName } }`. No child processes. |
| `POST /api/preview/stop` | No-op `{ ok: true }`. |
| `GET /api/preview/status` | `{ handlerDistReady: boolean }`. |

Ribbon **Open Preview** → `window.open` on the returned URL. **Edit in Studio** stays in the treemap (no iframe).

## Optional CLI (not Studio MVP)

Standalone detached preview (5199 + 5180) for terminal debugging:

```text
node tools/node/open-view-preview.js --artifact-path <absoluteDir> [--open]
node tools/node/stop-view-preview.js
```

Studio does not call these scripts.

## Server log

Append-only NDJSON (when enabled): `logs/studio-session.ndjson`.

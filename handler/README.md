# TreeSite handler

Content-agnostic React/Vite app. It loads a **content artifact** at runtime (`artifact.json`, `manifest.json`, assets, and color schemes) instead of bundling site content at build time.

## Quick start

```bash
cd handler
npm install
npm run dev
```

Open [http://localhost:5174](http://localhost:5174). By default the dev server serves `../artifacts/example/` at `/artifact`.

## Artifact selection

Priority order:

1. Query parameter: `?artifact=<base-url>` (e.g. `?artifact=http://localhost:5199`)
2. Environment variable: `VITE_ARTIFACT_BASE` (build/dev time)
3. Default: `/artifact` (example bundle via Vite dev middleware)

To point at the KnowAlgo bundle during development:

```bash
# Terminal 1 — handler
cd handler && npm run dev

# Terminal 2 — serve artifact directory with CORS
npm run serve:artifact -- --dir ../artifacts/knowalgo --port 5199
```

Then open `http://localhost:5174/?artifact=http://localhost:5199`.

In **development mode**, use the artifact switcher at the bottom of the page to type a base URL and reload.

## Production build

```bash
npm run build
npm run preview
```

Set `VITE_ARTIFACT_BASE` when building if the artifact is hosted at a fixed URL.

## Legacy KnowAlgo content

KnowAlgo site content lives in `artifacts/knowalgo/` (exported from `handler/content/items/`). The handler source tree no longer embeds that content in the JS bundle.

## Content editing scripts

Node intake scripts live in `../tools/node/`. Run them from **`handler/`** so paths like `content/items/` resolve correctly:

```bash
cd handler
npm run inspect:tree
```

See `../tools/node/README.md` for the upcoming JSON-in/out tool contract (Push 2).

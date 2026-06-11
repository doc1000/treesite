# TreeSite Studio

Vite + React shell for editing and deploying TreeSite artifact bundles.

## Run locally

From the repo root:

```bash
npm --prefix studio install
npm --prefix studio run dev
```

Or use the root convenience script (if present): `npm run studio`.

The dev server defaults to port **5175**.

## Phase 1 scope

This package currently renders the app shell with sample manifest data only. The Studio bridge (artifact listing, tool passthrough, deploy) arrives in **Phase 2**.

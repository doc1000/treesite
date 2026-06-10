# Node tools

Scripts for content intake, inspection, and artifact export. Push 2 will standardize these behind a JSON-in / JSON-out tool contract (`tool-runner.js`, schema validation, structured errors).

## Layout

- Run commands from **`handler/`** via `npm run …` (see `handler/package.json`).
- `export-artifact.js` — one-time / manual export of legacy app content into an artifact directory bundle.
- `serve-artifact.js` — static HTTP server with CORS for local artifact testing.

## Export KnowAlgo bundle

```bash
node tools/node/export-artifact.js --source ./handler --dest ./artifacts/knowalgo --name knowalgo
```

(Run from repository root.)

## Serve an artifact locally

```bash
cd handler
npm run serve:artifact -- --dir ../artifacts/knowalgo --port 5199
```

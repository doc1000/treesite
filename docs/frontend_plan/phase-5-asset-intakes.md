# Phase 5 - Asset Intakes (PDF / Website / HTML)

Read [00-overview.md](00-overview.md) first (bridge upload flow, guardrails).

## Goal

Make asset-bearing content fully functional: add PDF cards (with generated preview), website cards (with screenshot), and HTML cards. This is the phase that proves the Studio can edit real content end to end, including assets.

## Prerequisites

- Phase 2 (bridge), Phase 3 (lifecycle), Phase 4 (edit/add cards) complete.

## Scope - tools used

Confirmed in source:
- `add-pdf` ([tools/node/add-pdf.js](../../tools/node/add-pdf.js)) - `{ name, section, sourcePath, description?, value? }`. `sourcePath` must be a server-resolvable local `.pdf`. The tool copies it into `assets/pdfs/` and renders a preview into `assets/previews/` via pdfjs.
- `add-website` - `{ name, section, url }`. Uses Playwright (handler devDependency) to capture a preview. No file upload needed.
- `add-html` ([tools/node/add-html.js](../../tools/node/add-html.js)) - `{ name, section, sourcePath? }` (HTML source). Stages under `assets/html/<slug>/`.

Because asset tools need a local file path, the browser must upload first, then the bridge passes the staged `tempPath` as `sourcePath`.

## Files to change

- `studio/server/toolBridge.mjs` - implement `POST /api/upload` (multipart -> temp file -> `{ tempPath }`). For convenience, add `POST /api/intake/:tool` that accepts multipart `{ file?, fields }`, stages the file, injects `sourcePath`, runs the tool, then deletes the temp file. Prefer a lightweight existing dependency for multipart parsing over hand-rolling; if none is acceptable, parse the stream minimally. Validate file type/size before invoking the tool.
- `studio/src/api/client.js` - add `addPdf(file, fields)`, `addWebsite(fields)`, `addHtml(file|html, fields)`.
- `studio/src/components/RightToolPanel.jsx` (or a new `AddAssetDialog.jsx`) - "Add Asset" actions on the selected section: choose PDF / Website / HTML; collect inputs (file for PDF/HTML, URL for website, name, section default = selected path); call the intake endpoint; refresh.
- Preview rendering: resolve asset paths against the deployed/served artifact base (use `serve-artifact.js` from Phase 3) so `previewImage` thumbnails display in the inspector.

## Steps

1. Implement upload/intake on the bridge; unit-check by adding a PDF to a scratch copy of `example` and confirming files land in `assets/pdfs/` + `assets/previews/` and a new `items/<slug>.json` is created.
2. Wire Add PDF in the UI (file input); confirm preview thumbnail shows after refresh.
3. Wire Add Website (URL only); confirm a website card with a screenshot preview (requires Playwright installed in `handler/`).
4. Wire Add HTML (paste or upload); confirm the html card and `assets/html/<slug>/` output.
5. Confirm `validate` stays green and the new cards render in Deploy (View).

## Done-when

- Adding a PDF, a website, and an HTML card all succeed from the UI and produce correct `items/` + `assets/` output.
- Previews display in the inspector and in the deployed handler view.
- Temp upload files are cleaned up; `validate` passes. No operational code modified (only the bridge adapter + UI).

## Notes / risks

- `add-website` depends on Playwright (`handler/` devDependency); if browsers aren't installed, surface the tool's error clearly rather than failing silently.
- Keep the intake endpoint a thin wrapper: stage file -> call existing tool -> return its result. Do not reimplement preview generation.

## Out of scope / next

- Rich HTML body editing flags (`--html-file`, `--txt-mode`, etc. from edit-card) can be a later enhancement; basic add-html is sufficient here. Keyboard/Joydrive polish is Phase 6.

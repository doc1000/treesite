TreeSite Concept

TreeSite is an experimental visual website architecture where the entire site structure is represented as a navigable treemap.

The project is not intended to behave like a traditional website menu or sitemap. Instead, the site itself becomes a spatial interface. Every section, subsection, page, asset, image, article, or document occupies territory within a dynamic treemap layout.

Users should feel like they are “moving through” a living information space rather than clicking through pages.

Core Design Philosophy

The visual style should feel:

calm
spatial
exploratory
cinematic
muted
tactile
information-dense without clutter

Avoid:

bright “Google dashboard” colors
corporate SaaS aesthetics
hard UI edges
noisy borders
heavy menus
excessive controls

Prefer:

softened muted palettes
rounded cards
glassmorphism/light atmospheric depth
subtle transitions
layered hierarchy
clean typography
quiet interaction design

The experience should feel somewhere between:

an operating system
a concept map
a design tool
a spatial knowledge graph
a living website blueprint
Main Map vs Mini Map
Main Map

The main map is the primary experience.

Each treemap tile is effectively a “mini-page”.

Tiles may contain:

titles
descriptive text
images
embedded HTML
cards
buttons
previews
future interactive content

The main map is intentionally rich and immersive.

The user should be able to zoom into sections and progressively reveal detail.

Treemap sizing is normalized:

boxes should remain relatively similar in size
avoid extremely skinny or dominant regions
preserve hierarchy without overwhelming scale differences

Current layout goals:

rounded rectangles
squarified treemap
mostly horizontal readable regions
muted colors
low visual noise
Mini Map

The minimap is intentionally abstract.

It is NOT a miniature version of the main content.

It only communicates:

hierarchy
spatial relationships
navigation
current focus region

The minimap should:

stay visually quiet
avoid clutter
avoid embedded text/images
avoid strong borders
avoid muddy overlapping colors

Top-level parent regions are transparent but clickable.

Child regions hold the visible color.

The minimap acts more like:

a navigation radar
a spatial locator
a territory overview
Architecture Direction

The project is moving toward a clean separation between:

Engine

Handles:

D3 treemap layout
zooming/navigation
minimap
geometry
rendering pipeline
Content

Handled separately through:

siteData.js
assets folders
template components
Templates

Reusable React components render tile content:

contact tiles
article tiles
service previews
image-heavy layouts
future embedded HTML content

The long-term goal is for TreeSite to ingest existing site content and transform it into a navigable treemap representation.

Content Intake Workflows

Content should be added through repeatable intake scripts rather than one-off agent edits to `siteData.js`.

The intended content structure is:

```txt
treesite-app/src/siteData.js                  // base tree plus generated item merge
treesite-app/src/generatedContentItems.js     // generated from item JSON
treesite-app/content/items/*.json             // one file per added item
treesite-app/scripts/add-pdf.js
treesite-app/scripts/add-website.js
treesite-app/scripts/add-card.js
treesite-app/scripts/edit-card.js
treesite-app/scripts/move-card.js
treesite-app/scripts/move-subtree.js
treesite-app/scripts/inspect-tree.js
```

Agents should help design and maintain the intake pathway, but the day-to-day process should be triggered by supplying the right inputs to scripts. This keeps adding PDFs and websites predictable, repeatable, and easy to turn into a future admin tool.

Run intake commands from the app directory:

```powershell
cd treesite-app
```

Generated cards are identified by `slug`. The slug is created from the title by default and is used by edit, rename, move, hide, and unhide commands. Prefer managing generated cards through these scripts instead of editing `siteData.js` directly.

`siteData.js` should now stay mostly structural: top-level sections, colors, and durable subsection containers. Leaf cards such as services, contact actions, PDFs, websites, and text entries should live in `content/items/*.json` so they can be managed by the intake scripts.

Add a Basic Card

Use this pathway for text cards, link cards, contact cards, or simple generated entries that do not need a PDF copy or website screenshot.

```powershell
npm run add:card -- --title "Office Hours" --section "Contact Me" --type "text" --description "A short note about availability."
```

Common card types:

- `text`: title and description only
- `link`: title, description, and a clickable URL
- `href`: title, description, and a clickable href
- `contact`: contact-style tile with one or more action links
- `pdf`: existing PDF-style card when the PDF URL/path is already known
- `website`: existing website-style card when a preview image already exists

Examples:

```powershell
npm run add:card -- --title "GitHub" --section "Contact Me" --type "link" --href "https://github.com/doc1000" --linkLabel "github.com/doc1000" --description "Explore public work."
```

```powershell
npm run add:card -- --title "Email" --section "Contact Me" --type "contact" --href "mailto:info@knowledgealgorithms.com" --linkLabel "info@knowledgealgorithms.com" --description "Reach out directly by email."
```

Edit a Card

Use `edit:card` to change fields on an existing generated card by slug.

```powershell
npm run edit:card -- --slug "office-hours" --description "Book time for AI workflow questions." --value 6
```

Rich HTML body (Markdown or plain text)

Use exactly **one** of these HTML sources on each run:

- **`--html`** — Raw HTML string, stored verbatim (same as before; no sanitization).
- **`--html-file`** — Path to a **`.txt`** or **`.md`** file (UTF-8). The file is converted to HTML and sanitized before storing on the card.
- **`--html-text`** — Inline body string with **`--format txt`** or **`--format md`** (required).

For **`--html-file`**, format is inferred from the extension (`.txt` / `.md`). Optional **`--format txt`** or **`--format md`** overrides inference (for example, Markdown stored in a non-standard filename).

For **`.txt`** conversion only, **`--txt-mode`** controls layout:

- **`paragraphs`** (default): blank-line-separated blocks become `<p>`; single newlines inside a block become `<br>`.
- **`pre`**: entire body is escaped and wrapped in `<pre>` (fixed line breaks, e.g. poetry).

Markdown is rendered with **`marked`** (GFM), then passed through **`sanitize-html`** with a strict allowlist (headings, lists, links limited to `http`/`https`/`mailto`, etc.).

Do **not** combine `--html`, `--html-file`, and `--html-text` on the same command.

Optional **`--html-font-size`** applies only to the rich HTML panel (**`tile-html-content`**): accepts values like **`14`**, **`14px`**, **`1rem`**, **`110%`**. Bare numbers are treated as **px**. Pass an empty value (**`--html-font-size ""`**) to remove a per-card override and fall back to the stylesheet default (**14px**).

Examples:

```powershell
npm run edit:card -- --slug "a-poem-about-work" --html-file ".\poem.txt" --txt-mode pre --description "Short teaser for headers."
```

```powershell
npm run edit:card -- --slug "readme-blurb" --html-text "## Hello`n`n[Example](https://example.com)" --format md --description "Promo copy."
```

Typical flow: **`npm run add:card`** for the card, then **`npm run edit:card`** with `--html-file` or `--html-text` to attach the rich body.

Troubleshooting add/edit cards

- **Run commands from `treesite-app`** (`cd treesite-app`). Paths like `./content/snippets/foo.md` resolve from that directory.
- **`slug`** comes from the title via `slugify` (e.g. “Process Pillars” → `process-pillars`). Use `npm run inspect:tree -- --text` to confirm names and slugs.
- **Rich HTML does not show on tiny tiles**: CSS hides `.tile-html-content` when the tile is small; zoom in or use a larger cell to see Markdown/HTML bodies.
- **`--html-file` format**: Extension **`.md`** uses Markdown + sanitization; **`.txt`** uses plain-text conversion only (`###` is literal text, not a heading). On Windows, **`notes.md.txt`** is still **`.txt`** to the OS—infer picks **`txt`** unless you pass **`--format md`**.
- **Markdown looks “broken” but uses `.md`**: Check for **backslash escapes** in the file (`\###`, `\*\*foo\*\*`). Those force literal `#` and `*`. Remove the `\` characters. Headings need **`### Title`** (space after hashes). Bold works best as **`**bold**`** without a space immediately after the opening `**`.
- **Whitespace in Markdown**: Normal rules apply—single newlines often merge; use blank lines between blocks, two trailing spaces or `<br>` for hard breaks, or use **`--format txt`** + **`--txt-mode`** when spacing matters more than Markdown.
- **Sanitized Markdown**: Tables, images, `<hr>`, and many tags are stripped after render for safety—only the documented allowlist survives.
- **`description` vs header**: Tile descriptions use line clamping; long copy belongs in **`html`** / **`--html-file`**. The focus strip uses SVG text for descriptions and does not wrap like HTML paragraphs.

Reorder sections and sibling cards

- **Leaf cards** (PDFs, websites, text cards, etc.): raise or lower priority with **`npm run edit:card -- --slug "<slug>" --value <number>`** (larger → earlier among siblings under the same parent).
- **Explicit section rows** in `content/items/` (`type: "section"`, slugs like `sec-services`): same **`--value`** via **`edit:card`**—those rows compete with other siblings at that depth.
- **Placeholders only**: Intermediate folders created automatically for paths still default to **`value: 1`** until you add or edit a **`section`** item that targets that path—otherwise siblings with equal **`value`** order by name only.
- **Inspect**: **`npm run inspect:tree -- --text`** prints the merged tree with **`v=`** values so you can see ordering inputs.
- **`move:card`** changes **which section** a card lives under; it does **not** set sibling rank—use **`--value`** for rank within the new parent’s children.

Rename a Card (slug, display name, and treemap)

Use `rename:card` to change the **file** `content/items/<slug>.json`, the card’s **`slug`** field (used when merging into the tree), and optionally **`--name`** / **`--title`** or other fields accepted by `edit:card`. The script runs **`rebuild:site-data`** so `src/generatedContentItems.js` and the treemap stay in sync.

```powershell
npm run rename:card -- --from "hero-statement" --to "hero-tagline" --name "Hero tagline"
```

- **`--from`** (required): current slug (existing JSON basename without `.json`).
- **`--to`** or **`--new-slug`**: new slug; passed through `slugify`. Omit to keep the same slug and only update other flags (e.g. `--name`).
- **`--rewrite-paths`** `false`: skip rewriting `/assets/...` strings that contain the old slug (default rewrites `previewImage`, `pdf`, `image`, `source` under `/assets/`).

Rename any physical files under `public/assets/` if their filenames still use the old slug.

Move a Card

Use `move:card` to place a generated card under a different section.

```powershell
npm run move:card -- --slug "office-hours" --section "Services"
```

Move a subtree (reparent a section root and fix descendant paths)

Use **`move:subtree`** when an item is the root of a subtree and every descendant’s **`section`** path must be rewritten (nested sections follow that root).

```powershell
npm run move:subtree -- --slug "sec-projects" --under-section "Services"
```

- **`--slug`**: slug of the subtree root item (often a `section` row).
- **`--under-section`**: new parent section path (same convention as **`section`** on cards: e.g. **`Home`**, **`Services`**, **`Articles/Research`**).

Hide or Unhide a Card

Hidden cards stay in `content/items/` but are skipped when `siteData` is assembled.

```powershell
npm run hide:card -- --slug "office-hours"
npm run unhide:card -- --slug "office-hours"
```

Add a PDF

Use this pathway when adding a local PDF document.

```powershell
npm run add:pdf -- --file "C:\path\paper.pdf" --section "Articles/Research" --title "Divariance"
```

The PDF intake script should:

- copy the PDF into `public/assets/pdfs/`
- generate a first-page preview image into `public/assets/previews/`
- create one JSON item file in `content/items/`
- rebuild `src/generatedContentItems.js`

Example generated item:

```json
{
  "name": "Divariance",
  "slug": "divariance",
  "section": "Articles/Research",
  "type": "pdf",
  "description": "A research paper connecting Frechet and KL divergence.",
  "source": "/assets/pdfs/divariance.pdf",
  "pdf": "/assets/pdfs/divariance.pdf",
  "previewImage": "/assets/previews/divariance.png",
  "value": 8
}
```

Add a Website

Use this pathway when adding a web article, publication, or external page.

```powershell
npm run add:website -- --url "https://example.com" --section "Articles/Publications" --title "Example Article"
```

The website intake script should:

- capture a screenshot or preview image, eventually with Playwright
- save the preview image into `public/assets/previews/`
- create one JSON item file in `content/items/`
- rebuild `src/generatedContentItems.js`

Example generated item:

```json
{
  "name": "Pairwise Cross-Variance Classification",
  "slug": "pairwise-cross-variance-classification",
  "section": "Articles/Research",
  "type": "website",
  "description": "Zero-shot embedding classification article.",
  "source": "https://towardsdatascience.com/pairwise-cross-variance-classification/",
  "url": "https://towardsdatascience.com/pairwise-cross-variance-classification/",
  "previewImage": "/assets/previews/pairwise-cross-variance.png",
  "value": 8
}
```

Future Toolset Direction

A future admin UI or local toolset should write the same item JSON shape and call the same script or API layer. The scripts are the contract: UI tools, agents, and manual commands should all produce content through the same intake process.
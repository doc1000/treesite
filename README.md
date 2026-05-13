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
```

Agents should help design and maintain the intake pathway, but the day-to-day process should be triggered by supplying the right inputs to scripts. This keeps adding PDFs and websites predictable, repeatable, and easy to turn into a future admin tool.

Run intake commands from the app directory:

```powershell
cd treesite-app
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
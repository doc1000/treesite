# `@doc1000/treesite` package

The TreeSite engine (treemap layout, zoom navigation, mini map, breadcrumbs, search,
tile templates) lives in [`lib/`](../lib) and is published from the repository root as
the `@doc1000/treesite` package. `treesite-app/` is one site built on it; other sites
install it the same way.

## Install

The package is not on the npm registry. Install it from GitHub, pinned to a commit:

```sh
npm install github:doc1000/treesite#<commit-sha>
```

Pin a commit SHA rather than a branch so builds stay reproducible. If the branch the
SHA lives on is squash-merged, the SHA disappears from the default branch's history;
move the pin to the merged commit.

`react` and `react-dom` (18 or 19) are peer dependencies. The package ships source
(`.jsx`), so the consuming site needs a bundler that compiles JSX in dependencies;
Vite does this out of the box.

## Use

```jsx
import { TreeSite, applyContentItems, createNavMemory } from "@doc1000/treesite";
import "@doc1000/treesite/styles.css";

const root = { name: "Home", displayName: "My Site", description: "…", children: [] };
const siteData = applyContentItems(root, items); // items: flat card objects, see below
const navMemory = createNavMemory({ namespace: "mysite" });

export default function App() {
  return <TreeSite siteData={siteData} navMemory={navMemory} />;
}
```

`styles.css` sets page-level rules (`body`, `#root`) for a full-screen map. Pages that
only need the navigation widgets import `@doc1000/treesite/navigation.css` instead.

## Content items

`applyContentItems(root, items)` turns a flat list of cards into the tree. Each item:

| Field | Meaning |
| --- | --- |
| `name` | Tile title; also the path segment other items use in `section`. |
| `slug` | Stable id. Deep links are `#/card/<slug>`; the visited trail stores slugs. |
| `section` | Parent path, e.g. `"Services"` or `"Services/Workshops"`. |
| `type` | `section`, `text`, `link`, `contact`, `pdf`, `website`, `htmlCard`, or `article`. |
| `description` | Short text on the tile. |
| `body` | Optional long-form HTML shown in a readable article view when the card is opened. |
| `order` | Optional. Siblings with `order` sort ascending, before siblings without it. |
| `static` | Optional. `true`/`false` overrides blurb detection (see below). |
| `value` | Weight for tile size and, without `order`, sort order (larger first). |
| `links`, `url`, `previewImage`, `image`, `html`, `kicker`, `color`, `hidden` | As in the intake scripts (see the root README). |

`body` and `html` are inserted as HTML without sanitizing. Only pass content you
control; `treesite-app`'s `--html-file` intake path sanitizes for you.

Preview images and HTML cards can use relative paths, so a map served from a
subfolder (for example `/map/`) can point at `../assets/...`.

## `<TreeSite>` props

| Prop | Default | |
| --- | --- | --- |
| `siteData` | required | Tree root from `applyContentItems`. |
| `theme` | `"dark"` | `"dark"` or `"light"` chrome. Sets `data-theme` on the root element. |
| `onThemeChange` | none | When set, Settings shows a Light/Dark switch that calls it. |
| `colorSchemesBase` | `"/color-schemes"` | Folder with `index.json` and scheme files. |
| `colorSchemes` | none | `{ manifest, docs }` inline schemes; skips the fetch. `docs` maps id to scheme document. |
| `colorSchemeId` / `onColorSchemeIdChange` | uncontrolled | Control the tile palette, e.g. to tie it to `theme`. |
| `navMemory` | none | Shares the visited trail and navigation preferences with other views. |
| `sidebarHeader` | none | Extra controls at the top of the side panel (view switch, theme toggle…). |
| `spatialHelp` | built-in text | Body of the "Spatial Navigation" help panel. |
| `onFocusChange` | none | Called with the focused hierarchy node after each move. |
| `storageNamespace` | `"treesite"` | Prefix for the component's own localStorage keys. |
| `defaultTileMapLevel` | `2` | Nested previews inside parent tiles, 0 (none, cleanest) to 4 (full). The reader's own choice in Settings is remembered. |

## Navigation standards

These behaviors come with the package, so every site built on it navigates the same
way:

- **Tiles** are buttons: Tab moves between them, Enter or Space opens one, and focus
  moves into the opened region. Escape steps back out to the parent.
- **Blurbs** (a leaf card with no body, list, links, page or image) are read in place:
  the whole description shows on the tile, and the tile is not a button. Deep links,
  search results and the outline open the blurb's region instead, with the card
  highlighted.
- **Opened cards** show everything their tile shows (kicker, title, description, list
  and every link) plus any long-form `body`; HTML cards show that header above the page.
- **Breadcrumbs** show the path from Home to the current region; each crumb is a button.
- **Mini map**: an abstract map of the whole site with the current region outlined.
  Its targets are Home and the top-level sections (`targetDepth`, default 1): hovering
  or clicking a card inside a section acts on the section, so every target is large.
  It is one Tab stop; arrow keys move between targets, Home/End jump to the ends,
  Enter opens. "Larger mini map" doubles its height and widens the side panel for
  bigger targets. The choice is remembered.
- **Your path**: the last visited cards, drawn on the mini map as a gold trail and listed
  as buttons below it.
- **Outline**: the whole tree as a nested list of buttons, a text route to every card.
- **Search** matches slug, title, path and description.
- **Announcements**: each move is announced through a polite live region.
- **Reduced motion**: with `prefers-reduced-motion: reduce`, navigation jumps instead of
  animating and transitions are switched off.

## Navigation memory

`createNavMemory({ namespace, maxTrail = 12 })` keeps the trail and preferences in
localStorage under `<namespace>.*`, so another view of the same content (for example
a traditional scrolling page) can record and show the same path:

```js
const memory = createNavMemory({ namespace: "mysite" });
memory.visit("orchard-view");        // append a slug to the trail
memory.getTrail();                    // ["…", "orchard-view"]
memory.lastVisited();                 // "orchard-view"
memory.setPref("theme", "dark");      // any small string preference
memory.subscribe(change => { … });    // { type: "trail" | "pref", … }, also across tabs
```

Storage failures (private windows, blocked storage) fall back to in-memory state.

## Navigation outside the map

`<NavigatorPanel>` renders the mini map, breadcrumbs and visited trail for any page that
shares the same `siteData`:

```jsx
import { NavigatorPanel } from "@doc1000/treesite";
import "@doc1000/treesite/navigation.css";

<NavigatorPanel
  siteData={siteData}
  navMemory={memory}
  currentSlug="orchard-view"
  onSelect={node => { /* scroll to or open node.data.slug */ }}
/>
```

The lower-level `MiniMap`, `Breadcrumbs`, `VisitedTrail` and `OutlineNav` components
and `layoutMinimapTree(siteData)` are exported as well.

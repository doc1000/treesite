/**
 * One-time scaffold migration: emits type "section" JSON for each legacy folder row.
 * Safe to re-run: skips writing when target slug JSON already exists.
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  appRoot,
  contentItemPath,
  slugify,
  rebuildGeneratedContent,
  writeContentItem
} from "./content-utils.js";

/** Snapshot of legacy baseSiteData.children before migrate (Website → Home rename handled elsewhere). */
const LEGACY_SECTION_TREE = [
  {
    name: "Who I am",
    value: 40,
    color: "#5d8fb3",
    description:
      "The front door: positioning, story, credibility, and next action.",
    children: [
      {
        name: "Media",
        value: 10,
        description: "Portraits, short intro video, downloadable bio.",
        children: []
      }
    ]
  },
  {
    name: "Services",
    value: 52,
    color: "#8b79b8",
    description: "Primary offers and paths for prospective clients.",
    children: [
      {
        name: "Service Assets",
        value: 10,
        description: "Sales decks, scope examples, screenshots.",
        children: []
      }
    ]
  },
  {
    name: "Case Studies",
    value: 42,
    color: "#c58b78",
    description: "Outcome-driven stories showing transformation.",
    children: [
      {
        name: "Client A",
        value: 14,
        description: "Problem, approach, result, evidence.",
        children: []
      }
    ]
  },
  {
    name: "Articles",
    value: 58,
    color: "#6fa892",
    description:
      "Published research, toolkits, articles, and future writing ideas.",
    children: [
      {
        name: "Research",
        value: 18,
        description: "Technical research notes and papers.",
        children: []
      },
      {
        name: "Systems & Tooling",
        value: 16,
        description: "Practical build notes, teardown posts, and toolkits.",
        children: []
      },
      {
        name: "Publications",
        value: 16,
        description:
          "External articles, essays, and publication-ready writing.",
        children: []
      }
    ]
  },
  {
    name: "Contact Me",
    value: 30,
    color: "#c7ad72",
    description:
      "Need AI knowledge tools now? Reach out or schedule a call.",
    children: []
  }
];

async function collectTakenSlugs() {
  const dir = path.join(appRoot, "content", "items");
  const taken = new Set();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".json")) {
        taken.add(path.basename(e.name, ".json"));
      }
    }
  } catch {
    /* missing dir */
  }
  return taken;
}

function allocateSlug(baseSlug, taken) {
  let s = baseSlug;
  let i = 2;
  while (taken.has(s)) {
    s = `${baseSlug}-${i}`;
    i += 1;
  }
  taken.add(s);
  return s;
}

async function emitFolder(node, parentSectionField, trailParts, taken) {
  const slugBase = slugify(["sec", ...trailParts, node.name].join("-"));
  const slug = allocateSlug(slugBase || "sec-folder", taken);

  const itemPath = contentItemPath(slug);
  try {
    await fs.access(itemPath);
    console.log(`skip existing ${slug}.json`);
  } catch {
    const item = {
      name: node.name,
      slug,
      section: parentSectionField,
      type: "section",
      description: node.description || "",
      value: node.value ?? 8
    };
    if (node.color) item.color = node.color;

    await writeContentItem(slug, item);
    console.log(`wrote section ${slug} (${node.name})`);
  }

  const childTrail = [...trailParts, node.name];
  const childSectionField = childTrail.join("/");

  for (const child of node.children || []) {
    await emitFolder(child, childSectionField, childTrail, taken);
  }
}

async function main() {
  const taken = await collectTakenSlugs();

  for (const rootChild of LEGACY_SECTION_TREE) {
    await emitFolder(rootChild, "Home", [], taken);
  }

  const count = await rebuildGeneratedContent();
  console.log(`Rebuilt generated content with ${count} items.`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exitCode = 1;
});

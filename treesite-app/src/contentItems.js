/** Minimal tree root merged with flat JSON items from content/items. */
export const minimalSiteRoot = {
  name: "Home",
  description: "Full sitemap view.",
  children: []
};

function cloneNode(node) {
  return {
    ...node,
    children: node.children?.map(cloneNode)
  };
}

function sectionParts(section, rootName) {
  return section
    .split("/")
    .map(part => part.trim())
    .filter(Boolean)
    .filter((part, index) => !(index === 0 && part === rootName));
}

function ensureChild(parent, name) {
  parent.children ||= [];

  let child = parent.children.find(candidate => candidate.name === name);
  if (!child) {
    child = {
      name,
      value: 1,
      description: `Generated content section for ${name}.`,
      children: []
    };
    parent.children.push(child);
  }

  return child;
}

function findOrCreateSection(root, section, rootName) {
  return sectionParts(section, rootName).reduce(ensureChild, root);
}

function compareSiblingOrder(a, b) {
  const vb = Number(b.value) || 1;
  const va = Number(a.value) || 1;
  if (vb !== va) return vb - va;
  return String(a.name || "").localeCompare(String(b.name || ""));
}

function sortChildrenDeep(node) {
  if (!node.children?.length) return;
  node.children.sort(compareSiblingOrder);
  node.children.forEach(sortChildrenDeep);
}

function sectionParentDepth(section, rootName) {
  return sectionParts(section, rootName).length;
}

function normalizeSectionItem(item) {
  const title = item.title || item.name;
  return {
    type: "section",
    name: item.name,
    slug: item.slug,
    section: item.section,
    description: item.description ?? "",
    value: item.value ?? 8,
    generated: true,
    title,
    ...(item.color !== undefined ? { color: item.color } : {}),
    ...(item.hidden !== undefined ? { hidden: item.hidden } : {}),
    ...(item.kicker !== undefined ? { kicker: item.kicker } : {})
  };
}

function normalizeItem(item) {
  if (item.type === "section") {
    return normalizeSectionItem(item);
  }

  const title = item.title || item.name;
  const isPdf = item.type === "pdf";
  const isHtmlCard = item.type === "htmlCard";
  const isLink = ["link", "href", "contact"].includes(item.type);
  const url = isPdf
    ? item.pdf || item.source
    : isHtmlCard
      ? item.source || item.html
      : item.href || item.url || item.source;
  const label = isPdf ? "Open PDF" : isHtmlCard ? "Open page" : "Open site";
  const slug = item.slug;
  const links = item.links || (url ? [{ label: item.linkLabel || label, href: url }] : undefined);

  return {
    ...item,
    generated: true,
    name: item.name,
    slug,
    title,
    value: item.value || 8,
    pdf: isPdf ? url : item.pdf,
    template: item.template || (item.type === "contact" ? "contact" : undefined),
    url: isLink ? undefined : url,
    kicker:
      item.kicker ||
      (isPdf ? "PDF" : item.type === "website" ? "Website" : isHtmlCard ? "HTML" : undefined),
    links
  };
}

function attachSectionChild(parent, node) {
  parent.children ||= [];
  const slugIdx = parent.children.findIndex(
    c => Boolean(c.generated && node.slug && c.slug === node.slug)
  );
  const nameIdx = parent.children.findIndex(c => c.name === node.name);
  const idx = slugIdx >= 0 ? slugIdx : nameIdx >= 0 ? nameIdx : -1;

  if (idx >= 0) {
    const prev = parent.children[idx];
    parent.children[idx] = {
      ...node,
      children: prev.children?.length ? prev.children : []
    };
    return;
  }

  parent.children.push({ ...node, children: [] });
}

function attachLeafChild(parent, node) {
  parent.children ||= [];
  const existingIndex = parent.children.findIndex(child =>
    Boolean(child.generated && child.slug && node.slug && child.slug === node.slug)
  );

  if (existingIndex >= 0) parent.children[existingIndex] = node;
  else parent.children.push(node);
}

export function applyContentItems(siteData, items, rootName = siteData.name) {
  const next = cloneNode(siteData);

  const sections = [];
  const leaves = [];

  for (const item of items) {
    if (item.hidden) continue;
    if (item.type === "section") sections.push(item);
    else leaves.push(item);
  }

  sections.sort((a, b) => {
    const da = sectionParentDepth(a.section, rootName);
    const db = sectionParentDepth(b.section, rootName);
    if (da !== db) return da - db;
    const vb = Number(b.value) || 1;
    const va = Number(a.value) || 1;
    if (vb !== va) return vb - va;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  for (const item of sections) {
    const parent = findOrCreateSection(next, item.section, rootName);
    attachSectionChild(parent, normalizeSectionItem(item));
  }

  for (const item of leaves) {
    const parent = findOrCreateSection(next, item.section, rootName);
    attachLeafChild(parent, normalizeItem(item));
  }

  sortChildrenDeep(next);
  return next;
}

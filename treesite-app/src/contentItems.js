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

function findOrCreateSection(root, section) {
  return sectionParts(section, root.name).reduce(ensureChild, root);
}

function normalizeItem(item) {
  const title = item.title || item.name;
  const isPdf = item.type === "pdf";
  const isLink = ["link", "href", "contact"].includes(item.type);
  const url = isPdf ? item.pdf || item.source : item.href || item.url || item.source;
  const label = isPdf ? "Open PDF" : "Open site";
  const slug = item.slug;
  const links = item.links || (url ? [
    {
      label: item.linkLabel || label,
      href: url
    }
  ] : undefined);

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
    kicker: item.kicker || (isPdf ? "PDF" : item.type === "website" ? "Website" : undefined),
    links
  };
}

export function applyContentItems(siteData, items) {
  const next = cloneNode(siteData);

  for (const item of items) {
    if (item.hidden) continue;

    const parent = findOrCreateSection(next, item.section);
    const node = normalizeItem(item);
    const existingIndex = parent.children.findIndex(child => {
      return Boolean(child.generated && child.slug && node.slug && child.slug === node.slug);
    });

    if (existingIndex >= 0) {
      parent.children[existingIndex] = node;
    } else {
      parent.children.push(node);
    }
  }

  return next;
}

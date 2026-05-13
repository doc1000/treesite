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
  const url = isPdf ? item.pdf || item.source : item.url || item.source;
  const label = isPdf ? "Open PDF" : "Open site";

  return {
    ...item,
    name: item.name,
    title,
    value: item.value || 8,
    pdf: isPdf ? url : item.pdf,
    url,
    kicker: item.kicker || (isPdf ? "PDF" : "Website"),
    links: item.links || [
      {
        label,
        href: url
      }
    ]
  };
}

export function applyContentItems(siteData, items) {
  const next = cloneNode(siteData);

  for (const item of items) {
    const parent = findOrCreateSection(next, item.section);
    const node = normalizeItem(item);
    const existingIndex = parent.children.findIndex(child => {
      return child.name === node.name || child.slug === node.slug;
    });

    if (existingIndex >= 0) {
      parent.children[existingIndex] = node;
    } else {
      parent.children.push(node);
    }
  }

  return next;
}

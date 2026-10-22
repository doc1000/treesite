/** Display label for a hierarchy node (root shows "Home"). */
export function nodeLabel(d) {
  if (!d) return "";
  if (d.depth === 0) return "Home";
  return d.data.name;
}

/** "Section › Card" path label used for screen readers and tooltips. */
export function nodePathLabel(d) {
  return d
    .ancestors()
    .reverse()
    .map(nodeLabel)
    .join(" › ");
}

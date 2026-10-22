import * as d3 from "d3";
import { compareSiblingOrder } from "./contentItems.js";

export function displayWeight(d) {
  const raw = Math.max(1, d.value || 1);
  return d.children ? 0 : 1 + Math.log1p(raw) * 0.65;
}

export function siblingSortComparator(a, b) {
  return compareSiblingOrder(a.data, b.data);
}

function leafSumWeight(isMobile, d) {
  if (d.children) return 0;
  return isMobile ? 1 : displayWeight(d);
}

function desktopTreemapPaddingTop(d, showImmediateChildren) {
  if (d.depth === 0) return 0;
  if (
    showImmediateChildren &&
    d.depth === 1 &&
    d.children &&
    d.children.length > 0
  ) {
    return 62;
  }
  return 18;
}

/**
 * Mutates hierarchy: sets `.sum` and runs treemap partition.
 */
export function runTreemapLayout(hierarchy, sizeW, sizeH, { isMobile, showImmediateChildren }) {
  hierarchy.sum(d => leafSumWeight(isMobile, d));
  const tm = d3.treemap().size([sizeW, sizeH]).round(true);

  if (isMobile) {
    tm.tile(d3.treemapSlice)
      .paddingInner(6)
      .paddingOuter(6)
      .paddingTop(d => (d.children ? 32 : 0));
  } else {
    tm.tile(d3.treemapSquarify.ratio(1.2))
      .paddingInner(2)
      .paddingOuter(2)
      .paddingTop(d => desktopTreemapPaddingTop(d, showImmediateChildren));
  }

  tm(hierarchy);
}

/** Sets `fullName` ("Home / Section / Card") on every node. */
export function assignFullNames(root) {
  root.each(d => {
    d.fullName = d.ancestors().reverse().map(x => x.data.name).join(" / ");
  });
  return root;
}

/**
 * Squarified layout of the whole tree for a mini map, independent of the main map.
 * `width`/`height` only set the aspect ratio; the mini map scales it to fit.
 */
export function layoutMinimapTree(siteData, { width = 1200, height = 720 } = {}) {
  const r = d3.hierarchy(siteData).sort(siblingSortComparator);
  runTreemapLayout(r, width, height, { isMobile: false, showImmediateChildren: true });
  return assignFullNames(r);
}

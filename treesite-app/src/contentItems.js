/**
 * App-side content root. The merge logic lives in the TreeSite package (`lib/contentItems.js`);
 * this module keeps the existing import path for the intake scripts.
 */
export * from "../../lib/contentItems.js";

/** Minimal tree root merged with flat JSON items from content/items. */
export const minimalSiteRoot = {
  name: "Home",
  displayName: "Knowledge Algorithms",
  description: "Unify data.  Evaluate models.  Visualize results.",
  children: []
};

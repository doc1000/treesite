import { applyContentItems, minimalSiteRoot } from "./contentItems.js";
import { generatedContentItems } from "./generatedContentItems";

export const siteData = applyContentItems(minimalSiteRoot, generatedContentItems);

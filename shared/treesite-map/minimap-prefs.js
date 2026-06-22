export const STORAGE_NAV_MODE = "treesite.minimap.navMode";
export const STORAGE_LABEL_MODE = "treesite.minimap.labelMode";

export const NAV_MODES = ["explore", "click-jump"];
export const LABEL_MODES = ["hover", "select", "off"];

export function readMinimapNavMode() {
  try {
    const v = localStorage.getItem(STORAGE_NAV_MODE);
    if (NAV_MODES.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return "explore";
}

export function writeMinimapNavMode(mode) {
  try {
    localStorage.setItem(STORAGE_NAV_MODE, mode);
  } catch {
    /* ignore */
  }
}

export function readMinimapLabelMode() {
  try {
    const v = localStorage.getItem(STORAGE_LABEL_MODE);
    if (LABEL_MODES.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return "hover";
}

export function writeMinimapLabelMode(mode) {
  try {
    localStorage.setItem(STORAGE_LABEL_MODE, mode);
  } catch {
    /* ignore */
  }
}

/** Returns true when `path` should be resolved against the artifact base URL. */
export function isArtifactRelativePath(path) {
  if (path == null || typeof path !== "string") return false;
  const t = path.trim();
  if (!t) return false;
  if (t.startsWith("/") || t.startsWith("http://") || t.startsWith("https://")) return false;
  return true;
}

/**
 * Resolve asset / resource paths for the active artifact.
 * Artifact-relative paths are prefixed with `artifactBase`.
 * Legacy handler paths `/assets/...` are also mapped under the artifact base.
 */
export function resolveArtifactUrl(artifactBase, path) {
  if (path == null || typeof path !== "string") return path;
  const t = path.trim();
  if (!t) return path;

  const base = String(artifactBase || "/artifact").replace(/\/$/, "");

  if (isArtifactRelativePath(t)) {
    return `${base}/${t.replace(/^\/+/, "")}`;
  }

  if (t.startsWith("/assets/")) {
    return `${base}${t}`;
  }

  return t;
}

/** Resolve href fields on link objects for tile actions. */
export function resolveArtifactLink(artifactBase, link) {
  if (!link || typeof link !== "object") return link;
  if (typeof link.href !== "string") return link;
  return { ...link, href: resolveArtifactUrl(artifactBase, link.href) };
}

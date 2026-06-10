export const CURRENT_SCHEMA_VERSION = 1;
export const SUPPORTED_SCHEMA_VERSIONS = [1];

function normalizeBase(base) {
  return String(base || "/artifact").replace(/\/$/, "");
}

/** Priority: ?artifact= query param → VITE_ARTIFACT_BASE → /artifact */
export function resolveArtifactBase() {
  if (typeof window !== "undefined") {
    const fromQuery = new URLSearchParams(window.location.search).get("artifact");
    if (fromQuery && fromQuery.trim()) {
      return normalizeBase(fromQuery.trim());
    }
  }

  const fromEnv = import.meta.env.VITE_ARTIFACT_BASE;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return normalizeBase(fromEnv.trim());
  }

  return "/artifact";
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`artifact.json: missing or invalid "${field}".`);
  }
  return value.trim();
}

function validateArtifactMeta(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("artifact.json must be a JSON object.");
  }

  const schemaVersion = raw.schemaVersion;
  if (!Number.isInteger(schemaVersion)) {
    throw new Error("artifact.json: schemaVersion must be an integer.");
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
    throw new Error(
      `This artifact uses schemaVersion ${schemaVersion} which is not supported by this handler (supports: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}).`
    );
  }

  if (schemaVersion < CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `This artifact needs migration (schemaVersion ${schemaVersion}; current is ${CURRENT_SCHEMA_VERSION}). Run the migrate tool.`
    );
  }

  return {
    name: requiredString(raw.name, "name"),
    schemaVersion,
    displayName: requiredString(raw.displayName, "displayName"),
    tagline: requiredString(raw.tagline, "tagline"),
    defaultSchemeId: requiredString(raw.defaultSchemeId, "defaultSchemeId")
  };
}

/**
 * @returns {Promise<{ meta: object, siteData: object, artifactBase: string }>}
 */
export async function loadArtifactBundle(artifactBase) {
  const base = normalizeBase(artifactBase);

  let metaRes;
  let manifestRes;
  try {
    [metaRes, manifestRes] = await Promise.all([
      fetch(`${base}/artifact.json`),
      fetch(`${base}/manifest.json`)
    ]);
  } catch {
    throw new Error(`Could not load artifact from ${base}.`);
  }

  if (!metaRes.ok) {
    throw new Error(`Could not load artifact from ${base} (artifact.json ${metaRes.status}).`);
  }
  if (!manifestRes.ok) {
    throw new Error(`Could not load artifact from ${base} (manifest.json ${manifestRes.status}).`);
  }

  const metaRaw = await metaRes.json();
  const meta = validateArtifactMeta(metaRaw);
  const manifest = await manifestRes.json();

  if (!manifest || typeof manifest !== "object") {
    throw new Error("manifest.json must be a JSON object.");
  }

  const siteData = {
    ...manifest,
    name: manifest.name || "Home",
    displayName: meta.displayName,
    description: meta.tagline
  };

  return { meta, siteData, artifactBase: base };
}

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { slugify } from "./content-utils.js";
import { ErrorCodes } from "./error-codes.js";
import { fail, parseToolArgs, rebuildManifest, success, writeItem } from "./tool-runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const EXAMPLE_SCHEMES = path.join(REPO_ROOT, "artifacts", "example", "schemes");

async function copySchemes(destArtifactPath) {
  await fs.cp(EXAMPLE_SCHEMES, path.join(destArtifactPath, "schemes"), { recursive: true });
}

async function main() {
  const { artifactPath: destParent, input } = await parseToolArgs();

  const rawName = typeof input.name === "string" ? input.name.trim() : "";
  const displayName =
    typeof input.displayName === "string" && input.displayName.trim()
      ? input.displayName.trim()
      : rawName;
  const tagline =
    typeof input.tagline === "string" && input.tagline.trim()
      ? input.tagline.trim()
      : "Click anywhere to enter.";

  if (!rawName) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include non-empty "name".');

  const dirName = slugify(rawName);
  if (!dirName) {
    fail(1, ErrorCodes.INVALID_INPUT, "Could not derive a safe artifact directory name.");
  }

  const artifactPath = path.resolve(destParent, dirName);
  try {
    await fs.access(artifactPath);
    fail(1, ErrorCodes.INVALID_INPUT, `Artifact "${dirName}" already exists.`);
  } catch {
    /* ok — does not exist */
  }

  await fs.mkdir(path.join(artifactPath, "items"), { recursive: true });
  await fs.mkdir(path.join(artifactPath, "assets", "previews"), { recursive: true });
  await fs.mkdir(path.join(artifactPath, "migrations"), { recursive: true });
  await copySchemes(artifactPath);

  const artifactMeta = {
    name: dirName,
    schemaVersion: 1,
    displayName,
    tagline,
    defaultSchemeId: "content-default",
  };
  await fs.writeFile(
    path.join(artifactPath, "artifact.json"),
    `${JSON.stringify(artifactMeta, null, 2)}\n`,
  );

  const welcomeId = randomUUID();
  const welcomeItem = {
    id: welcomeId,
    name: "Welcome",
    slug: "welcome",
    section: "Home",
    type: "text",
    description: tagline,
    entryGate: true,
    value: 24,
  };
  await writeItem(artifactPath, welcomeItem);
  await rebuildManifest(artifactPath);

  success({
    name: dirName,
    displayName,
    itemCount: 1,
    schemaVersion: 1,
    entryGateItemId: welcomeId,
  });
}

main().catch((err) => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

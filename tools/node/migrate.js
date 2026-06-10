import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ErrorCodes } from "./error-codes.js";
import {
  KNOWN_SCHEMA_VERSION,
  fail,
  loadArtifact,
  parseToolArgs,
  rebuildManifest,
  success
} from "./tool-runner.js";

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const meta = await loadArtifact(artifactPath);
  const fromVersion = meta.schemaVersion;
  const targetVersion =
    typeof input.targetVersion === "number" && input.targetVersion >= 1
      ? Math.floor(input.targetVersion)
      : KNOWN_SCHEMA_VERSION;

  if (fromVersion > targetVersion) {
    fail(1, ErrorCodes.INVALID_INPUT, "targetVersion cannot be below current schemaVersion.");
  }

  if (fromVersion === targetVersion) {
    success({
      fromVersion,
      toVersion: targetVersion,
      stepsRun: [],
      manifestRebuilt: false
    });
    return;
  }

  const stepsRun = [];
  let version = fromVersion;

  while (version < targetVersion) {
    const scriptName = `v${version}_to_v${version + 1}.js`;
    const scriptPath = path.join(artifactPath, "migrations", scriptName);
    if (!(await pathExists(scriptPath))) {
      fail(3, ErrorCodes.MIGRATION_FAILED, `Missing migration script ${scriptName}.`, {
        rollbackNote: "Restore artifact.json schemaVersion manually if partially migrated."
      });
    }

    try {
      const mod = await import(pathToFileURL(scriptPath).href);
      if (typeof mod.migrate !== "function") {
        throw new Error(`${scriptName} must export async function migrate(artifactPath).`);
      }
      await mod.migrate(artifactPath);
      stepsRun.push(scriptName);
      version += 1;

      meta.schemaVersion = version;
      await fs.writeFile(
        path.join(artifactPath, "artifact.json"),
        `${JSON.stringify(meta, null, 2)}\n`
      );
    } catch (err) {
      fail(3, ErrorCodes.MIGRATION_FAILED, `Migration step ${scriptName} failed.`, {
        cause: String(err),
        rollbackNote: "Fix data manually and reset schemaVersion before retrying."
      });
    }
  }

  await rebuildManifest(artifactPath);

  success({
    fromVersion,
    toVersion: targetVersion,
    stepsRun,
    manifestRebuilt: true
  });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

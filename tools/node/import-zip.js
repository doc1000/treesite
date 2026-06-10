import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ErrorCodes } from "./error-codes.js";
import {
  fail,
  loadArtifact,
  loadItems,
  parseToolArgs,
  success
} from "./tool-runner.js";
import { extractZipToDirectory } from "./zip-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function runValidate(artifactPath) {
  const script = path.join(__dirname, "validate.js");
  const result = spawnSync(
    process.execPath,
    [script, "--artifact", artifactPath, "--input", JSON.stringify({ strict: false })],
    { encoding: "utf8" }
  );
  const stdout = (result.stdout || "").trim();
  if (!stdout) {
    fail(2, ErrorCodes.ARTIFACT_MALFORMED, "Validation produced no output.");
  }
  let json;
  try {
    json = JSON.parse(stdout.split("\n").at(-1));
  } catch {
    fail(2, ErrorCodes.ARTIFACT_MALFORMED, "Validation returned invalid JSON.");
  }
  if (!json.ok) {
    const err = json.error || {};
    fail(
      result.status || 2,
      err.code || ErrorCodes.ARTIFACT_MALFORMED,
      err.message || "Artifact validation failed.",
      err.details || {}
    );
  }
  if (!json.data?.valid) {
    const code =
      (json.data?.errors || []).some(e => e.code === ErrorCodes.DUPLICATE_ID)
        ? ErrorCodes.DUPLICATE_ID
        : ErrorCodes.ARTIFACT_MALFORMED;
    fail(2, code, "Artifact validation failed.", {
      errors: json.data?.errors || []
    });
  }
}

async function checkDuplicateIds(artifactPath) {
  const items = await loadItems(artifactPath);
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) {
      fail(2, ErrorCodes.DUPLICATE_ID, `Duplicate id '${item.id}' in artifact.`, {
        itemId: item.id
      });
    }
    seen.add(item.id);
  }
  return items;
}

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const srcRaw = input.srcZip;
  if (typeof srcRaw !== "string" || !srcRaw.trim()) {
    fail(1, ErrorCodes.INVALID_INPUT, 'Input must include non-empty "srcZip".');
  }

  const destDir = path.resolve(artifactPath);
  const overwrite = input.overwrite === true;
  const srcZip = path.resolve(String(srcRaw).trim());

  if (!(await pathExists(srcZip))) {
    fail(2, ErrorCodes.ARTIFACT_NOT_FOUND, `Zip file not found: ${srcZip}`);
  }

  if ((await pathExists(destDir)) && !overwrite) {
    fail(4, ErrorCodes.FILESYSTEM_ERROR, `Destination already exists: ${destDir}`);
  }

  if (overwrite && (await pathExists(destDir))) {
    await fs.rm(destDir, { recursive: true, force: true });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "treesite-import-"));
  try {
    await extractZipToDirectory(srcZip, tempDir);
    runValidate(tempDir);
    const items = await checkDuplicateIds(tempDir);
    const meta = await loadArtifact(tempDir);

    await fs.rename(tempDir, destDir);

    success({
      artifactPath: destDir,
      itemCount: items.length,
      schemaVersion: meta.schemaVersion
    });
  } catch (err) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
  }
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ErrorCodes } from "./error-codes.js";
import { fail, loadArtifact, parseToolArgs, success } from "./tool-runner.js";
import { writeArtifactZip } from "./zip-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    fail(2, ErrorCodes.ARTIFACT_MALFORMED, "Artifact validation failed.", {
      errors: json.data?.errors || []
    });
  }
}

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  const destRaw = input.destZip ?? input.destZipPath;
  if (typeof destRaw !== "string" || !destRaw.trim()) {
    fail(1, ErrorCodes.INVALID_INPUT, 'Input must include non-empty "destZip".');
  }

  const srcDir = artifactPath;
  await loadArtifact(srcDir);
  runValidate(srcDir);

  const destZip = path.resolve(String(destRaw).trim());
  const { sizeBytes, sha256 } = await writeArtifactZip(srcDir, destZip);

  success({
    zipPath: destZip,
    sizeBytes,
    sha256
  });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});

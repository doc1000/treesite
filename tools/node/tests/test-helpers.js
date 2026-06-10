import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";

const toolsRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.join(toolsRoot, "..", "..");
export const exampleArtifact = path.join(repoRoot, "artifacts", "example");

export async function copyArtifactToTemp() {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), "treesite-artifact-"));
  await fs.cp(exampleArtifact, dest, { recursive: true });
  return dest;
}

export function runTool(toolName, artifactPath, input = undefined, extraArgs = []) {
  const script = path.join(toolsRoot, `${toolName}.js`);
  const args = ["--artifact", artifactPath, ...extraArgs];
  if (input !== undefined) {
    args.push("--input", JSON.stringify(input));
  }

  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_PATH: path.join(repoRoot, "handler", "node_modules")
    }
  });

  let json = null;
  const stdout = (result.stdout || "").trim();
  if (stdout) {
    try {
      json = JSON.parse(stdout.split("\n").at(-1));
    } catch {
      json = null;
    }
  }

  return { ...result, json, stdout, stderr: result.stderr || "" };
}

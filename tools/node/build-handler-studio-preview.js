/**
 * Build handler/dist with base /preview/ for Studio in-process preview.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const handlerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../handler");

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vite", "build"],
  {
    cwd: handlerRoot,
    stdio: "inherit",
    env: { ...process.env, TREESITE_HANDLER_BASE: "/preview/" },
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);

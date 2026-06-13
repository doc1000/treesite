import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

export function spawnDetachedNode(scriptPath, scriptArgs) {
  const proc = spawn(process.execPath, [scriptPath, ...scriptArgs], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  proc.unref();
  return proc;
}

/** Kill process and descendants (taskkill /T on Windows). */
export function killProcessTree(pid) {
  if (pid == null || !Number.isFinite(Number(pid))) return;
  const n = Number(pid);
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(n), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-n, "SIGTERM");
  } catch {
    try {
      process.kill(n, "SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

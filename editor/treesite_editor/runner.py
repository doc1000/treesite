from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path
from typing import Any

from treesite_editor.config import TreeSiteConfig, find_repo_root, get_config
from treesite_editor.errors import raise_for_tool_error
from treesite_editor.logging_config import configure_logging, get_logger

configure_logging(get_config().log_level)
log = get_logger(__name__)


def _tool_script(tools_dir: Path, tool_name: str) -> Path:
    script = tools_dir / f"{tool_name}.js"
    if not script.is_file():
        raise FileNotFoundError(f"Node tool not found: {script}")
    return script


def run_tool(
    tool_name: str,
    artifact: str | Path,
    input_data: dict[str, Any] | None = None,
    *,
    config: TreeSiteConfig | None = None,
) -> dict[str, Any]:
    """
    Run tools/node/<tool-name>.js with --artifact and JSON stdin.
    Returns parsed JSON output dict.
    """
    cfg = config or get_config()
    repo_root = find_repo_root()
    tools_dir = cfg.resolve_tools_dir(repo_root)
    artifact_path = cfg.resolve_artifact(str(artifact), repo_root)
    script = _tool_script(tools_dir, tool_name)

    payload = input_data if input_data is not None else {}
    stdin_bytes = json.dumps(payload).encode("utf-8")

    cmd = [
        cfg.node_bin,
        str(script),
        "--artifact",
        str(artifact_path),
    ]

    started = time.perf_counter()
    try:
        completed = subprocess.run(
            cmd,
            input=stdin_bytes,
            capture_output=True,
            timeout=cfg.tool_timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.error(
            "tool_error",
            log_event="tool_error",
            tool=tool_name,
            artifact=str(artifact_path),
            elapsed_ms=elapsed_ms,
            error_code="TIMEOUT",
            message="Tool subprocess timed out.",
        )
        raise TimeoutError(f"Tool {tool_name} timed out after {cfg.tool_timeout_seconds}s") from exc

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    stderr_text = completed.stderr.decode("utf-8", errors="replace").strip()
    if stderr_text:
        log.debug("tool_stderr", tool=tool_name, stderr=stderr_text)

    stdout_text = completed.stdout.decode("utf-8", errors="replace").strip()
    if not stdout_text:
        log.error(
            "tool_error",
            log_event="tool_error",
            tool=tool_name,
            artifact=str(artifact_path),
            elapsed_ms=elapsed_ms,
            error_code="NO_OUTPUT",
            message="Tool produced no stdout.",
        )
        raise RuntimeError(f"Tool {tool_name} produced no output (exit {completed.returncode}).")

    try:
        result = json.loads(stdout_text.splitlines()[-1])
    except json.JSONDecodeError as exc:
        log.error(
            "tool_error",
            log_event="tool_error",
            tool=tool_name,
            artifact=str(artifact_path),
            elapsed_ms=elapsed_ms,
            error_code="INVALID_JSON",
            message="Tool stdout was not valid JSON.",
        )
        raise RuntimeError(f"Tool {tool_name} returned invalid JSON: {stdout_text[:200]}") from exc

    ok = bool(result.get("ok"))
    log.debug(
        "tool_call",
        log_event="tool_call",
        tool=tool_name,
        artifact=str(artifact_path),
        elapsed_ms=elapsed_ms,
        ok=ok,
    )

    if not ok:
        err = result.get("error") or {}
        log.error(
            "tool_error",
            log_event="tool_error",
            tool=tool_name,
            artifact=str(artifact_path),
            elapsed_ms=elapsed_ms,
            error_code=err.get("code"),
            message=err.get("message"),
        )
        raise_for_tool_error(result)

    data = result.get("data")
    if not isinstance(data, dict):
        return {"raw": data}
    return data

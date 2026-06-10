from __future__ import annotations

import atexit
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Literal

from treesite_editor.config import TreeSiteConfig, find_repo_root, get_config

_active_server: "ArtifactPreviewServer | None" = None


def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_url(url: str, timeout_seconds: float = 30.0) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError):
            time.sleep(0.25)
    raise TimeoutError(f"Timed out waiting for {url}")


class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


class ArtifactPreviewServer:
    def __init__(
        self,
        artifact_path: str,
        handler_dir: str,
        port: int = 8002,
        *,
        mode: Literal["static", "dev"] = "static",
        config: TreeSiteConfig | None = None,
        artifact_base_url: str | None = None,
    ) -> None:
        self.config = config or get_config()
        repo_root = find_repo_root()
        self.artifact_path = self.config.resolve_artifact(artifact_path, repo_root)
        self.artifact_base_url = artifact_base_url.rstrip("/") + "/" if artifact_base_url else None
        handler_path = Path(handler_dir)
        if not handler_path.is_absolute():
            handler_path = (repo_root / handler_path).resolve()
        self.handler_dir = handler_path
        self.port = port
        self.mode = mode
        self._artifact_proc: subprocess.Popen | None = None
        self._handler_proc: subprocess.Popen | None = None
        self._httpd: ThreadingHTTPServer | None = None
        self._http_thread: threading.Thread | None = None
        self._artifact_port: int | None = None
        self._handler_port: int | None = None
        self._url: str | None = None

    def start(self) -> str:
        if self.mode == "dev":
            return self._start_dev()
        return self._start_static()

    def _start_static(self) -> str:
        dist = self.handler_dir / "dist"
        if not dist.is_dir():
            raise FileNotFoundError(
                f"Handler build not found at {dist}. Run `npm run build` in handler/ first."
            )

        if self.artifact_base_url:
            artifact_base = self.artifact_base_url
        else:
            self._artifact_port = _pick_free_port()
            serve_script = find_repo_root() / "tools" / "node" / "serve-artifact.js"
            self._artifact_proc = subprocess.Popen(
                [
                    self.config.node_bin,
                    str(serve_script),
                    "--dir",
                    str(self.artifact_path),
                    "--port",
                    str(self._artifact_port),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            artifact_base = f"http://127.0.0.1:{self._artifact_port}/"
            _wait_for_url(f"{artifact_base}artifact.json")

        self._handler_port = self.port if self.port else _pick_free_port()
        handler = _QuietHandler
        handler.directory = str(dist)  # type: ignore[attr-defined]

        self._httpd = ThreadingHTTPServer(("127.0.0.1", self._handler_port), handler)
        self._http_thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._http_thread.start()

        query = urllib.parse.urlencode({"artifact": artifact_base})
        self._url = f"http://127.0.0.1:{self._handler_port}/?{query}"
        _wait_for_url(f"http://127.0.0.1:{self._handler_port}/")
        return self._url

    def _start_dev(self) -> str:
        self._artifact_port = _pick_free_port()
        serve_script = find_repo_root() / "tools" / "node" / "serve-artifact.js"
        self._artifact_proc = subprocess.Popen(
            [
                self.config.node_bin,
                str(serve_script),
                "--dir",
                str(self.artifact_path),
                "--port",
                str(self._artifact_port),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        artifact_base = f"http://127.0.0.1:{self._artifact_port}/"
        _wait_for_url(f"{artifact_base}artifact.json")

        npm = "npm.cmd" if sys.platform == "win32" else "npm"
        env = {
            **os.environ,
            "VITE_ARTIFACT_BASE": artifact_base.rstrip("/"),
        }
        self._handler_port = self.port
        self._handler_proc = subprocess.Popen(
            [npm, "run", "dev", "--", "--port", str(self._handler_port), "--strictPort"],
            cwd=str(self.handler_dir),
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self._url = f"http://127.0.0.1:{self._handler_port}/"
        _wait_for_url(self._url, timeout_seconds=60.0)
        return self._url

    def stop(self) -> None:
        if self._httpd:
            self._httpd.shutdown()
            self._httpd = None
        if self._http_thread:
            self._http_thread.join(timeout=5)
            self._http_thread = None
        for proc in (self._handler_proc, self._artifact_proc):
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()

    def __enter__(self) -> str:
        return self.start()

    def __exit__(self, *args) -> None:
        self.stop()


def start_preview_for_session(
    artifact_path: str,
    *,
    artifact_base_url: str | None = None,
) -> str:
    global _active_server
    stop_active_preview()
    server = ArtifactPreviewServer(
        artifact_path,
        "handler",
        port=8002,
        mode="static",
        artifact_base_url=artifact_base_url,
    )
    url = server.start()
    _active_server = server
    return url


def stop_active_preview() -> None:
    global _active_server
    if _active_server is not None:
        _active_server.stop()
        _active_server = None


def get_active_preview_server() -> ArtifactPreviewServer | None:
    return _active_server


@atexit.register
def _cleanup_preview() -> None:
    stop_active_preview()

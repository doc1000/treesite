from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def find_repo_root(start: Path | None = None) -> Path:
    current = (start or Path(__file__).resolve()).parent
    for _ in range(12):
        if (current / "tools" / "node").is_dir():
            return current
        if current.parent == current:
            break
        current = current.parent
    raise RuntimeError("Could not locate repo root (expected tools/node directory).")


class TreeSiteConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="TREESITE_",
        env_file=".env",
        extra="ignore",
    )

    node_bin: str = "node"
    tools_dir: str = "tools/node"
    default_artifact: str = "artifacts/example"
    log_level: str = "INFO"
    tool_timeout_seconds: float = 30.0

    def resolve_tools_dir(self, repo_root: Path | None = None) -> Path:
        root = repo_root or find_repo_root()
        path = Path(self.tools_dir)
        if path.is_absolute():
            return path
        return (root / path).resolve()

    def resolve_artifact(self, artifact: str, repo_root: Path | None = None) -> Path:
        root = repo_root or find_repo_root()
        path = Path(artifact)
        if path.is_absolute():
            return path.resolve()
        return (root / path).resolve()


def load_repo_dotenv() -> None:
    """Load repo-root .env into os.environ (LangSmith, etc.) without overwriting existing vars."""
    env_path = find_repo_root() / ".env"
    if not env_path.is_file():
        return
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path, override=False)
        return
    except ImportError:
        pass
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip('"', '"').strip("'", "'")
        if key and key not in os.environ:
            os.environ[key] = value


@lru_cache
def get_config() -> TreeSiteConfig:
    load_repo_dotenv()
    return TreeSiteConfig()

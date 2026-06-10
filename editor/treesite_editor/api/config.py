from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field

from treesite_editor.config import TreeSiteConfig, find_repo_root


class ApiConfig(TreeSiteConfig):
    host: str = "0.0.0.0"
    port: int = 8000
    artifacts_base_dir: str = "artifacts"
    max_artifact_size_bytes: int = 500_000_000
    api_key: str | None = None
    allow_origins: list[str] = Field(default_factory=lambda: ["*"])
    api_version: str = "1.0.0"
    public_base_url: str = "http://localhost:8000"
    handler_preview_port: int = 8002

    def resolve_artifacts_base(self, repo_root: Path | None = None) -> Path:
        root = repo_root or find_repo_root()
        path = Path(self.artifacts_base_dir)
        if path.is_absolute():
            return path.resolve()
        return (root / path).resolve()

    def artifact_dir(self, name: str, repo_root: Path | None = None) -> Path:
        return self.resolve_artifacts_base(repo_root) / name


@lru_cache
def get_api_config() -> ApiConfig:
    return ApiConfig()

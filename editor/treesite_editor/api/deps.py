from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request

from treesite_editor.api.config import ApiConfig, get_api_config
from treesite_editor.errors import ArtifactNotFoundError


def get_settings() -> ApiConfig:
    return get_api_config()


def ok(data: Any) -> dict[str, Any]:
    return {"ok": True, "data": data}


def get_artifact_path(
    name: str,
    settings: Annotated[ApiConfig, Depends(get_settings)],
) -> str:
    path = settings.artifact_dir(name)
    if not path.is_dir():
        raise ArtifactNotFoundError(f"Artifact '{name}' not found.")
    return str(path)


def require_write_auth(
    request: Request,
    settings: Annotated[ApiConfig, Depends(get_settings)],
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> None:
    if not settings.api_key:
        return
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    if x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


def resolve_upload_temp(settings: ApiConfig) -> Path:
    base = settings.resolve_artifacts_base()
    temp_root = base / ".uploads"
    temp_root.mkdir(parents=True, exist_ok=True)
    return temp_root


def read_artifact_meta(artifact_path: str) -> dict[str, Any]:
    import json

    meta_path = Path(artifact_path) / "artifact.json"
    return json.loads(meta_path.read_text(encoding="utf-8"))

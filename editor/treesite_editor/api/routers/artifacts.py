from __future__ import annotations

import json
import os
import shutil
import uuid
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from treesite_editor import tools
from treesite_editor.api.config import ApiConfig
from treesite_editor.api.deps import (
    get_artifact_path,
    get_settings,
    ok,
    read_artifact_meta,
    require_write_auth,
    resolve_upload_temp,
)
from treesite_editor.errors import ArtifactNotFoundError, FilesystemError, InvalidInputError
from treesite_editor.preview import start_preview_for_session, stop_active_preview

router = APIRouter(prefix="/artifacts", tags=["Artifacts"], dependencies=[Depends(require_write_auth)])


class ImportResponse(BaseModel):
    name: str
    item_count: int = Field(alias="itemCount")
    schema_version: int = Field(alias="schemaVersion")

    model_config = {"populate_by_name": True}


class ArtifactSummary(BaseModel):
    name: str
    display_name: str = Field(alias="displayName")
    schema_version: int = Field(alias="schemaVersion")
    item_count: int = Field(alias="itemCount")

    model_config = {"populate_by_name": True}


@router.post(
    "/import",
    summary="Import artifact from zip",
    description="Upload a zip archive and register it as a server-side artifact directory.",
)
async def import_artifact(
    settings: Annotated[ApiConfig, Depends(get_settings)],
    file: UploadFile = File(...),
    name: str | None = Form(None),
) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise InvalidInputError("Upload must be a .zip file.")

    temp_root = resolve_upload_temp(settings)
    zip_path = temp_root / f"{uuid.uuid4().hex}.zip"
    size = 0
    with zip_path.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > settings.max_artifact_size_bytes:
                zip_path.unlink(missing_ok=True)
                raise InvalidInputError("Upload exceeds max artifact size.")
            out.write(chunk)

    staging = str(temp_root / f"staging-{uuid.uuid4().hex}")
    try:
        result = tools.import_zip(str(zip_path), staging, overwrite=False)
        meta = read_artifact_meta(result.artifact_path)
        artifact_name = (name or meta.get("name") or "").strip()
        if not artifact_name:
            raise InvalidInputError("Could not determine artifact name.")
        if name:
            meta["name"] = artifact_name
            Path(result.artifact_path, "artifact.json").write_text(
                json.dumps(meta, indent=2) + "\n",
                encoding="utf-8",
            )

        dest = settings.artifact_dir(artifact_name)
        if dest.exists():
            shutil.rmtree(staging, ignore_errors=True)
            raise FilesystemError(f"Artifact '{artifact_name}' already exists.")

        dest.parent.mkdir(parents=True, exist_ok=True)
        os.replace(staging, dest)
        return ok(
            {
                "name": artifact_name,
                "itemCount": result.item_count,
                "schemaVersion": result.schema_version,
            }
        )
    finally:
        zip_path.unlink(missing_ok=True)
        if Path(staging).exists():
            shutil.rmtree(staging, ignore_errors=True)


@router.get("", summary="List artifacts", description="List artifacts stored on the server.")
def list_artifacts(settings: Annotated[ApiConfig, Depends(get_settings)]) -> dict[str, Any]:
    base = settings.resolve_artifacts_base()
    if not base.is_dir():
        return ok({"artifacts": []})

    summaries: list[dict[str, Any]] = []
    for entry in sorted(base.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        meta_path = entry / "artifact.json"
        if not meta_path.is_file():
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        stats = tools.artifact_stats(str(entry))
        summaries.append(
            {
                "name": meta.get("name", entry.name),
                "displayName": meta.get("displayName", entry.name),
                "schemaVersion": stats.schema_version,
                "itemCount": stats.item_count,
            }
        )
    return ok({"artifacts": summaries})


@router.get(
    "/{name}/manifest",
    summary="Get manifest",
    description="Return generated manifest.json for an artifact.",
)
def artifact_manifest(artifact_path: Annotated[str, Depends(get_artifact_path)]) -> dict[str, Any]:
    return ok({"manifest": tools.get_manifest(artifact_path)})


@router.get(
    "/{name}/stats",
    summary="Artifact statistics",
    description="Return aggregate stats for an artifact.",
)
def artifact_stats_route(artifact_path: Annotated[str, Depends(get_artifact_path)]) -> dict[str, Any]:
    stats = tools.artifact_stats(artifact_path)
    return ok(stats.model_dump(by_alias=True))


@router.get(
    "/{name}/export",
    summary="Export artifact zip",
    description="Download the artifact as a zip archive.",
)
def export_artifact(
    name: str,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
    settings: Annotated[ApiConfig, Depends(get_settings)],
) -> FileResponse:
    temp_dir = resolve_upload_temp(settings)
    zip_path = temp_dir / f"{name}-{uuid.uuid4().hex}.zip"
    tools.export_zip(artifact_path, str(zip_path))
    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=f"{name}.zip",
    )


@router.delete(
    "/{name}",
    summary="Delete artifact",
    description="Remove an artifact from the server (requires X-Confirm-Delete: yes).",
)
def delete_artifact(
    name: str,
    settings: Annotated[ApiConfig, Depends(get_settings)],
    x_confirm_delete: Annotated[str | None, Header(alias="X-Confirm-Delete")] = None,
) -> dict[str, Any]:
    if x_confirm_delete != "yes":
        raise InvalidInputError("Deletion requires header X-Confirm-Delete: yes.")
    path = settings.artifact_dir(name)
    if not path.is_dir():
        raise ArtifactNotFoundError(f"Artifact '{name}' not found.")
    shutil.rmtree(path)
    return ok({"deleted": True})


@router.get(
    "/{name}/static/{file_path:path}",
    summary="Artifact static files",
    description="Serve artifact bundle files for handler runtime loading.",
)
def artifact_static(
    name: str,
    file_path: str,
    settings: Annotated[ApiConfig, Depends(get_settings)],
) -> FileResponse:
    base = settings.artifact_dir(name)
    if not base.is_dir():
        raise ArtifactNotFoundError(f"Artifact '{name}' not found.")
    target = (base / file_path).resolve()
    if not str(target).startswith(str(base.resolve())):
        raise InvalidInputError("Invalid static path.")
    if not target.is_file():
        raise ArtifactNotFoundError(f"File not found: {file_path}")
    return FileResponse(path=str(target))


@router.get(
    "/{name}/preview",
    summary="Preview URL",
    description="Return a handler preview URL that loads this artifact from the API.",
)
def artifact_preview(
    name: str,
    settings: Annotated[ApiConfig, Depends(get_settings)],
) -> dict[str, Any]:
    path = settings.artifact_dir(name)
    if not path.is_dir():
        raise ArtifactNotFoundError(f"Artifact '{name}' not found.")
    base = settings.public_base_url.rstrip("/")
    artifact_url = f"{base}/artifacts/{name}/static/"
    stop_active_preview()
    preview_url = start_preview_for_session(str(path), artifact_base_url=artifact_url)
    return ok({"previewUrl": preview_url})

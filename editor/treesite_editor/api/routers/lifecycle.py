from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from treesite_editor import tools
from treesite_editor.api.deps import get_artifact_path, ok, require_write_auth

router = APIRouter(
    prefix="/artifacts/{name}",
    tags=["Lifecycle"],
    dependencies=[Depends(require_write_auth)],
)


class ValidateBody(BaseModel):
    strict: bool = False


class MigrateBody(BaseModel):
    target_version: int | None = Field(None, alias="targetVersion")

    model_config = {"populate_by_name": True}


@router.post(
    "/validate",
    summary="Validate artifact",
    description="Run artifact validation checks.",
)
def validate_artifact(
    body: ValidateBody,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    result = tools.validate(artifact_path, strict=body.strict)
    return ok(result.model_dump(by_alias=True))


@router.post(
    "/rebuild",
    summary="Rebuild manifest",
    description="Regenerate manifest.json from items/.",
)
def rebuild_artifact(artifact_path: Annotated[str, Depends(get_artifact_path)]) -> dict[str, Any]:
    data = tools.rebuild_manifest(artifact_path)
    return ok(
        {
            "manifestRebuilt": True,
            "itemCount": data.get("itemCount", 0),
        }
    )


@router.post(
    "/migrate",
    summary="Migrate artifact",
    description="Run schema migration steps toward targetVersion.",
)
def migrate_artifact(
    body: MigrateBody,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    data = tools.migrate(artifact_path, target_version=body.target_version)
    return ok(data)

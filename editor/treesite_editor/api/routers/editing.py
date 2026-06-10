from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field

from treesite_editor import tools
from treesite_editor.api.deps import get_artifact_path, ok, require_write_auth
from treesite_editor.errors import InvalidInputError
from treesite_editor.models import ContentItem

router = APIRouter(
    prefix="/artifacts/{name}/nodes",
    tags=["Editing"],
    dependencies=[Depends(require_write_auth)],
)


class CreateNodeBody(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    name: str
    section: str
    type: str
    description: str | None = None
    slug: str | None = None


class PatchNodeBody(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: str | None = None


class RenameBody(BaseModel):
    name: str
    slug: str


class MoveBody(BaseModel):
    section: str


def _dump_item(item: ContentItem) -> dict[str, Any]:
    return item.model_dump(by_alias=True, mode="json")


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Add node",
    description="Create a new card; server assigns a UUID id.",
)
def create_node(
    body: CreateNodeBody,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    fields = body.model_dump(exclude_none=True, by_alias=True)
    name = fields.pop("name")
    section = fields.pop("section")
    type_ = fields.pop("type")
    item = tools.add_card(artifact_path, name=name, section=section, type=type_, **fields)
    return ok(_dump_item(item))


@router.patch(
    "/{id}",
    summary="Edit node",
    description="Partial update; body id must match path id when present.",
)
def patch_node(
    id: str,
    body: PatchNodeBody,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    if body.id is not None and body.id != id:
        raise InvalidInputError("Body id must match path id.")
    fields = body.model_dump(exclude_none=True, exclude={"id"}, by_alias=True)
    item = tools.edit_card(artifact_path, id=id, **fields)
    return ok(_dump_item(item))


@router.delete(
    "/{id}",
    summary="Delete node",
    description="Delete a card by id.",
)
def delete_node(
    id: str,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    tools.delete_card(artifact_path, id=id)
    return ok({"deleted": True})


@router.post(
    "/{id}/rename",
    summary="Rename node",
    description="Update display name and slug; id is preserved.",
)
def rename_node(
    id: str,
    body: RenameBody,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    item = tools.rename_card(artifact_path, id=id, name=body.name, slug=body.slug)
    return ok(_dump_item(item))


@router.post(
    "/{id}/move",
    summary="Move node",
    description="Change section path for a card.",
)
def move_node(
    id: str,
    body: MoveBody,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    item = tools.move_card(artifact_path, id=id, section=body.section)
    return ok(_dump_item(item))


@router.post(
    "/{id}/hide",
    summary="Hide node",
    description="Set hidden=true on a card.",
)
def hide_node(
    id: str,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    item = tools.hide_card(artifact_path, id=id)
    return ok(_dump_item(item))


@router.post(
    "/{id}/unhide",
    summary="Unhide node",
    description="Set hidden=false on a card.",
)
def unhide_node(
    id: str,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    item = tools.unhide_card(artifact_path, id=id)
    return ok(_dump_item(item))

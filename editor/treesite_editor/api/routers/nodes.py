from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from treesite_editor import tools
from treesite_editor.api.deps import get_artifact_path, ok, require_write_auth
from treesite_editor.models import ContentItem

router = APIRouter(
    prefix="/artifacts/{name}/nodes",
    tags=["Nodes (read-only)"],
    dependencies=[Depends(require_write_auth)],
)


@router.get(
    "/search",
    summary="Search nodes",
    description="Search item fields within an artifact.",
)
def search_nodes(
    artifact_path: Annotated[str, Depends(get_artifact_path)],
    q: str = Query(..., min_length=1),
    fields: str | None = Query(None, description="Comma-separated fields"),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    field_list = [f.strip() for f in fields.split(",")] if fields else None
    results = tools.search(artifact_path, query=q, fields=field_list, limit=limit)
    return ok({"results": [r.model_dump(by_alias=True) for r in results]})


@router.get(
    "/{id}",
    summary="Get node",
    description="Return a content item by immutable id.",
)
def get_node(
    id: str,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    item = tools.get_node(artifact_path, id=id)
    return ok(item.model_dump(by_alias=True, mode="json"))


@router.get(
    "/{id}/children",
    summary="Get children",
    description="Return direct child items for a node (or root sections when id omitted).",
)
def get_children(
    id: str,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
) -> dict[str, Any]:
    children = tools.get_children(artifact_path, id=id)
    return ok({"children": [c.model_dump(by_alias=True, mode="json") for c in children]})


@router.get(
    "/{id}/subtree",
    summary="Inspect subtree",
    description="Return a nested subtree starting at id.",
)
def inspect_subtree(
    id: str,
    artifact_path: Annotated[str, Depends(get_artifact_path)],
    maxDepth: int = Query(3, ge=1, le=20),
) -> dict[str, Any]:
    subtree = tools.inspect_subtree(artifact_path, id=id, max_depth=maxDepth)
    return ok({"subtree": subtree.model_dump(by_alias=True, mode="json")})

from __future__ import annotations

from typing import Any
from uuid import UUID

from treesite_editor import runner
from treesite_editor.models import (
    ArtifactStats,
    ContentItem,
    ImportResult,
    MutationSummary,
    SearchResult,
    SubtreeNode,
    TreeLine,
    ValidationResult,
    ZipExportResult,
    validate_item,
)


def _item_from_id(artifact: str, item_id: str | UUID) -> ContentItem:
    return get_node(artifact, str(item_id))


def get_node(artifact: str, id: str) -> ContentItem:
    data = runner.run_tool("get-node", artifact, {"id": id})
    return ContentItem.model_validate(data["item"])


def get_children(artifact: str, id: str | None = None) -> list[ContentItem]:
    payload: dict[str, Any] = {}
    if id is not None:
        payload["id"] = id
    data = runner.run_tool("get-children", artifact, payload)
    children = []
    for raw in data.get("children") or []:
        if isinstance(raw, dict) and raw.get("id"):
            children.append(ContentItem.model_validate(raw))
        else:
            children.append(ContentItem.model_validate(raw))
    return children


def search(
    artifact: str,
    query: str,
    fields: list[str] | None = None,
    limit: int = 20,
) -> list[SearchResult]:
    payload: dict[str, Any] = {"query": query, "limit": limit}
    if fields is not None:
        payload["fields"] = fields
    data = runner.run_tool("search", artifact, payload)
    return [SearchResult.model_validate(r) for r in data.get("results") or []]


def inspect_subtree(artifact: str, id: str, max_depth: int = 3) -> SubtreeNode:
    data = runner.run_tool(
        "inspect-subtree",
        artifact,
        {"id": id, "maxDepth": max_depth},
    )
    return SubtreeNode.model_validate(data["subtree"])


def artifact_stats(artifact: str) -> ArtifactStats:
    data = runner.run_tool("artifact-stats", artifact)
    return ArtifactStats.model_validate(data)


def get_manifest(artifact: str) -> dict[str, Any]:
    data = runner.run_tool("get-manifest", artifact)
    return data["manifest"]


def inspect_tree(artifact: str) -> list[TreeLine]:
    data = runner.run_tool("inspect-tree", artifact)
    lines = []
    for raw in data.get("lines") or []:
        lines.append(TreeLine.model_validate(raw))
    return lines


def add_card(artifact: str, *, name: str, section: str, type: str, **fields: Any) -> ContentItem:
    payload = {"name": name, "section": section, "type": type, **fields}
    data = runner.run_tool("add-card", artifact, payload)
    return _item_from_id(artifact, data["id"])


def edit_card(artifact: str, *, id: str, **fields: Any) -> ContentItem:
    if "id" in fields and str(fields["id"]) != id:
        from treesite_editor.errors import InvalidInputError

        raise InvalidInputError("Cannot change immutable field 'id'.")
    payload = {"id": id, **{k: v for k, v in fields.items() if k != "id"}}
    data = runner.run_tool("edit-card", artifact, payload)
    return _item_from_id(artifact, data["id"])


def delete_card(artifact: str, *, id: str) -> MutationSummary:
    data = runner.run_tool("delete-card", artifact, {"id": id, "confirm": True})
    return MutationSummary.model_validate(data)


def rename_card(artifact: str, *, id: str, name: str, slug: str) -> ContentItem:
    data = runner.run_tool("rename-card", artifact, {"id": id, "name": name, "slug": slug})
    return _item_from_id(artifact, data["id"])


def move_card(artifact: str, *, id: str, section: str) -> ContentItem:
    data = runner.run_tool("move-card", artifact, {"id": id, "section": section})
    return _item_from_id(artifact, data["id"])


def hide_card(artifact: str, *, id: str) -> ContentItem:
    data = runner.run_tool("hide-card", artifact, {"id": id})
    return _item_from_id(artifact, data["id"])


def unhide_card(artifact: str, *, id: str) -> ContentItem:
    data = runner.run_tool("unhide-card", artifact, {"id": id})
    return _item_from_id(artifact, data["id"])


def move_subtree(artifact: str, *, id: str, new_section: str) -> ContentItem:
    data = runner.run_tool(
        "move-subtree",
        artifact,
        {"id": id, "newSection": new_section},
    )
    return _item_from_id(artifact, data["id"])


def validate(artifact: str, strict: bool = False) -> ValidationResult:
    data = runner.run_tool("validate", artifact, {"strict": strict})
    return ValidationResult.model_validate(data)


def rebuild_manifest(artifact: str) -> dict[str, Any]:
    return runner.run_tool("rebuild-manifest", artifact)


def migrate(artifact: str, target_version: int | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if target_version is not None:
        payload["targetVersion"] = target_version
    return runner.run_tool("migrate", artifact, payload)


def export_zip(artifact: str, dest_zip: str) -> ZipExportResult:
    data = runner.run_tool("export-zip", artifact, {"destZip": dest_zip})
    return ZipExportResult.model_validate(data)


def import_zip(src_zip: str, dest_dir: str, overwrite: bool = False) -> ImportResult:
    data = runner.run_tool(
        "import-zip",
        dest_dir,
        {"srcZip": src_zip, "overwrite": overwrite},
    )
    return ImportResult.model_validate(data)


__all__ = ["validate_item"]

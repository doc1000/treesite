from __future__ import annotations

from typing import Any

from treesite_editor import runner


def get_node(artifact: str, id: str) -> dict[str, Any]:
    data = runner.run_tool("get-node", artifact, {"id": id})
    return data["item"]


def get_children(artifact: str, id: str | None = None) -> list[dict[str, Any]]:
    payload: dict[str, Any] = {}
    if id is not None:
        payload["id"] = id
    data = runner.run_tool("get-children", artifact, payload)
    return list(data.get("children") or [])


def search(
    artifact: str,
    query: str,
    fields: list[str] | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    payload: dict[str, Any] = {"query": query, "limit": limit}
    if fields is not None:
        payload["fields"] = fields
    data = runner.run_tool("search", artifact, payload)
    return list(data.get("results") or [])


def inspect_subtree(artifact: str, id: str, max_depth: int = 3) -> dict[str, Any]:
    data = runner.run_tool(
        "inspect-subtree",
        artifact,
        {"id": id, "maxDepth": max_depth},
    )
    return data["subtree"]


def artifact_stats(artifact: str) -> dict[str, Any]:
    return runner.run_tool("artifact-stats", artifact)


def get_manifest(artifact: str) -> dict[str, Any]:
    data = runner.run_tool("get-manifest", artifact)
    return data["manifest"]


def inspect_tree(artifact: str) -> list[dict[str, Any]]:
    data = runner.run_tool("inspect-tree", artifact)
    return list(data.get("lines") or [])


def add_card(artifact: str, *, name: str, section: str, type: str, **fields: Any) -> dict[str, Any]:
    payload = {"name": name, "section": section, "type": type, **fields}
    return runner.run_tool("add-card", artifact, payload)


def edit_card(artifact: str, *, id: str, **fields: Any) -> dict[str, Any]:
    if "id" in fields and fields["id"] != id:
        from treesite_editor.errors import InvalidInputError

        raise InvalidInputError("Cannot change immutable field 'id'.")
    payload = {"id": id, **{k: v for k, v in fields.items() if k != "id"}}
    return runner.run_tool("edit-card", artifact, payload)


def delete_card(artifact: str, *, id: str) -> dict[str, Any]:
    return runner.run_tool("delete-card", artifact, {"id": id})


def rename_card(artifact: str, *, id: str, name: str, slug: str) -> dict[str, Any]:
    return runner.run_tool("rename-card", artifact, {"id": id, "name": name, "slug": slug})


def move_card(artifact: str, *, id: str, section: str) -> dict[str, Any]:
    return runner.run_tool("move-card", artifact, {"id": id, "section": section})


def hide_card(artifact: str, *, id: str) -> dict[str, Any]:
    return runner.run_tool("hide-card", artifact, {"id": id})


def unhide_card(artifact: str, *, id: str) -> dict[str, Any]:
    return runner.run_tool("unhide-card", artifact, {"id": id})


def move_subtree(artifact: str, *, id: str, new_section: str) -> dict[str, Any]:
    return runner.run_tool(
        "move-subtree",
        artifact,
        {"id": id, "newSection": new_section},
    )


def validate(artifact: str, strict: bool = False) -> dict[str, Any]:
    return runner.run_tool("validate", artifact, {"strict": strict})


def rebuild_manifest(artifact: str) -> dict[str, Any]:
    return runner.run_tool("rebuild-manifest", artifact)


def migrate(artifact: str, target_version: int | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if target_version is not None:
        payload["targetVersion"] = target_version
    return runner.run_tool("migrate", artifact, payload)

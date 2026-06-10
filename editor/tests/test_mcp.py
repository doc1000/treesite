from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from uuid import UUID

import pytest

from treesite_editor.config import find_repo_root
from treesite_editor.mcp.handler import dispatch_tool
from treesite_editor.mcp.registry import get_tool_definitions, list_tool_names
from treesite_editor.mcp.session import ArtifactSession


@pytest.fixture
def temp_artifact() -> str:
    repo = find_repo_root()
    tmp = tempfile.mkdtemp(prefix="treesite-mcp-")
    shutil.copytree(repo / "artifacts" / "example", tmp, dirs_exist_ok=True)
    try:
        yield tmp
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture
def session(temp_artifact: str) -> ArtifactSession:
    return ArtifactSession.open(temp_artifact)


def _parse(result: dict) -> dict:
    assert "ok" in result
    return result


def test_list_tools_returns_expected_names(session: ArtifactSession) -> None:
    result = _parse(dispatch_tool(session, "list_tools", {}))
    assert result["ok"] is True
    names = {t["name"] for t in result["data"]["tools"]}
    for expected in (
        "get_node",
        "search",
        "add_card",
        "validate_artifact",
        "set_artifact",
    ):
        assert expected in names
    assert len(get_tool_definitions()) == len(list_tool_names())


def test_set_artifact_valid(session: ArtifactSession, temp_artifact: str) -> None:
    other = Path(tempfile.mkdtemp(prefix="treesite-mcp-other-"))
    shutil.copytree(temp_artifact, other, dirs_exist_ok=True)
    try:
        result = _parse(
            dispatch_tool(session, "set_artifact", {"artifactPath": str(other)})
        )
        assert result["ok"] is True
        assert result["data"]["itemCount"] >= 1
    finally:
        shutil.rmtree(other, ignore_errors=True)


def test_set_artifact_invalid(session: ArtifactSession) -> None:
    result = dispatch_tool(
        session,
        "set_artifact",
        {"artifactPath": "/nonexistent/treesite-artifact"},
    )
    assert result["ok"] is False
    assert result["error"]["code"] == "ARTIFACT_NOT_FOUND"


def test_search_returns_results(session: ArtifactSession) -> None:
    result = _parse(dispatch_tool(session, "search", {"query": "treesite"}))
    assert result["ok"] is True
    assert result["data"]["results"]


def test_get_node_valid(session: ArtifactSession) -> None:
    search = dispatch_tool(session, "search", {"query": "TreeSite"})
    item_id = search["data"]["results"][0]["id"]
    result = _parse(dispatch_tool(session, "get_node", {"id": item_id}))
    assert result["ok"] is True
    assert result["data"]["id"] == item_id


def test_get_node_not_found(session: ArtifactSession) -> None:
    result = dispatch_tool(
        session,
        "get_node",
        {"id": "00000000-0000-4000-8000-000000000099"},
    )
    assert result["ok"] is False
    assert result["error"]["code"] == "ITEM_NOT_FOUND"


def test_add_card_assigns_uuid(session: ArtifactSession) -> None:
    result = _parse(
        dispatch_tool(
            session,
            "add_card",
            {
                "name": "MCP Test Card",
                "section": "About This Site",
                "type": "text",
            },
        )
    )
    assert result["ok"] is True
    item_id = result["data"]["id"]
    UUID(item_id)


def test_rename_card_preserves_id(session: ArtifactSession) -> None:
    created = dispatch_tool(
        session,
        "add_card",
        {"name": "Rename MCP", "section": "Home", "type": "text"},
    )
    item_id = created["data"]["id"]
    renamed = _parse(
        dispatch_tool(
            session,
            "rename_card",
            {
                "id": item_id,
                "name": "Renamed MCP",
                "slug": "renamed-mcp",
            },
        )
    )
    assert renamed["data"]["id"] == item_id


def test_edit_card_strips_id_in_fields(session: ArtifactSession) -> None:
    created = dispatch_tool(
        session,
        "add_card",
        {"name": "Edit MCP", "section": "Home", "type": "text"},
    )
    item_id = created["data"]["id"]
    edited = _parse(
        dispatch_tool(
            session,
            "edit_card",
            {
                "id": item_id,
                "fields": {
                    "id": "00000000-0000-0000-0000-000000000000",
                    "description": "MCP edit test",
                },
            },
        )
    )
    assert edited["data"]["id"] == item_id
    assert edited["data"]["description"] == "MCP edit test"


def test_validate_artifact_passes(session: ArtifactSession) -> None:
    result = _parse(dispatch_tool(session, "validate_artifact", {}))
    assert result["ok"] is True
    assert result["data"]["valid"] is True


def test_errors_never_raise(session: ArtifactSession) -> None:
    bad = dispatch_tool(session, "move_card", {"id": "not-a-uuid", "section": "Home"})
    assert bad["ok"] is False
    assert bad["error"]["code"] == "INVALID_INPUT"

from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from uuid import UUID

import pytest
from pydantic import ValidationError

from treesite_editor.config import find_repo_root
from treesite_editor.errors import InvalidInputError, ItemNotFoundError
from treesite_editor import runner
from treesite_editor import tools


@pytest.fixture
def example_artifact() -> str:
    return str(find_repo_root() / "artifacts" / "example")


@pytest.fixture
def temp_artifact(example_artifact: str) -> str:
    tmp = tempfile.mkdtemp(prefix="treesite-sdk-")
    shutil.copytree(example_artifact, tmp, dirs_exist_ok=True)
    try:
        yield tmp
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_artifact_stats(example_artifact: str) -> None:
    stats = tools.artifact_stats(example_artifact)
    assert stats.item_count >= 1
    assert stats.schema_version == 1


def test_get_node_returns_uuid(example_artifact: str) -> None:
    results = tools.search(example_artifact, query="TreeSite")
    assert results
    node = tools.get_node(example_artifact, id=str(results[0].id))
    assert isinstance(node.id, UUID)


def test_get_node_not_found(example_artifact: str) -> None:
    with pytest.raises(ItemNotFoundError):
        tools.get_node(
            example_artifact,
            id="00000000-0000-0000-0000-000000000000",
        )


def test_search_results(example_artifact: str) -> None:
    results = tools.search(example_artifact, query="example")
    assert isinstance(results, list)
    if results:
        assert results[0].matched_field


def test_add_card_assigns_uuid(temp_artifact: str) -> None:
    created = tools.add_card(
        temp_artifact,
        name="SDK Test Card",
        section="Home",
        type="text",
        description="Added by pytest.",
    )
    assert isinstance(created.id, UUID)


def test_rename_preserves_id(temp_artifact: str) -> None:
    created = tools.add_card(
        temp_artifact,
        name="Rename Me",
        section="Home",
        type="text",
    )
    original = str(created.id)
    renamed = tools.rename_card(
        temp_artifact,
        id=original,
        name="Rename Me Updated",
        slug="rename-me-updated",
    )
    assert str(renamed.id) == original
    assert renamed.name == "Rename Me Updated"


def test_edit_card_rejects_id_change(temp_artifact: str) -> None:
    created = tools.add_card(
        temp_artifact,
        name="ID Guard",
        section="Home",
        type="text",
    )
    with pytest.raises(InvalidInputError):
        runner.run_tool(
            "edit-card",
            temp_artifact,
            {
                "id": str(created.id),
                "fields": {
                    "id": "00000000-0000-0000-0000-000000000001",
                    "description": "nope",
                },
            },
        )


def test_validate_passes(temp_artifact: str) -> None:
    result = tools.validate(temp_artifact)
    assert result.valid is True


def test_rebuild_manifest(temp_artifact: str) -> None:
    data = tools.rebuild_manifest(temp_artifact)
    assert data.get("manifestRebuilt") is True

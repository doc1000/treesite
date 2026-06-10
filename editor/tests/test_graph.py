from __future__ import annotations

import shutil
import tempfile

import pytest

from treesite_editor.config import find_repo_root
from treesite_editor.graph import EditSession


@pytest.fixture
def temp_artifact() -> str:
    src = find_repo_root() / "artifacts" / "example"
    tmp = tempfile.mkdtemp(prefix="treesite-graph-")
    shutil.copytree(src, tmp, dirs_exist_ok=True)
    try:
        yield tmp
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_run_no_operations(temp_artifact: str) -> None:
    session = EditSession(temp_artifact)
    session.load()
    result = session.run(preview=False)
    assert result.status == "done"


def test_run_add_card(temp_artifact: str) -> None:
    session = EditSession(temp_artifact)
    session.load()
    session.queue_operation(
        "add_card",
        name="Graph Section",
        section="Home",
        type="section",
        description="From LangGraph test.",
    )
    result = session.run(preview=False)
    assert result.status == "done"
    assert result.manifest_rebuilt is True
    assert len(result.operations) == 1


def test_missing_artifact_fails() -> None:
    missing = str(find_repo_root() / "artifacts" / "__does_not_exist__")
    session = EditSession(missing)
    result = session.run(preview=False)
    assert result.status == "error"
    assert result.errors


def test_checkpoint_round_trip(temp_artifact: str) -> None:
    session = EditSession(temp_artifact)
    session.load()
    session.queue_operation(
        "add_card",
        name="Checkpoint Card",
        section="Home",
        type="text",
    )
    result = session.run(preview=False)
    assert result.status == "done"
    checkpoint_id = session.checkpoint()
    restored = EditSession.from_checkpoint(checkpoint_id)
    assert restored.artifact_path == session.artifact_path

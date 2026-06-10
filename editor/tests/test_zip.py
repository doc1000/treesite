from __future__ import annotations

import json
import shutil
import tempfile
import zipfile
from pathlib import Path

import pytest

from treesite_editor.config import find_repo_root
from treesite_editor.errors import ArtifactMalformedError, DuplicateIdError, FilesystemError
from treesite_editor import tools


@pytest.fixture
def example_artifact() -> str:
    return str(find_repo_root() / "artifacts" / "example")


@pytest.fixture
def temp_artifact(example_artifact: str) -> str:
    tmp = tempfile.mkdtemp(prefix="treesite-zip-")
    shutil.copytree(example_artifact, tmp, dirs_exist_ok=True)
    try:
        yield tmp
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _collect_item_ids(artifact_dir: str) -> dict[str, str]:
    items_dir = Path(artifact_dir) / "items"
    ids: dict[str, str] = {}
    for path in sorted(items_dir.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        ids[path.name] = data["id"]
    return ids


def _tree_file_paths(root: str) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    base = Path(root)
    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(base).as_posix()
        if rel.endswith(".gitkeep") or rel.endswith(".DS_Store"):
            continue
        files[rel] = path.read_bytes()
    return files


def test_export_zip_produces_file(temp_artifact: str, tmp_path: Path) -> None:
    dest = tmp_path / "out.zip"
    result = tools.export_zip(temp_artifact, str(dest))
    assert dest.is_file()
    assert result.zip_path == str(dest.resolve())
    assert result.size_bytes == dest.stat().st_size
    assert len(result.sha256) == 64


def test_import_zip_round_trip_preserves_ids(temp_artifact: str, tmp_path: Path) -> None:
    before_ids = _collect_item_ids(temp_artifact)
    zip_path = tmp_path / "bundle.zip"
    tools.export_zip(temp_artifact, str(zip_path))
    imported = tmp_path / "imported"
    result = tools.import_zip(str(zip_path), str(imported))
    assert result.item_count == len(before_ids)
    assert result.schema_version == 1
    after_ids = _collect_item_ids(str(imported))
    assert before_ids == after_ids


def test_import_zip_directory_matches_source(temp_artifact: str, tmp_path: Path) -> None:
    zip_path = tmp_path / "bundle.zip"
    tools.export_zip(temp_artifact, str(zip_path))
    imported = tmp_path / "imported"
    tools.import_zip(str(zip_path), str(imported))
    source_files = _tree_file_paths(temp_artifact)
    imported_files = _tree_file_paths(str(imported))
    assert source_files.keys() == imported_files.keys()
    for key in source_files:
        assert source_files[key] == imported_files[key]


def test_export_zip_deterministic_sha256(temp_artifact: str, tmp_path: Path) -> None:
    a = tools.export_zip(temp_artifact, str(tmp_path / "a.zip"))
    b = tools.export_zip(temp_artifact, str(tmp_path / "b.zip"))
    assert a.sha256 == b.sha256


def test_import_zip_duplicate_id_raises(temp_artifact: str, tmp_path: Path) -> None:
    zip_path = tmp_path / "bad.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        for path in Path(temp_artifact).rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(temp_artifact).as_posix())
        items = Path(temp_artifact) / "items"
        first = next(items.glob("*.json"))
        dup = json.loads(first.read_text(encoding="utf-8"))
        dup["slug"] = "duplicate-slug"
        zf.writestr("items/duplicate-slug.json", json.dumps(dup, indent=2) + "\n")

    dest = tmp_path / "dest"
    with pytest.raises(DuplicateIdError):
        tools.import_zip(str(zip_path), str(dest))


def test_import_zip_malformed_raises(tmp_path: Path) -> None:
    zip_path = tmp_path / "malformed.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("readme.txt", "not an artifact")

    dest = tmp_path / "dest"
    with pytest.raises(ArtifactMalformedError):
        tools.import_zip(str(zip_path), str(dest))


def test_import_zip_existing_dir_without_overwrite(temp_artifact: str, tmp_path: Path) -> None:
    zip_path = tmp_path / "bundle.zip"
    tools.export_zip(temp_artifact, str(zip_path))
    dest = tmp_path / "existing"
    dest.mkdir()
    with pytest.raises(FilesystemError):
        tools.import_zip(str(zip_path), str(dest))

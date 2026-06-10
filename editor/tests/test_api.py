from __future__ import annotations

import io
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from treesite_editor.api import config as api_config
from treesite_editor.api.main import create_app
from treesite_editor.config import find_repo_root


@pytest.fixture
def api_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    repo = find_repo_root()
    temp_base = Path(tempfile.mkdtemp(prefix="treesite-api-artifacts-"))
    for name in ("example",):
        src = repo / "artifacts" / name
        if src.is_dir():
            shutil.copytree(src, temp_base / name)
    monkeypatch.setenv("TREESITE_ARTIFACTS_BASE_DIR", str(temp_base))
    api_config.get_api_config.cache_clear()
    client = TestClient(create_app())
    try:
        yield client
    finally:
        api_config.get_api_config.cache_clear()
        shutil.rmtree(temp_base, ignore_errors=True)


def _assert_error_shape(response) -> None:
    body = response.json()
    assert body.get("ok") is False
    err = body.get("error") or {}
    assert err.get("code")
    assert err.get("message")


def test_health(api_client: TestClient) -> None:
    response = api_client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_import_valid_zip(api_client: TestClient) -> None:
    repo = find_repo_root()
    zip_path = repo / "artifacts" / "example.zip"
    if not zip_path.is_file():
        from treesite_editor import tools

        tools.export_zip(str(repo / "artifacts" / "example"), str(zip_path))
    with zip_path.open("rb") as handle:
        response = api_client.post(
            "/artifacts/import",
            files={"file": ("example-copy.zip", handle, "application/zip")},
            data={"name": "example-copy"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["data"]["name"] == "example-copy"


def test_import_malformed_zip(api_client: TestClient) -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("note.txt", "hello")
    buf.seek(0)
    response = api_client.post(
        "/artifacts/import",
        files={"file": ("bad.zip", buf, "application/zip")},
        data={"name": "bad-artifact"},
    )
    assert response.status_code == 422
    _assert_error_shape(response)


def test_list_artifacts(api_client: TestClient) -> None:
    response = api_client.get("/artifacts")
    assert response.status_code == 200
    names = {a["name"] for a in response.json()["data"]["artifacts"]}
    assert "example" in names


def test_get_manifest(api_client: TestClient) -> None:
    response = api_client.get("/artifacts/example/manifest")
    assert response.status_code == 200
    assert "manifest" in response.json()["data"]


def test_export_returns_zip(api_client: TestClient) -> None:
    response = api_client.get("/artifacts/example/export")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/zip")
    assert len(response.content) > 100


def test_get_node(api_client: TestClient) -> None:
    search = api_client.get("/artifacts/example/nodes/search", params={"q": "TreeSite"})
    assert search.status_code == 200
    item_id = search.json()["data"]["results"][0]["id"]
    response = api_client.get(f"/artifacts/example/nodes/{item_id}")
    assert response.status_code == 200
    assert response.json()["data"]["id"] == item_id


def test_get_node_not_found(api_client: TestClient) -> None:
    response = api_client.get(
        "/artifacts/example/nodes/00000000-0000-4000-8000-000000000099"
    )
    assert response.status_code == 404
    _assert_error_shape(response)


def test_search(api_client: TestClient) -> None:
    response = api_client.get(
        "/artifacts/example/nodes/search",
        params={"q": "treesite", "fields": "name,description", "limit": 20},
    )
    assert response.status_code == 200
    assert response.json()["data"]["results"]


def test_subtree(api_client: TestClient) -> None:
    search = api_client.get("/artifacts/example/nodes/search", params={"q": "About"})
    item_id = search.json()["data"]["results"][0]["id"]
    response = api_client.get(
        f"/artifacts/example/nodes/{item_id}/subtree",
        params={"maxDepth": 3},
    )
    assert response.status_code == 200
    assert "subtree" in response.json()["data"]


def test_create_patch_rename_delete_node(api_client: TestClient) -> None:
    create = api_client.post(
        "/artifacts/example/nodes",
        json={
            "name": "API Test Card",
            "section": "About This Site",
            "type": "text",
            "description": "Created via API.",
        },
    )
    assert create.status_code == 201
    created = create.json()["data"]
    item_id = created["id"]
    UUID(item_id)

    patch = api_client.patch(
        f"/artifacts/example/nodes/{item_id}",
        json={"description": "Updated via API."},
    )
    assert patch.status_code == 200
    assert patch.json()["data"]["id"] == item_id

    mismatch = api_client.patch(
        f"/artifacts/example/nodes/{item_id}",
        json={"id": "00000000-0000-4000-8000-000000000001"},
    )
    assert mismatch.status_code == 400
    _assert_error_shape(mismatch)

    renamed = api_client.post(
        f"/artifacts/example/nodes/{item_id}/rename",
        json={"name": "API Test Card Renamed", "slug": "api-test-card-renamed"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["data"]["id"] == item_id

    deleted = api_client.delete(f"/artifacts/example/nodes/{item_id}")
    assert deleted.status_code == 200

    missing = api_client.get(f"/artifacts/example/nodes/{item_id}")
    assert missing.status_code == 404


def test_validate_and_rebuild(api_client: TestClient) -> None:
    validate = api_client.post("/artifacts/example/validate", json={"strict": False})
    assert validate.status_code == 200
    assert validate.json()["data"]["valid"] is True

    rebuild = api_client.post("/artifacts/example/rebuild")
    assert rebuild.status_code == 200
    assert rebuild.json()["data"]["manifestRebuilt"] is True

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from treesite_editor import runner
from treesite_editor import tools
from treesite_editor.api import config as api_config
from treesite_editor.api.main import create_app
from treesite_editor.config import find_repo_root
from treesite_editor.mcp.config import get_mcp_config
from treesite_editor.mcp.handler import dispatch_tool
from treesite_editor.mcp.session import ArtifactSession


@pytest.fixture
def integration_artifact() -> str:
    repo = find_repo_root()
    base = Path(tempfile.mkdtemp(prefix="treesite-integration-"))
    name = "integration-example"
    dest = base / name
    shutil.copytree(repo / "artifacts" / "example", dest, dirs_exist_ok=True)
    try:
        yield str(dest)
    finally:
        shutil.rmtree(base, ignore_errors=True)


@pytest.fixture
def api_client(integration_artifact: str, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    artifact_dir = Path(integration_artifact)
    base = artifact_dir.parent
    monkeypatch.setenv("TREESITE_ARTIFACTS_BASE_DIR", str(base))
    api_config.get_api_config.cache_clear()
    client = TestClient(create_app())
    try:
        yield client
    finally:
        api_config.get_api_config.cache_clear()


def test_full_stack_node_sdk_mcp_api_zip(
    integration_artifact: str,
    api_client: TestClient,
) -> None:
    artifact_name = Path(integration_artifact).name

    validate_payload = runner.run_tool("validate", integration_artifact, {})
    assert validate_payload.get("valid") is True

    created = tools.add_card(
        integration_artifact,
        name="Integration Stack Card",
        section="About This Site",
        type="text",
        description="Added by SDK for integration test.",
    )
    original_id = str(created.id)

    session = ArtifactSession.open(integration_artifact)
    search = dispatch_tool(session, "search", {"query": "Integration Stack Card"})
    assert search["ok"] is True
    assert any(r["id"] == original_id for r in search["data"]["results"])

    renamed = dispatch_tool(
        session,
        "rename_card",
        {
            "id": original_id,
            "name": "Integration Stack Card Renamed",
            "slug": "integration-stack-renamed",
        },
    )
    assert renamed["ok"] is True
    assert renamed["data"]["id"] == original_id

    validated = dispatch_tool(session, "validate_artifact", {})
    assert validated["ok"] is True
    assert validated["data"]["valid"] is True

    api_node = api_client.get(f"/artifacts/{artifact_name}/nodes/{original_id}")
    assert api_node.status_code == 200
    assert api_node.json()["data"]["id"] == original_id

    export = api_client.get(f"/artifacts/{artifact_name}/export")
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("application/zip")

    import_dir = Path(integration_artifact).parent / "imported-copy"
    zip_path = Path(tempfile.mkdtemp()) / "roundtrip.zip"
    zip_path.write_bytes(export.content)
    try:
        import_result = tools.import_zip(str(zip_path), str(import_dir), overwrite=True)
        assert import_result.item_count >= 1

        imported_session = ArtifactSession.open(str(import_dir))
        imported_node = dispatch_tool(imported_session, "get_node", {"id": original_id})
        assert imported_node["ok"] is True
        assert imported_node["data"]["id"] == original_id
    finally:
        shutil.rmtree(import_dir, ignore_errors=True)
        shutil.rmtree(zip_path.parent, ignore_errors=True)


@pytest.mark.asyncio
async def test_mcp_stdio_subprocess_search(integration_artifact: str) -> None:
    from mcp.client.session import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client

    repo = find_repo_root()
    editor_dir = repo / "editor"
    env = os.environ.copy()
    env["TREESITE_DEFAULT_ARTIFACT"] = integration_artifact
    env["PYTHONPATH"] = str(editor_dir)

    get_mcp_config.cache_clear()

    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "treesite_editor.mcp.server"],
        env=env,
        cwd=str(editor_dir),
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools_result = await session.list_tools()
            names = {t.name for t in tools_result.tools}
            assert "search" in names
            call = await session.call_tool("search", {"query": "TreeSite"})
            payload = json.loads(call.content[0].text)
            assert payload["ok"] is True
            assert payload["data"]["results"]

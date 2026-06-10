from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from treesite_editor import tools
from treesite_editor.errors import ArtifactNotFoundError
from treesite_editor.mcp.config import get_mcp_config
from treesite_editor.models import ArtifactMeta


@dataclass
class ArtifactSession:
    artifact_path: str
    artifact_meta: ArtifactMeta

    @classmethod
    def open(cls, artifact_path: str) -> ArtifactSession:
        config = get_mcp_config()
        resolved = config.resolve_artifact(artifact_path)
        meta_file = resolved / "artifact.json"
        if not meta_file.is_file():
            raise ArtifactNotFoundError(f"Artifact not found: {artifact_path}")
        meta = ArtifactMeta.model_validate(json.loads(meta_file.read_text(encoding="utf-8")))
        session = cls(artifact_path=str(resolved), artifact_meta=meta)
        tools.validate(session.artifact_path, strict=False)
        return session

    def refresh(self) -> None:
        meta_file = Path(self.artifact_path) / "artifact.json"
        self.artifact_meta = ArtifactMeta.model_validate(
            json.loads(meta_file.read_text(encoding="utf-8"))
        )

    @property
    def item_count(self) -> int:
        items_dir = Path(self.artifact_path) / "items"
        if not items_dir.is_dir():
            return 0
        return len(list(items_dir.glob("*.json")))

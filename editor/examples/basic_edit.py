"""Run a full edit session against a temp copy of the example artifact."""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

from treesite_editor.config import find_repo_root
from treesite_editor.graph import EditSession


def main() -> None:
    src = find_repo_root() / "artifacts" / "example"
    work = Path(tempfile.mkdtemp(prefix="treesite-basic-edit-"))
    shutil.copytree(src, work, dirs_exist_ok=True)

    session = EditSession(str(work))
    session.load()
    (
        session.queue_operation(
            "add_card",
            name="Demo Section",
            section="Home",
            type="section",
            description="A section added by the SDK.",
        ).queue_operation(
            "add_card",
            name="Demo Article",
            section="Demo Section",
            type="text",
            description="An article in the demo section.",
        )
    )

    preview = "--no-preview" not in sys.argv
    result = session.run(preview=preview)

    print(f"Status: {result.status}")
    print(f"Manifest rebuilt: {result.manifest_rebuilt}")
    if result.preview_url:
        print(f"Preview: {result.preview_url}")
        input("Press Enter to stop preview...")
        session.stop_preview()


if __name__ == "__main__":
    main()

"""Inspect the example artifact via the Python SDK."""

from __future__ import annotations

from treesite_editor.config import find_repo_root
from treesite_editor import tools


def main() -> None:
    artifact = str(find_repo_root() / "artifacts" / "example")
    stats = tools.artifact_stats(artifact)
    print(f"Items: {stats.item_count}, Sections: {stats.section_count}")

    results = tools.search(artifact, query="treesite")
    for r in results:
        print(f"  {r.name} ({r.matched_field}): {r.excerpt}")

    if results:
        node = tools.get_node(artifact, id=str(results[0].id))
        subtree = tools.inspect_subtree(artifact, id=str(node.id), max_depth=2)
        print(f"Subtree root: {subtree.name} ({len(subtree.children)} children)")


if __name__ == "__main__":
    main()

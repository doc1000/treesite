from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal

from treesite_editor.mcp.config import get_mcp_config

ToolCategory = Literal["inspection", "mutation", "lifecycle", "artifact"]

SET_ARTIFACT_INPUT_SCHEMA: dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "artifactPath": {"type": "string", "minLength": 1},
    },
    "required": ["artifactPath"],
}

LIST_TOOLS_INPUT_SCHEMA: dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": False,
    "properties": {},
}

IMPORT_ZIP_MCP_INPUT_SCHEMA: dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "srcZip": {"type": "string", "minLength": 1},
        "destDir": {"type": "string", "minLength": 1},
        "overwrite": {"type": "boolean"},
    },
    "required": ["srcZip", "destDir"],
}

EXPORT_ZIP_MCP_INPUT_SCHEMA: dict[str, Any] = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "destZip": {"type": "string", "minLength": 1},
    },
    "required": ["destZip"],
}


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    category: ToolCategory


def _load_schema(filename: str) -> dict[str, Any]:
    config = get_mcp_config()
    path = config.resolve_tools_dir() / "schemas" / filename
    return json.loads(path.read_text(encoding="utf-8"))


def _tool(
    name: str,
    description: str,
    schema_stem: str,
    category: ToolCategory,
) -> ToolDefinition:
    return ToolDefinition(
        name=name,
        description=description,
        input_schema=_load_schema(f"{schema_stem}.input.schema.json"),
        output_schema=_load_schema(f"{schema_stem}.output.schema.json"),
        category=category,
    )


@lru_cache
def get_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        ToolDefinition(
            name="list_tools",
            description=(
                "List all TreeSite MCP tools with names, descriptions, and categories. "
                "Use this to discover available operations on the active artifact."
            ),
            input_schema=LIST_TOOLS_INPUT_SCHEMA,
            output_schema={"type": "object"},
            category="artifact",
        ),
        ToolDefinition(
            name="set_artifact",
            description=(
                "Switch the active content artifact for this MCP session. "
                "Provide a path to an artifact directory bundle (must contain artifact.json). "
                "The artifact is validated on load."
            ),
            input_schema=SET_ARTIFACT_INPUT_SCHEMA,
            output_schema={"type": "object"},
            category="artifact",
        ),
        _tool(
            "get_node",
            (
                "Retrieve the full data for a single content item by its immutable UUID id. "
                "Use this to inspect a specific card, section, or node in the artifact. "
                "The id never changes across renames, moves, or exports."
            ),
            "get-node",
            "inspection",
        ),
        _tool(
            "get_children",
            (
                "Return immediate child items for a node id, or root-level sections when id is omitted."
            ),
            "get-children",
            "inspection",
        ),
        _tool(
            "search",
            (
                "Full-text search across item fields (name, description, html, slug by default). "
                "Use to locate cards before calling get_node or mutations."
            ),
            "search",
            "inspection",
        ),
        _tool(
            "inspect_subtree",
            "Return a nested subtree rooted at the given item id.",
            "inspect-subtree",
            "inspection",
        ),
        _tool(
            "artifact_stats",
            "Return aggregate statistics for the active artifact (counts, schema version, types).",
            "artifact-stats",
            "inspection",
        ),
        _tool(
            "get_manifest",
            "Return the generated manifest.json hierarchy for the active artifact.",
            "get-manifest",
            "inspection",
        ),
        _tool(
            "inspect_tree",
            "Return a human-readable tree listing of the artifact (lines with depth and metadata).",
            "inspect-tree",
            "inspection",
        ),
        _tool(
            "add_card",
            (
                "Create a new content card or section in the active artifact. "
                "Assign a name, section path (e.g. 'Home' or 'Home/Services'), and type. "
                "A permanent UUID id is automatically assigned; you cannot set it manually. "
                "The manifest is automatically rebuilt after creation. "
                "Returns the full item including its new id."
            ),
            "add-card",
            "mutation",
        ),
        _tool(
            "edit_card",
            (
                "Update fields on an existing content card by its id. "
                "The id field is immutable and cannot be changed. "
                "Provide only the fields you want to update under 'fields'. "
                "The manifest is automatically rebuilt after editing."
            ),
            "edit-card",
            "mutation",
        ),
        _tool(
            "delete_card",
            "Remove a content item by its immutable id (requires confirm in the underlying tool).",
            "delete-card",
            "mutation",
        ),
        _tool(
            "rename_card",
            (
                "Change the name and slug of an existing card by its id. "
                "The id is preserved; only name and slug change. "
                "Use this instead of edit_card when you only want to rename."
            ),
            "rename-card",
            "mutation",
        ),
        _tool(
            "move_card",
            "Change the section path of an item by its id; the id is unchanged.",
            "move-card",
            "mutation",
        ),
        _tool(
            "hide_card",
            "Set hidden=true on an item by id.",
            "hide-card",
            "mutation",
        ),
        _tool(
            "unhide_card",
            "Clear hidden on an item by id.",
            "unhide-card",
            "mutation",
        ),
        _tool(
            "move_subtree",
            "Re-parent a section subtree by root id; descendant section paths are rewritten.",
            "move-subtree",
            "mutation",
        ),
        _tool(
            "validate_artifact",
            "Schema-check all items, assert unique ids, and detect manifest drift.",
            "validate",
            "lifecycle",
        ),
        _tool(
            "rebuild_manifest",
            "Regenerate manifest.json from items/ for the active artifact.",
            "rebuild-manifest",
            "lifecycle",
        ),
        _tool(
            "migrate_artifact",
            "Run migrations/ upgraders to bring the artifact to the current schemaVersion.",
            "migrate",
            "lifecycle",
        ),
        ToolDefinition(
            name="export_artifact_zip",
            description=(
                "Export the active artifact directory as a zip archive at destZip on disk."
            ),
            input_schema=EXPORT_ZIP_MCP_INPUT_SCHEMA,
            output_schema=_load_schema("export-zip.output.schema.json"),
            category="lifecycle",
        ),
        ToolDefinition(
            name="import_artifact_zip",
            description=(
                "Import a zip archive into a new artifact directory (destDir). "
                "Validates the bundle after extraction."
            ),
            input_schema=IMPORT_ZIP_MCP_INPUT_SCHEMA,
            output_schema=_load_schema("import-zip.output.schema.json"),
            category="lifecycle",
        ),
    )


def list_tool_names() -> list[str]:
    return [t.name for t in get_tool_definitions()]


def get_tool_definition(name: str) -> ToolDefinition | None:
    for tool in get_tool_definitions():
        if tool.name == name:
            return tool
    return None

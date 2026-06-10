from __future__ import annotations

import logging
import re
from typing import Any
from uuid import UUID

import jsonschema

from treesite_editor import tools
from treesite_editor.errors import TreeSiteError
from treesite_editor.mcp.registry import get_tool_definition, get_tool_definitions
from treesite_editor.mcp.session import ArtifactSession

logger = logging.getLogger(__name__)

_UUID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

_MUTATION_TOOLS_REQUIRING_ID = frozenset(
    {
        "edit_card",
        "delete_card",
        "rename_card",
        "move_card",
        "hide_card",
        "unhide_card",
        "move_subtree",
    }
)


def ok(data: Any) -> dict[str, Any]:
    return {"ok": True, "data": data}


def error_response(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}}


def _is_valid_uuid(value: Any) -> bool:
    if not isinstance(value, str) or not _UUID_PATTERN.match(value):
        return False
    try:
        UUID(value)
    except ValueError:
        return False
    return True


def _validate_input(name: str, arguments: dict[str, Any]) -> dict[str, Any] | None:
    definition = get_tool_definition(name)
    if definition is None:
        return error_response("INVALID_INPUT", f"Unknown tool '{name}'.")
    try:
        jsonschema.validate(instance=arguments, schema=definition.input_schema)
    except jsonschema.ValidationError as exc:
        return error_response("INVALID_INPUT", str(exc.message))
    if name in _MUTATION_TOOLS_REQUIRING_ID and not _is_valid_uuid(arguments.get("id")):
        return error_response(
            "INVALID_INPUT",
            f"Tool '{name}' requires a valid UUID 'id'.",
        )
    return None


def _enforce_mutation_id_rules(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    args = dict(arguments)
    if name == "edit_card":
        fields = dict(args.get("fields") or {})
        if "id" in fields:
            logger.warning(
                "Attempted to modify immutable field 'id' via MCP; field ignored."
            )
            fields.pop("id")
        args["fields"] = fields
    if name == "add_card" and "id" in args:
        logger.warning("add_card ignores client-supplied id; server assigns UUID.")
        args.pop("id", None)
    return args


def dispatch_tool(
    session: ArtifactSession,
    name: str,
    arguments: dict[str, Any] | None,
) -> dict[str, Any]:
    args = arguments or {}
    if name == "list_tools":
        tools_payload = [
            {
                "name": t.name,
                "description": t.description,
                "category": t.category,
            }
            for t in get_tool_definitions()
            if t.name not in ("list_tools",)
        ]
        return ok({"tools": tools_payload})

    validation_error = _validate_input(name, args)
    if validation_error is not None:
        return validation_error

    args = _enforce_mutation_id_rules(name, args)
    artifact = session.artifact_path

    try:
        if name == "set_artifact":
            new_session = ArtifactSession.open(str(args["artifactPath"]))
            session.artifact_path = new_session.artifact_path
            session.artifact_meta = new_session.artifact_meta
            return ok(
                {
                    "name": session.artifact_meta.name,
                    "displayName": session.artifact_meta.display_name,
                    "itemCount": session.item_count,
                }
            )

        if name == "get_node":
            item = tools.get_node(artifact, id=args["id"])
            return ok(item.model_dump(by_alias=True, mode="json"))

        if name == "get_children":
            node_id = args.get("id")
            children = tools.get_children(artifact, id=node_id)
            return ok(
                {
                    "children": [
                        c.model_dump(by_alias=True, mode="json") for c in children
                    ]
                }
            )

        if name == "search":
            results = tools.search(
                artifact,
                query=args["query"],
                fields=args.get("fields"),
                limit=int(args.get("limit", 20)),
            )
            return ok(
                {
                    "results": [
                        r.model_dump(by_alias=True, mode="json") for r in results
                    ]
                }
            )

        if name == "inspect_subtree":
            subtree = tools.inspect_subtree(
                artifact,
                id=args["id"],
                max_depth=int(args.get("maxDepth", 3)),
            )
            return ok({"subtree": subtree.model_dump(by_alias=True, mode="json")})

        if name == "artifact_stats":
            stats = tools.artifact_stats(artifact)
            return ok(stats.model_dump(by_alias=True, mode="json"))

        if name == "get_manifest":
            manifest = tools.get_manifest(artifact)
            return ok({"manifest": manifest})

        if name == "inspect_tree":
            lines = tools.inspect_tree(artifact)
            return ok(
                {"lines": [line.model_dump(by_alias=True, mode="json") for line in lines]}
            )

        if name == "add_card":
            payload = {k: v for k, v in args.items() if k not in ("name", "section", "type")}
            item = tools.add_card(
                artifact,
                name=args["name"],
                section=args["section"],
                type=args["type"],
                **payload,
            )
            return ok(item.model_dump(by_alias=True, mode="json"))

        if name == "edit_card":
            fields = args.get("fields") or {}
            item = tools.edit_card(artifact, id=args["id"], **fields)
            return ok(item.model_dump(by_alias=True, mode="json"))

        if name == "delete_card":
            summary = tools.delete_card(artifact, id=args["id"])
            return ok(summary.model_dump(by_alias=True, mode="json"))

        if name == "rename_card":
            item = tools.rename_card(
                artifact,
                id=args["id"],
                name=args["name"],
                slug=args["slug"],
            )
            return ok(item.model_dump(by_alias=True, mode="json"))

        if name == "move_card":
            item = tools.move_card(artifact, id=args["id"], section=args["section"])
            return ok(item.model_dump(by_alias=True, mode="json"))

        if name == "hide_card":
            item = tools.hide_card(artifact, id=args["id"])
            return ok(item.model_dump(by_alias=True, mode="json"))

        if name == "unhide_card":
            item = tools.unhide_card(artifact, id=args["id"])
            return ok(item.model_dump(by_alias=True, mode="json"))

        if name == "move_subtree":
            item = tools.move_subtree(
                artifact,
                id=args["id"],
                new_section=args["newSection"],
            )
            return ok(item.model_dump(by_alias=True, mode="json"))

        if name == "validate_artifact":
            result = tools.validate(artifact, strict=bool(args.get("strict", False)))
            return ok(result.model_dump(by_alias=True, mode="json"))

        if name == "rebuild_manifest":
            data = tools.rebuild_manifest(artifact)
            return ok(data)

        if name == "migrate_artifact":
            target = args.get("targetVersion")
            data = tools.migrate(
                artifact,
                target_version=int(target) if target is not None else None,
            )
            return ok(data)

        if name == "export_artifact_zip":
            result = tools.export_zip(artifact, dest_zip=args["destZip"])
            return ok(result.model_dump(by_alias=True, mode="json"))

        if name == "import_artifact_zip":
            result = tools.import_zip(
                src_zip=args["srcZip"],
                dest_dir=args["destDir"],
                overwrite=bool(args.get("overwrite", False)),
            )
            return ok(result.model_dump(by_alias=True, mode="json"))

        return error_response("NOT_IMPLEMENTED", f"Tool '{name}' is not yet wired.")

    except TreeSiteError as exc:
        return error_response(exc.code, exc.message)
    except Exception as exc:  # pragma: no cover - transport safety net
        logger.exception("MCP tool %s failed", name)
        return error_response("TRANSPORT_ERROR", str(exc))

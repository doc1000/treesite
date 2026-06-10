from __future__ import annotations

import json
import operator
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Literal, TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, StateGraph

from treesite_editor.config import TreeSiteConfig, find_repo_root, get_config
from treesite_editor.errors import TreeSiteError
from treesite_editor.logging_config import get_logger
from treesite_editor.models import ArtifactMeta, EditSessionState, ValidationResult
from treesite_editor import tools

log = get_logger(__name__)

OperationName = Literal[
    "add_card",
    "edit_card",
    "delete_card",
    "rename_card",
    "move_card",
    "hide_card",
    "unhide_card",
    "move_subtree",
]


class GraphState(TypedDict, total=False):
    artifact_path: str
    artifact_meta: dict[str, Any]
    pending_operations: list[dict[str, Any]]
    operations: list[dict[str, Any]]
    last_validation: dict[str, Any]
    manifest_rebuilt: bool
    want_preview: bool
    preview_url: str | None
    errors: Annotated[list[str], operator.add]
    status: str


def _read_artifact_meta(artifact_path: str) -> ArtifactMeta:
    meta_path = Path(artifact_path) / "artifact.json"
    raw = json.loads(meta_path.read_text(encoding="utf-8"))
    return ArtifactMeta.model_validate(raw)


def _dispatch_operation(artifact_path: str, operation: dict[str, Any]) -> dict[str, Any]:
    op_name = operation["op"]
    kwargs = dict(operation.get("kwargs") or {})
    fn = getattr(tools, op_name)
    result = fn(artifact_path, **kwargs)
    if hasattr(result, "model_dump"):
        payload = result.model_dump(mode="json", by_alias=True)
    else:
        payload = result
    return {"op": op_name, "kwargs": kwargs, "result": payload}


def _node_load_artifact(state: GraphState) -> GraphState:
    artifact = state["artifact_path"]
    started = time.perf_counter()
    log.info("node_enter", log_event="node_enter", node="load_artifact", artifact=artifact)
    try:
        tools.artifact_stats(artifact)
        tools.get_manifest(artifact)
        meta = _read_artifact_meta(artifact)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info(
            "node_exit",
            log_event="node_exit",
            node="load_artifact",
            elapsed_ms=elapsed_ms,
            ok=True,
        )
        return {
            "artifact_meta": meta.model_dump(mode="json", by_alias=True),
            "status": "loading",
            "errors": [],
        }
    except TreeSiteError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info("node_exit", log_event="node_exit", node="load_artifact", elapsed_ms=elapsed_ms, ok=False)
        return {"status": "error", "errors": [str(exc)]}


def _node_apply_operation(state: GraphState) -> GraphState:
    artifact = state["artifact_path"]
    pending = list(state.get("pending_operations") or [])
    if not pending:
        return {"status": "editing"}

    op = pending[0]
    rest = pending[1:]
    started = time.perf_counter()
    log.info("node_enter", log_event="node_enter", node="apply_operation", artifact=artifact, op=op.get("op"))
    try:
        record = _dispatch_operation(artifact, op)
        operations = list(state.get("operations") or [])
        operations.append(record)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info("node_exit", log_event="node_exit", node="apply_operation", elapsed_ms=elapsed_ms, ok=True)
        return {
            "pending_operations": rest,
            "operations": operations,
            "status": "editing",
        }
    except TreeSiteError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info("node_exit", log_event="node_exit", node="apply_operation", elapsed_ms=elapsed_ms, ok=False)
        return {"status": "error", "errors": [str(exc)], "pending_operations": []}


def _node_validate_artifact(state: GraphState) -> GraphState:
    artifact = state["artifact_path"]
    started = time.perf_counter()
    log.info("node_enter", log_event="node_enter", node="validate_artifact", artifact=artifact)
    try:
        validation = tools.validate(artifact)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info(
            "node_exit",
            log_event="node_exit",
            node="validate_artifact",
            elapsed_ms=elapsed_ms,
            valid=validation.valid,
        )
        if not validation.valid:
            return {
                "last_validation": validation.model_dump(),
                "status": "error",
                "errors": ["Artifact validation failed."],
            }
        return {
            "last_validation": validation.model_dump(),
            "status": "validating",
        }
    except TreeSiteError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info("node_exit", log_event="node_exit", node="validate_artifact", elapsed_ms=elapsed_ms, ok=False)
        return {"status": "error", "errors": [str(exc)]}


def _node_rebuild_manifest(state: GraphState) -> GraphState:
    artifact = state["artifact_path"]
    started = time.perf_counter()
    log.info("node_enter", log_event="node_enter", node="rebuild_manifest", artifact=artifact)
    try:
        tools.rebuild_manifest(artifact)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info("node_exit", log_event="node_exit", node="rebuild_manifest", elapsed_ms=elapsed_ms, ok=True)
        return {"manifest_rebuilt": True, "status": "rebuilding"}
    except TreeSiteError as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info("node_exit", log_event="node_exit", node="rebuild_manifest", elapsed_ms=elapsed_ms, ok=False)
        return {"status": "error", "errors": [str(exc)]}


def _node_start_preview(state: GraphState) -> GraphState:
    from treesite_editor.preview import get_active_preview_server, start_preview_for_session

    artifact = state["artifact_path"]
    started = time.perf_counter()
    log.info("node_enter", log_event="node_enter", node="start_preview", artifact=artifact)
    try:
        url = start_preview_for_session(artifact)
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info("node_exit", log_event="node_exit", node="start_preview", elapsed_ms=elapsed_ms, url=url)
        return {"preview_url": url, "status": "previewing"}
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info("node_exit", log_event="node_exit", node="start_preview", elapsed_ms=elapsed_ms, ok=False)
        get_active_preview_server()
        return {"status": "error", "errors": [f"Preview failed: {exc}"]}


def _node_handle_error(state: GraphState) -> GraphState:
    return {"status": "error"}


def _node_done(state: GraphState) -> GraphState:
    return {"status": "done"}


def _route_after_load(state: GraphState) -> str:
    if state.get("status") == "error":
        return "handle_error"
    if state.get("pending_operations"):
        return "apply_operation"
    return "validate_artifact"


def _route_after_apply(state: GraphState) -> str:
    if state.get("status") == "error":
        return "handle_error"
    if state.get("pending_operations"):
        return "apply_operation"
    return "validate_artifact"


def _route_after_validate(state: GraphState) -> str:
    if state.get("status") == "error":
        return "handle_error"
    return "rebuild_manifest"


def _route_after_rebuild(state: GraphState) -> str:
    if state.get("status") == "error":
        return "handle_error"
    if state.get("want_preview"):
        return "start_preview"
    return "done"


def _route_after_preview(state: GraphState) -> str:
    if state.get("status") == "error":
        return "handle_error"
    return "done"


def build_edit_graph():
    graph = StateGraph(GraphState)
    graph.add_node("load_artifact", _node_load_artifact)
    graph.add_node("apply_operation", _node_apply_operation)
    graph.add_node("validate_artifact", _node_validate_artifact)
    graph.add_node("rebuild_manifest", _node_rebuild_manifest)
    graph.add_node("start_preview", _node_start_preview)
    graph.add_node("handle_error", _node_handle_error)
    graph.add_node("done", _node_done)

    graph.set_entry_point("load_artifact")
    graph.add_conditional_edges("load_artifact", _route_after_load)
    graph.add_conditional_edges("apply_operation", _route_after_apply)
    graph.add_conditional_edges("validate_artifact", _route_after_validate)
    graph.add_conditional_edges("rebuild_manifest", _route_after_rebuild)
    graph.add_conditional_edges("start_preview", _route_after_preview)
    graph.add_edge("handle_error", END)
    graph.add_edge("done", END)
    return graph


def _sqlite_checkpointer() -> SqliteSaver:
    global _SQLITE_CHECKPOINTER
    if _SQLITE_CHECKPOINTER is None:
        db_path = find_repo_root() / "editor" / "sessions.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        _SQLITE_CHECKPOINTER = SqliteSaver(conn)
    return _SQLITE_CHECKPOINTER


_SQLITE_CHECKPOINTER: SqliteSaver | None = None


class EditSession:
    def __init__(self, artifact_path: str, config: TreeSiteConfig | None = None) -> None:
        self.config = config or get_config()
        repo_root = find_repo_root()
        self.artifact_path = str(
            self.config.resolve_artifact(artifact_path, repo_root)
        )
        self._queued: list[dict[str, Any]] = []
        self._loaded_meta: ArtifactMeta | None = None
        self._thread_id = f"{self.artifact_path}::{datetime.now(timezone.utc).isoformat()}"
        self._graph = build_edit_graph().compile(checkpointer=_sqlite_checkpointer())
        self._last_state: EditSessionState | None = None

    @property
    def thread_id(self) -> str:
        return self._thread_id

    def load(self) -> ArtifactMeta:
        tools.artifact_stats(self.artifact_path)
        self._loaded_meta = _read_artifact_meta(self.artifact_path)
        return self._loaded_meta

    def queue_operation(self, operation: str, **kwargs: Any) -> EditSession:
        self._queued.append({"op": operation, "kwargs": kwargs})
        return self

    def run(self, preview: bool = False) -> EditSessionState:
        initial: GraphState = {
            "artifact_path": self.artifact_path,
            "pending_operations": list(self._queued),
            "operations": [],
            "manifest_rebuilt": False,
            "want_preview": preview,
            "preview_url": None,
            "errors": [],
            "status": "idle",
        }
        self._queued = []

        final = self._graph.invoke(
            initial,
            config={"configurable": {"thread_id": self._thread_id}},
        )
        self._last_state = _state_from_graph(final)
        return self._last_state

    def checkpoint(self) -> str:
        return self._thread_id

    @classmethod
    def from_checkpoint(cls, checkpoint_id: str, config: TreeSiteConfig | None = None) -> EditSession:
        artifact_path = checkpoint_id.split("::", 1)[0]
        session = cls(artifact_path, config=config)
        session._thread_id = checkpoint_id
        return session

    def stop_preview(self) -> None:
        from treesite_editor.preview import stop_active_preview

        stop_active_preview()


def _state_from_graph(state: GraphState) -> EditSessionState:
    meta = state.get("artifact_meta")
    artifact_meta = ArtifactMeta.model_validate(meta) if meta else None
    last_val = state.get("last_validation")
    last_validation = ValidationResult.model_validate(last_val) if last_val else None
    return EditSessionState(
        artifact_path=state["artifact_path"],
        artifact_meta=artifact_meta,
        operations=list(state.get("operations") or []),
        last_validation=last_validation,
        manifest_rebuilt=bool(state.get("manifest_rebuilt")),
        preview_url=state.get("preview_url"),
        errors=list(state.get("errors") or []),
        status=state.get("status") or "idle",
    )


__all__ = ["EditSession", "EditSessionState"]

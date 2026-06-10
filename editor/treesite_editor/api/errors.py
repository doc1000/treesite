from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from treesite_editor.errors import TreeSiteError

_STATUS_BY_CODE: dict[str, int] = {
    "INVALID_INPUT": 400,
    "ITEM_NOT_FOUND": 404,
    "ARTIFACT_NOT_FOUND": 404,
    "ARTIFACT_MALFORMED": 422,
    "MANIFEST_DRIFT": 409,
    "DUPLICATE_ID": 409,
    "MIGRATION_FAILED": 500,
    "FILESYSTEM_ERROR": 409,
    "ASSET_NOT_FOUND": 422,
    "SCHEMA_VERSION_UNKNOWN": 422,
}


def http_status_for_error(exc: TreeSiteError) -> int:
    return _STATUS_BY_CODE.get(exc.code, 500)


def error_body(exc: TreeSiteError) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {
            "code": exc.code,
            "message": exc.message,
            "details": exc.details,
        },
    }


async def treesite_error_handler(_request: Request, exc: TreeSiteError) -> JSONResponse:
    status = http_status_for_error(exc)
    return JSONResponse(status_code=status, content=error_body(exc))

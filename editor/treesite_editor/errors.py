from __future__ import annotations

from typing import Any


class TreeSiteError(Exception):
    code: str = "TREESITE_ERROR"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        self.details = details or {}

    def __str__(self) -> str:
        return self.message


class ItemNotFoundError(TreeSiteError):
    code = "ITEM_NOT_FOUND"


class DuplicateIdError(TreeSiteError):
    code = "DUPLICATE_ID"


class InvalidInputError(TreeSiteError):
    code = "INVALID_INPUT"


class ArtifactNotFoundError(TreeSiteError):
    code = "ARTIFACT_NOT_FOUND"


class ArtifactMalformedError(TreeSiteError):
    code = "ARTIFACT_MALFORMED"


class ManifestDriftError(TreeSiteError):
    code = "MANIFEST_DRIFT"


class MigrationFailedError(TreeSiteError):
    code = "MIGRATION_FAILED"


class SchemaVersionUnknownError(TreeSiteError):
    code = "SCHEMA_VERSION_UNKNOWN"


class AssetNotFoundError(TreeSiteError):
    code = "ASSET_NOT_FOUND"


class FilesystemError(TreeSiteError):
    code = "FILESYSTEM_ERROR"


_ERROR_BY_CODE: dict[str, type[TreeSiteError]] = {
    cls.code: cls
    for cls in (
        ItemNotFoundError,
        DuplicateIdError,
        InvalidInputError,
        ArtifactNotFoundError,
        ArtifactMalformedError,
        ManifestDriftError,
        MigrationFailedError,
        SchemaVersionUnknownError,
        AssetNotFoundError,
        FilesystemError,
    )
}


def raise_for_tool_error(payload: dict[str, Any]) -> None:
    err = payload.get("error") or {}
    code = str(err.get("code") or "TREESITE_ERROR")
    message = str(err.get("message") or "Tool failed.")
    details = err.get("details") if isinstance(err.get("details"), dict) else {}
    exc_type = _ERROR_BY_CODE.get(code, TreeSiteError)
    raise exc_type(message, code=code, details=details)

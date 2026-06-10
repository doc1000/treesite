from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    summary="Health check",
    description="Returns service status and API version.",
)
def health() -> dict:
    from treesite_editor.api.config import get_api_config

    settings = get_api_config()
    return {"status": "ok", "version": settings.api_version}

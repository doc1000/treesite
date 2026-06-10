from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from treesite_editor.api.config import get_api_config
from treesite_editor.api.errors import treesite_error_handler
from treesite_editor.api.middleware import RequestLoggingMiddleware
from treesite_editor.api.routers import health
from treesite_editor.errors import TreeSiteError


def create_app() -> FastAPI:
    settings = get_api_config()
    app = FastAPI(
        title="TreeSite Editor API",
        version=settings.api_version,
        description="HTTP adapter over the TreeSite Python SDK for artifact inspection and editing.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestLoggingMiddleware)
    app.add_exception_handler(TreeSiteError, treesite_error_handler)

    app.include_router(health.router)
    return app


app = create_app()

from __future__ import annotations

import argparse
import json
import logging
import sys
from typing import Any

import anyio
import mcp.types as types
from mcp.server.lowlevel.server import NotificationOptions, Server
from mcp.server.models import InitializationOptions
from mcp.server.sse import SseServerTransport
from mcp.server.stdio import stdio_server
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Mount, Route

from treesite_editor.logging_config import configure_logging
from treesite_editor.mcp.config import get_mcp_config
from treesite_editor.mcp.handler import dispatch_tool
from treesite_editor.mcp.registry import get_tool_definitions
from treesite_editor.mcp.session import ArtifactSession

logger = logging.getLogger(__name__)

_session: ArtifactSession | None = None


def get_session() -> ArtifactSession:
    global _session
    if _session is None:
        config = get_mcp_config()
        _session = ArtifactSession.open(config.default_artifact)
    return _session


def create_server() -> Server:
    server = Server("treesite-editor")

    @server.list_tools()
    async def handle_list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name=t.name,
                description=t.description,
                inputSchema=t.input_schema,
            )
            for t in get_tool_definitions()
        ]

    @server.call_tool()
    async def handle_call_tool(
        name: str, arguments: dict[str, Any] | None
    ) -> list[types.TextContent]:
        session = get_session()
        payload = dispatch_tool(session, name, arguments)
        return [types.TextContent(type="text", text=json.dumps(payload))]

    return server


async def run_stdio() -> None:
    config = get_mcp_config()
    get_session()
    logger.info(
        "MCP server starting transport=stdio artifact=%s tools=%s",
        config.default_artifact,
        len(get_tool_definitions()),
    )
    server = create_server()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="treesite-editor",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


async def run_sse(host: str, port: int) -> None:
    import uvicorn

    config = get_mcp_config()
    get_session()
    logger.info(
        "MCP server starting transport=sse host=%s port=%s artifact=%s tools=%s",
        host,
        port,
        config.default_artifact,
        len(get_tool_definitions()),
    )
    server = create_server()
    sse = SseServerTransport("/messages/")

    async def handle_sse(request: Request) -> Response:
        async with sse.connect_sse(
            request.scope, request.receive, request._send
        ) as streams:
            await server.run(
                streams[0],
                streams[1],
                InitializationOptions(
                    server_name="treesite-editor",
                    server_version="0.1.0",
                    capabilities=server.get_capabilities(
                        notification_options=NotificationOptions(),
                        experimental_capabilities={},
                    ),
                ),
            )
        return Response()

    starlette_app = Starlette(
        routes=[
            Route("/sse", endpoint=handle_sse, methods=["GET"]),
            Mount("/messages/", app=sse.handle_post_message),
        ]
    )
    uvicorn_config = uvicorn.Config(
        starlette_app,
        host=host,
        port=port,
        log_level=config.log_level.lower(),
    )
    uvicorn_server = uvicorn.Server(uvicorn_config)
    await uvicorn_server.serve()


def main() -> None:
    configure_logging()
    parser = argparse.ArgumentParser(description="TreeSite MCP server")
    parser.add_argument(
        "--transport",
        choices=("stdio", "sse"),
        default=None,
        help="MCP transport (default: stdio, or TREESITE_MCP_TRANSPORT)",
    )
    parser.add_argument("--port", type=int, default=8001, help="SSE port (default 8001)")
    parser.add_argument("--host", default="127.0.0.1", help="SSE bind host")
    args = parser.parse_args()
    config = get_mcp_config()
    transport = args.transport or config.mcp_transport
    if transport == "sse":
        anyio.run(run_sse, args.host, args.port)
    else:
        anyio.run(run_stdio)


if __name__ == "__main__":
    main()

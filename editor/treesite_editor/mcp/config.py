from __future__ import annotations

from functools import lru_cache

from treesite_editor.config import TreeSiteConfig


class McpConfig(TreeSiteConfig):
    mcp_transport: str = "stdio"
    session_timeout_seconds: int = 300


@lru_cache
def get_mcp_config() -> McpConfig:
    return McpConfig()

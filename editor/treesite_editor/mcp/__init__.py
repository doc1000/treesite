"""MCP adapter over the TreeSite Python SDK."""

from treesite_editor.mcp.handler import dispatch_tool
from treesite_editor.mcp.registry import get_tool_definitions, list_tool_names

__all__ = ["dispatch_tool", "get_tool_definitions", "list_tool_names"]

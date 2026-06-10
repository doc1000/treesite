"""
Optional LLM demo: an agent explores the example artifact and adds a summary card.

Requires ANTHROPIC_API_KEY (and optional deps: pip install -e "editor/[llm]").
"""

from __future__ import annotations

import asyncio
import os
import sys


async def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Set ANTHROPIC_API_KEY to run the LLM MCP demo.", file=sys.stderr)
        sys.exit(0)

    try:
        from langchain_anthropic import ChatAnthropic
        from langchain_mcp_adapters.client import MultiServerMCPClient
        from langgraph.prebuilt import create_react_agent
    except ImportError:
        print(
            'Install optional deps: pip install -e "editor/[llm]"',
            file=sys.stderr,
        )
        sys.exit(1)

    mcp_client = MultiServerMCPClient(
        {
            "treesite": {
                "command": sys.executable,
                "args": ["-m", "treesite_editor.mcp.server"],
                "transport": "stdio",
            }
        }
    )

    tools = await mcp_client.get_tools()
    model = ChatAnthropic(model="claude-3-5-sonnet-latest")
    agent = create_react_agent(model, tools)

    response = await agent.ainvoke(
        {
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Look at the example artifact. "
                        "Find the 'About This Site' section and add a new text card called 'LLM Demo Card' "
                        "with a description summarizing what you found in that section. "
                        "Then validate the artifact."
                    ),
                }
            ]
        }
    )

    print(response["messages"][-1].content)


if __name__ == "__main__":
    asyncio.run(main())

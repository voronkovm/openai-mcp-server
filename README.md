Installation:

1) Download and install:
cd /Users/user/Documents/Cline/MCP/
git clone github.com/voronkovm/openai-mcp-server.git
npm install && npm run clean-build

2) add to mcp_settings.json
{
  "mcpServers": {
    "github.com/voronkovm/openai-mcp-server": {
      "autoApprove": [],
      "timeout": 60,
      "command": "node",
      "args": [
        "/Users/user/Documents/Cline/MCP/openai-mcp-server/build/index.js"
      ],
      "env": {
        "OPENAI_MCP_API_KEY": "sk-proj-....",
        "OPENAI_MCP_MODEL": "gpt-4o"
      },
      "transportType": "stdio"
    }
  }
}
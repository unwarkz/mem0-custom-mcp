# Mem0 Custom MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![MCP Protocol](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io/)

A custom Model Context Protocol (MCP) server that connects to self-hosted Mem0 API instances. Enables Claude Code to use your own Mem0 deployment for memory management.

## Why This Exists

The official `@mem0/mcp-server` and community `@pinkpixel/mem0-mcp` packages only support:
- Mem0's cloud platform (requires `MEM0_API_KEY`)
- Supabase backend
- Local storage

**Neither supports connecting to custom self-hosted Mem0 API endpoints.**

This custom MCP server bridges that gap by providing a wrapper around your self-hosted Mem0 API.

## Features

- ✅ Connects to self-hosted Mem0 API at custom endpoints
- ✅ Implements MCP stdio protocol for Claude Code integration
- ✅ Supports all core Mem0 operations:
  - `add_memory` - Store new memories
  - `search_memories` - Semantic search through memories
  - `get_memories` - Retrieve all memories for a user
  - `delete_memory` - Delete specific memories
- ✅ Environment variable configuration
- ✅ Full TypeScript implementation with type safety

## Installation

### From GitHub (Recommended for now)

```bash
# Clone the repository
git clone https://github.com/emasoudy/mem0-custom-mcp.git
cd mem0-custom-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### From npm (Future - when published)

```bash
# This will be available after npm publish
npm install -g mem0-custom-mcp
```

## Configuration

The server is configured via environment variables:

- `MEM0_API_URL` - Your Mem0 API endpoint (default: `http://localhost:8888`)
- `DEFAULT_USER_ID` - Default user ID for memory operations (default: `default`)

**Example configurations:**
- Local: `http://localhost:8888`
- Docker: `http://host.docker.internal:8888`
- Remote/VPN: `http://your-server-ip:8888`

### Claude Code Configuration

You can configure this MCP server at either **user level** (available in all projects) or **project level** (specific project only).

#### Option 1: Using CLI (Recommended)

**User-level (available everywhere):**
```bash
claude mcp add mem0 \
  --scope user \
  --command node \
  --arg "/absolute/path/to/mem0-custom-mcp/dist/index.js" \
  --env MEM0_API_URL=http://localhost:8888 \
  --env DEFAULT_USER_ID=default
```

**Project-level (specific project only):**
```bash
cd /path/to/your/project
claude mcp add mem0 \
  --scope project \
  --command node \
  --arg "/absolute/path/to/mem0-custom-mcp/dist/index.js" \
  --env MEM0_API_URL=http://localhost:8888 \
  --env DEFAULT_USER_ID=default
```

#### Option 2: Manual Configuration

**User-level** - Edit `~/.claude.json`:
```json
{
  "mcpServers": {
    "mem0": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/mem0-custom-mcp/dist/index.js"
      ],
      "env": {
        "MEM0_API_URL": "http://localhost:8888",
        "DEFAULT_USER_ID": "default"
      }
    }
  }
}
```

**Project-level** - Edit `.claude.json` in your project root:
```json
{
  "projects": {
    "your-project-path": {
      "mcpServers": {
        "mem0": {
          "type": "stdio",
          "command": "node",
          "args": [
            "/absolute/path/to/mem0-custom-mcp/dist/index.js"
          ],
          "env": {
            "MEM0_API_URL": "http://localhost:8888",
            "DEFAULT_USER_ID": "default"
          }
        }
      }
    }
  }
}
```

**Verify installation:**
```bash
claude mcp list
# Should show "mem0" in the list
```

## Development

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Build and run the server
- `npm start` - Run the compiled server

## Available Tools

### add_memory

Store a new memory in Mem0.

**Parameters:**
- `content` (required) - The content to store
- `user_id` (optional) - User ID (defaults to env DEFAULT_USER_ID)
- `metadata` (optional) - Additional metadata object

### search_memories

Search memories using semantic search.

**Parameters:**
- `query` (required) - Search query string
- `user_id` (optional) - User ID (defaults to env DEFAULT_USER_ID)
- `limit` (optional) - Maximum results (default: 10)

### get_memories

Retrieve all memories for a user.

**Parameters:**
- `user_id` (optional) - User ID (defaults to env DEFAULT_USER_ID)
- `limit` (optional) - Maximum results (default: 100)

### delete_memory

Delete a specific memory by ID.

**Parameters:**
- `memory_id` (required) - ID of the memory to delete

## Architecture

This MCP server acts as a bridge between Claude Code and your self-hosted Mem0 API instance:

```
┌─────────────────────────┐
│     Claude Code         │
└────────────┬────────────┘
             │ MCP stdio protocol
             │
┌────────────▼────────────┐
│   mem0-custom-mcp       │  ← This MCP server (Node.js)
│   (MCP wrapper)         │
└────────────┬────────────┘
             │ HTTP REST API (localhost:8888 or custom URL)
             │
┌────────────▼────────────┐
│  Self-Hosted Mem0 API   │  ← Mem0 API server (Python/FastAPI)
│  (your-server:8888)     │    Handles memory operations
└────────────┬────────────┘
             │
        ┌────┴─────┐
        │          │
   ┌────▼───┐  ┌──▼──────┐
   │PGVector│  │  Neo4j  │  ← Databases managed by Mem0 API
   │(Vector)│  │ (Graph) │
   └────────┘  └─────────┘
```

**Flow:**
1. Claude Code calls MCP tools (add_memory, search_memories, etc.)
2. mem0-custom-mcp receives requests via MCP stdio protocol
3. mem0-custom-mcp forwards to Mem0 API via HTTP
4. Mem0 API processes requests and manages PostgreSQL/Neo4j databases
5. Results flow back through the chain to Claude Code

**Note:** This server does NOT directly access PostgreSQL or Neo4j. It communicates only with the Mem0 API endpoint, which handles all database operations.

## Mem0 API Endpoints Used

This MCP server uses the following Mem0 API endpoints:

- `POST /v1/memories` - Add new memory
  - Body: `{"messages": [{"role": "user", "content": "..."}], "user_id": "...", "metadata": {}}`
- `GET /v1/memories/{user_id}` - Get all memories for a user
  - Path parameter: user_id
- `POST /v1/memories/search` - Search memories with semantic search
  - Body: `{"query": "...", "user_id": "...", "limit": 10}`
- `DELETE /v1/memories/{memory_id}` - Delete a specific memory
  - Path parameter: memory_id

## Troubleshooting

### Server won't start

Check debug logs in `~/.claude/debug/` for error messages.

Common issues:
- Mem0 API not accessible (check VPN connection)
- Invalid endpoint URL
- Port conflicts

### Connection timeout

Increase MCP timeout:
```bash
export MCP_TIMEOUT=60000  # 60 seconds
```

### Tool errors

Verify your Mem0 API is running:
```bash
# For local deployment
curl http://localhost:8888/health

# For remote/VPN deployment
curl http://your-server-ip:8888/health
```

Expected response:
```json
{"status":"ok","db_connected":true,"stores":{"vector":"postgresql","graph":"neo4j"}}
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development

```bash
# Clone and setup
git clone https://github.com/emasoudy/mem0-custom-mcp.git
cd mem0-custom-mcp
npm install

# Make changes to src/index.ts
# Build and test
npm run build
npm run dev  # Build and run
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built for the [Model Context Protocol](https://modelcontextprotocol.io/)
- Works with [Mem0](https://mem0.ai/) self-hosted instances
- Designed for [Claude Code](https://code.claude.com/)

## Support

- 🐛 [Report bugs](https://github.com/emasoudy/mem0-custom-mcp/issues)
- 💡 [Request features](https://github.com/emasoudy/mem0-custom-mcp/issues)
- 📖 [Read the docs](https://github.com/emasoudy/mem0-custom-mcp#readme)

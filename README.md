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
- ✅ Full coverage of all mem0 REST API endpoints:
  - Memory CRUD: `add_memory`, `get_memories`, `get_memory`, `update_memory`, `delete_memory`, `delete_all_memories`
  - Search: `search_memories` (semantic / vector search)
  - History & reset: `get_memory_history`, `reset_memories`
  - Config & health: `get_health`, `get_config`, `switch_provider`, `configure`
- ✅ Supports `user_id`, `agent_id`, and `run_id` scope identifiers on all relevant operations
- ✅ Environment variable configuration
- ✅ Full TypeScript implementation with type safety
- ✅ **120-second timeout** for slow Mem0 API responses (handles LLM processing delays)
- ✅ Proper MCP error types (`McpError` / `ErrorCode`) for standards-compliant error handling

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

Store new memories extracted from a message in Mem0.

**Parameters:**
- `content` (required) - The content to remember
- `user_id` (optional) - User ID (defaults to `DEFAULT_USER_ID` env var)
- `agent_id` (optional) - Agent ID scope
- `run_id` (optional) - Run / session ID scope
- `metadata` (optional) - Additional metadata key-value pairs

### get_memories

Retrieve all memories for a user / agent / run.

**Parameters:**
- `user_id` (optional) - User ID (defaults to `DEFAULT_USER_ID` env var)
- `agent_id` (optional) - Filter by agent ID
- `run_id` (optional) - Filter by run/session ID

### get_memory

Retrieve a single memory by its ID.

**Parameters:**
- `memory_id` (required) - Memory ID

### search_memories

Semantic search across memories.

**Parameters:**
- `query` (required) - Search query
- `user_id` (optional) - Scope to user ID (defaults to `DEFAULT_USER_ID` env var)
- `agent_id` (optional) - Scope to agent ID
- `run_id` (optional) - Scope to run/session ID
- `filters` (optional) - Additional metadata filters
- `limit` (optional) - Max results (default: 10)

### update_memory

Update the text content of an existing memory.

**Parameters:**
- `memory_id` (required) - ID of the memory to update
- `data` (required) - New text content for the memory

### get_memory_history

Get the change history of a memory.

**Parameters:**
- `memory_id` (required) - Memory ID

### delete_memory

Delete a specific memory by ID.

**Parameters:**
- `memory_id` (required) - Memory ID to delete

### delete_all_memories

Delete all memories for a given user / agent / run.

**Parameters:**
- `user_id` (optional) - Delete memories for this user ID (defaults to `DEFAULT_USER_ID` env var)
- `agent_id` (optional) - Delete memories for this agent ID
- `run_id` (optional) - Delete memories for this run/session ID

### reset_memories

Reset (wipe) all memories in the store. No parameters.

### get_health

Check the health and current LLM configuration of the Mem0 service. No parameters.

### get_config

Get the current Mem0 service configuration (LLM provider, embedder, vector store, graph store). No parameters.

### switch_provider

Switch the LLM provider used by the Mem0 service on the fly (no service restart required).

**Parameters:**
- `provider` (required) - One of: `gemini` | `openrouter` | `nvidia` | `qwen`
- `model` (optional) - Model override (e.g. `gemini/gemini-3.1-flash-lite-preview`, `anthropic/claude-sonnet-4-6`)

### configure

Replace the full mem0 Memory configuration (advanced use).

**Parameters:**
- `config` (required) - Full mem0 configuration object

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
   │Qdrant  │  │  Neo4j  │  ← Databases managed by Mem0 API
   │(Vector)│  │ (Graph) │
   └────────┘  └─────────┘
```

**Flow:**
1. Claude Code calls MCP tools (add_memory, search_memories, etc.)
2. mem0-custom-mcp receives requests via MCP stdio protocol
3. mem0-custom-mcp forwards to Mem0 API via HTTP
4. Mem0 API processes requests and manages Qdrant/Neo4j databases
5. Results flow back through the chain to Claude Code

**Note:** This server does NOT directly access Qdrant or Neo4j. It communicates only with the Mem0 API endpoint, which handles all database operations.

## Mem0 API Endpoints Used

All endpoints are called with the `/v1/` prefix:

| Tool | Method | Endpoint |
|------|--------|----------|
| `add_memory` | POST | `/v1/memories` |
| `get_memories` | GET | `/v1/memories?user_id=...` |
| `get_memory` | GET | `/v1/memories/{memory_id}` |
| `search_memories` | POST | `/v1/search` |
| `update_memory` | PUT | `/v1/memories/{memory_id}` |
| `get_memory_history` | GET | `/v1/memories/{memory_id}/history` |
| `delete_memory` | DELETE | `/v1/memories/{memory_id}` |
| `delete_all_memories` | DELETE | `/v1/memories?user_id=...` |
| `reset_memories` | POST | `/v1/reset` |
| `get_health` | GET | `/v1/health` |
| `get_config` | GET | `/v1/config` |
| `switch_provider` | POST | `/v1/config/switch` |
| `configure` | POST | `/v1/configure` |

## Troubleshooting

### Server won't start

Check debug logs in `~/.claude/debug/` for error messages.

Common issues:
- Mem0 API not accessible (check VPN connection)
- Invalid endpoint URL
- Port conflicts

### Connection timeout

The MCP server has a built-in **120-second timeout** for Mem0 API requests. This accommodates the time needed for:
- LLM API calls to generate embeddings
- LLM processing to extract entities and relationships
- Database operations (Qdrant + Neo4j)

Typical memory creation takes 30-60 seconds when using a hosted LLM.

If you need to adjust the timeout, modify `src/index.ts`:
```typescript
const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 minutes
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
{"status": "ok", "provider": "gemini", "model": "gemini/gemini-3.1-flash-lite-preview", "embedder": "models/gemini-embedding-2-preview", "dims": 1536}
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

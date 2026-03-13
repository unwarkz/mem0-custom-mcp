# Mem0 Custom MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![MCP Protocol](https://img.shields.io/badge/MCP-HTTP%20Streamable-purple)](https://modelcontextprotocol.io/)

A custom Model Context Protocol (MCP) server that connects to self-hosted Mem0 API instances over the network. Enables Claude Code and VS Code to use your own Mem0 deployment for memory management — from any machine.

> **Based on the excellent work of [emasoudy/mem0-custom-mcp](https://github.com/emasoudy/mem0-custom-mcp)** by Essam Masoudy.  
> This fork extends the original with improved logging (request tracing, log-level control, stack traces) and documentation improvements.

## Why This Exists

The official `@mem0/mcp-server` and community `@pinkpixel/mem0-mcp` packages only support:
- Mem0's cloud platform (requires `MEM0_API_KEY`)
- Supabase backend
- Local storage

**Neither supports connecting to custom self-hosted Mem0 API endpoints — and neither exposes the MCP endpoint over the network.**

This server bridges that gap: it wraps your self-hosted Mem0 API and exposes an MCP **HTTP Streamable** endpoint that any machine on your network can reach.

## Features

- ✅ Connects to self-hosted Mem0 API at a custom endpoint (`MEM0_API_URL`)
- ✅ Implements MCP **HTTP Streamable** transport — accessible from any machine on the network
- ✅ Full coverage of all mem0 REST API endpoints (13 tools)
- ✅ `user_id`, `agent_id`, and `run_id` scope identifiers on all relevant operations
- ✅ Stateful session management (each MCP client gets an isolated session)
- ✅ `Authorization: Bearer <token>` protection for both the MCP endpoint and mem0 backend
- ✅ Structured JSON logging to stderr with configurable log level (`LOG_LEVEL`)
- ✅ Every incoming client request and every outgoing mem0 call is logged with timing
- ✅ Error logs include stack traces to pinpoint failures
- ✅ **120-second timeout** for slow Mem0 API responses (handles LLM processing delays)
- ✅ Docker-ready with built-in `/health` endpoint and `HEALTHCHECK`

## Installation

### Docker (Recommended)

```bash
git clone https://github.com/unwarkz/mem0-custom-mcp.git
cd mem0-custom-mcp
cp .env.example .env   # edit as needed
docker compose up -d
```

The server starts on port `3000` by default. Override with `MCP_PORT` in `.env`.

### Node.js

```bash
git clone https://github.com/unwarkz/mem0-custom-mcp.git
cd mem0-custom-mcp
npm install
npm run build
npm start
```

## Configuration

Configure via environment variables (copy `.env.example` to `.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `MEM0_API_URL` | `http://localhost:8888` | URL of your self-hosted Mem0 API |
| `DEFAULT_USER_ID` | `default` | Fallback user ID when none is supplied in a tool call |
| `MCP_PORT` | `3000` | Port the HTTP MCP server listens on |
| `MEM0_BEARER_TOKEN` | _(unset)_ | If set, sent as `Authorization: Bearer <token>` on every request to mem0 |
| `MCP_AUTH_TOKEN` | _(unset)_ | If set, every MCP HTTP request must include a matching `Authorization: Bearer <token>` header |
| `LOG_LEVEL` | `INFO` | Log verbosity: `DEBUG` \| `INFO` \| `WARN` \| `ERROR` |

**`MEM0_BEARER_TOKEN`** — authenticate this MCP server's requests to the mem0 backend.

**`MCP_AUTH_TOKEN`** — protect this MCP server from unauthorised callers:
```
Authorization: Bearer your-secret
```

### Logging

All log entries go to **stderr** as newline-delimited JSON:
```json
{"ts":"2026-03-13T12:00:00.000Z","level":"INFO","message":"incoming request","data":{"method":"POST","url":"/mcp","remoteIp":"192.168.1.5","sessionId":null}}
{"ts":"2026-03-13T12:00:00.010Z","level":"INFO","message":"session created","data":{"sessionId":"abc-123"}}
{"ts":"2026-03-13T12:00:00.050Z","level":"INFO","message":"mem0 request","data":{"method":"POST","url":"/v1/memories/","body":{...}}}
{"ts":"2026-03-13T12:00:01.200Z","level":"INFO","message":"mem0 response","data":{"method":"POST","url":"/v1/memories/","status":200,"elapsed":1150}}
```

Error entries include a `stack` field for easy debugging:
```json
{"ts":"...","level":"ERROR","message":"mem0 call failed","data":{"method":"POST","url":"/v1/memories/","elapsed":100,"error":"fetch failed","stack":"Error: fetch failed\n    at ..."}}
```

Set `LOG_LEVEL=DEBUG` to log additional diagnostic detail.

### Connecting MCP Clients (HTTP Streamable)

The server exposes a single HTTP endpoint at `http://<host>:<MCP_PORT>/mcp`.  
Connect to it from any machine on the network using `"type": "http"`.

> **Network access note:** The server binds to `0.0.0.0` by default so it is reachable on all
> network interfaces. Restrict access with firewall rules or set `MCP_AUTH_TOKEN`.

#### VS Code `settings.json`

```json
{
  "mcp": {
    "servers": {
      "mem0": {
        "type": "http",
        "url": "http://<docker-host-ip>:3000/mcp"
      }
    }
  }
}
```

With `MCP_AUTH_TOKEN` set:
```json
{
  "mcp": {
    "servers": {
      "mem0": {
        "type": "http",
        "url": "http://<docker-host-ip>:3000/mcp",
        "headers": {
          "Authorization": "Bearer your-secret"
        }
      }
    }
  }
}
```

#### Claude Code CLI

```bash
claude mcp add mem0 \
  --transport http \
  --url "http://<docker-host-ip>:3000/mcp"
```

#### `.mcp.json` project file

```json
{
  "mcpServers": {
    "mem0": {
      "type": "http",
      "url": "http://<docker-host-ip>:3000/mcp"
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `add_memory` | Store new memories extracted from a message |
| `get_memories` | Retrieve all memories for a user / agent / run |
| `get_memory` | Retrieve a single memory by ID |
| `search_memories` | Semantic search across memories |
| `update_memory` | Update the text of an existing memory |
| `get_memory_history` | Get the change history of a memory |
| `delete_memory` | Delete a specific memory by ID |
| `delete_all_memories` | Delete all memories for a user / agent / run |
| `reset_memories` | Wipe the entire memory store |
| `get_health` | Check service health and current LLM info |
| `get_config` | Get current mem0 configuration |
| `switch_provider` | Hot-swap the LLM provider (no restart needed) |
| `configure` | Replace the full mem0 Memory configuration |

All tools that operate on memories accept optional `user_id`, `agent_id`, and `run_id` scope parameters.

## Architecture

```
┌─────────────────────────────────────────┐
│  MCP Client (VS Code / Claude Code)     │
│  on any machine on the network          │
└────────────────────┬────────────────────┘
                     │ MCP HTTP Streamable (port 3000)
                     │ POST/GET/DELETE http://<host>:3000/mcp
┌────────────────────▼────────────────────┐
│         mem0-custom-mcp                 │  ← This MCP server (Node.js / Docker)
│     HTTP Streamable MCP Server          │    McpServer + StreamableHTTPServerTransport
└────────────────────┬────────────────────┘
                     │ HTTP REST API
┌────────────────────▼────────────────────┐
│       Self-Hosted Mem0 API              │  ← Mem0 API server (Python/FastAPI)
│       (host.docker.internal:8888)       │
└──────────────┬─────────────────┬────────┘
               │                 │
        ┌──────▼──────┐   ┌──────▼──────┐
        │   Qdrant    │   │   Neo4j     │
        │  (Vector)   │   │   (Graph)   │
        └─────────────┘   └─────────────┘
```

## Troubleshooting

### View server logs

```bash
docker compose logs -f mem0-custom-mcp
```

### Health check

```bash
curl http://<docker-host-ip>:3000/health
# {"status":"ok","sessions":0}
```

### Connection timeout

The server has a built-in **120-second timeout** for Mem0 API requests to accommodate LLM processing. Typical memory creation takes 30–60 seconds with a hosted LLM.

### Verify Mem0 API is reachable

```bash
curl http://localhost:8888/health
# {"status": "ok", "provider": "gemini", ...}
```

## License

MIT License — see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built for the [Model Context Protocol](https://modelcontextprotocol.io/)
- Works with [Mem0](https://mem0.ai/) self-hosted instances
- Designed for [Claude Code](https://code.claude.com/)


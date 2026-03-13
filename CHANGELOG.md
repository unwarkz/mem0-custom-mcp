# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-03-13

### Added
- **Full mem0 API coverage** — 13 tools covering every endpoint in the self-hosted Mem0 service:
  - `get_memory` — retrieve a single memory by ID (`GET /v1/memories/{id}`)
  - `update_memory` — update memory text content (`PUT /v1/memories/{id}`)
  - `get_memory_history` — change history for a memory (`GET /v1/memories/{id}/history`)
  - `delete_all_memories` — bulk-delete by user/agent/run (`DELETE /v1/memories?user_id=...`)
  - `reset_memories` — wipe entire memory store (`POST /v1/reset`)
  - `get_health` — service health & current LLM info (`GET /v1/health`)
  - `get_config` — current configuration (`GET /v1/config`)
  - `switch_provider` — hot-swap LLM provider (`POST /v1/config/switch`)
  - `configure` — full mem0 config replacement (`POST /v1/configure`)
- **`agent_id` and `run_id` scope support** on `add_memory`, `get_memories`, `search_memories`, and `delete_all_memories`
- **`filters` parameter** on `search_memories` for metadata filtering

### Fixed
- `search_memories` was calling wrong endpoint `/v1/memories/search/` → corrected to `/v1/search`
- `get_memories` was using user_id as a path parameter → corrected to use query parameters (`?user_id=...`)

### Changed
- Updated `@modelcontextprotocol/sdk` from `^1.0.4` to `^1.27.1`
- Replaced generic `Error` throws with standards-compliant `McpError` / `ErrorCode` from the MCP SDK
- `callMem0API` helper now supports query-string parameters and handles empty-body responses
- Server version bumped to `1.2.0`
- README rewritten to document all 13 tools, correct endpoint table, and updated architecture diagram

## [1.1.0] - 2025-11-09

### Added
- **120-second timeout** for Mem0 API requests using AbortController
  - Prevents premature timeout failures when Mem0 API is processing memories
  - Accommodates OpenAI API calls, LLM processing, and database operations
  - Typical memory creation takes 30-60 seconds with GPT-5-mini

### Changed
- Improved error handling for slow API responses
- Better timeout management to handle long-running memory operations

### Fixed
- Fixed "fetch failed" errors when Mem0 API takes longer than default timeout
- Resolved connection failures during memory creation with complex entity extraction

## [1.0.0] - 2025-11-08

### Added
- Initial release of mem0-custom-mcp
- MCP stdio protocol implementation for Claude Code
- Support for self-hosted Mem0 API instances
- Four core tools:
  - `add_memory` - Store new memories
  - `search_memories` - Semantic search through memories
  - `get_memories` - Retrieve all memories for a user
  - `delete_memory` - Delete specific memories
- Environment variable configuration (MEM0_API_URL, DEFAULT_USER_ID)
- TypeScript implementation with full type safety
- Zod schema validation for all tool inputs
- Comprehensive error handling
- Detailed README with usage examples
- MIT License

### Features
- Connects to custom self-hosted Mem0 API endpoints
- Works with any Mem0 instance (not limited to cloud service)
- Full MCP protocol compatibility with Claude Code
- User-configurable via environment variables
- Production-ready TypeScript codebase

[1.1.0]: https://github.com/emasoudy/mem0-custom-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/emasoudy/mem0-custom-mcp/releases/tag/v1.0.0

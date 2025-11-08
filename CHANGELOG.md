# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/YOUR_USERNAME/mem0-custom-mcp/releases/tag/v1.0.0

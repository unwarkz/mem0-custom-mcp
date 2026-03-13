#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Environment configuration
const MEM0_API_URL = process.env.MEM0_API_URL || "http://localhost:8888";
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "default";

// ── Zod schemas for input validation ─────────────────────────────────────────

const AddMemorySchema = z.object({
  content: z.string().describe("The content to store as a memory"),
  user_id: z.string().optional().describe("User ID (defaults to env DEFAULT_USER_ID)"),
  agent_id: z.string().optional().describe("Agent ID scope for the memory"),
  run_id: z.string().optional().describe("Run / session ID scope for the memory"),
  metadata: z.record(z.any()).optional().describe("Optional metadata key-value pairs"),
});

const SearchMemoriesSchema = z.object({
  query: z.string().describe("Semantic search query"),
  user_id: z.string().optional().describe("User ID (defaults to env DEFAULT_USER_ID)"),
  agent_id: z.string().optional().describe("Filter by agent ID"),
  run_id: z.string().optional().describe("Filter by run/session ID"),
  filters: z.record(z.any()).optional().describe("Additional metadata filters"),
  limit: z.number().optional().describe("Maximum number of results (default: 10)"),
});

const GetMemoriesSchema = z.object({
  user_id: z.string().optional().describe("User ID (defaults to env DEFAULT_USER_ID)"),
  agent_id: z.string().optional().describe("Filter by agent ID"),
  run_id: z.string().optional().describe("Filter by run/session ID"),
});

const GetMemorySchema = z.object({
  memory_id: z.string().describe("ID of the memory to retrieve"),
});

const UpdateMemorySchema = z.object({
  memory_id: z.string().describe("ID of the memory to update"),
  data: z.string().describe("New text content for the memory"),
});

const GetMemoryHistorySchema = z.object({
  memory_id: z.string().describe("ID of the memory whose change history to retrieve"),
});

const DeleteMemorySchema = z.object({
  memory_id: z.string().describe("ID of the memory to delete"),
});

const DeleteAllMemoriesSchema = z.object({
  user_id: z.string().optional().describe("Delete all memories for this user ID"),
  agent_id: z.string().optional().describe("Delete all memories for this agent ID"),
  run_id: z.string().optional().describe("Delete all memories for this run/session ID"),
});

const SwitchProviderSchema = z.object({
  provider: z.enum(["gemini", "openrouter", "nvidia", "qwen"]).describe(
    "LLM provider to switch to: gemini | openrouter | nvidia | qwen"
  ),
  model: z.string().optional().describe(
    "Optional model override. Examples: gemini/gemini-3.1-flash-lite-preview, anthropic/claude-sonnet-4-6"
  ),
});

const ConfigureSchema = z.object({
  config: z.record(z.any()).describe("Full mem0 configuration object"),
});

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function callMem0API(
  endpoint: string,
  method: string = "GET",
  body?: unknown,
  queryParams?: Record<string, string>
): Promise<unknown> {
  let url = `${MEM0_API_URL}${endpoint}`;

  if (queryParams && Object.keys(queryParams).length > 0) {
    const qs = new URLSearchParams(queryParams).toString();
    url = `${url}?${qs}`;
  }

  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  // 2-minute timeout to accommodate slow LLM-based memory processing
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new McpError(
        ErrorCode.InternalError,
        `Mem0 API error (${response.status}): ${errorText}`
      );
    }

    // Some endpoints return empty bodies (204 No Content style)
    const text = await response.text();
    return text ? JSON.parse(text) : { message: "OK" };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof McpError) throw error;
    if (error instanceof Error) {
      throw new McpError(ErrorCode.InternalError, `Failed to call Mem0 API: ${error.message}`);
    }
    throw error;
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "mem0-custom-mcp", version: "1.2.0" },
  { capabilities: { tools: {} } }
);

// ── Tool list ─────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Memory CRUD ──────────────────────────────────────────────────────────
    {
      name: "add_memory",
      description: "Store new memories extracted from a message in Mem0",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "Content to remember" },
          user_id: { type: "string", description: "User ID (defaults to DEFAULT_USER_ID env var)" },
          agent_id: { type: "string", description: "Agent ID scope" },
          run_id: { type: "string", description: "Run / session ID scope" },
          metadata: { type: "object", description: "Optional metadata key-value pairs" },
        },
        required: ["content"],
      },
    },
    {
      name: "get_memories",
      description: "Retrieve all memories for a user / agent / run",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "User ID (defaults to DEFAULT_USER_ID env var)" },
          agent_id: { type: "string", description: "Filter by agent ID" },
          run_id: { type: "string", description: "Filter by run/session ID" },
        },
      },
    },
    {
      name: "get_memory",
      description: "Retrieve a single memory by its ID",
      inputSchema: {
        type: "object",
        properties: {
          memory_id: { type: "string", description: "Memory ID" },
        },
        required: ["memory_id"],
      },
    },
    {
      name: "search_memories",
      description: "Semantic search across memories",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          user_id: { type: "string", description: "Scope to user ID (defaults to DEFAULT_USER_ID env var)" },
          agent_id: { type: "string", description: "Scope to agent ID" },
          run_id: { type: "string", description: "Scope to run/session ID" },
          filters: { type: "object", description: "Additional metadata filters" },
          limit: { type: "number", description: "Max results (default: 10)" },
        },
        required: ["query"],
      },
    },
    {
      name: "update_memory",
      description: "Update the text content of an existing memory",
      inputSchema: {
        type: "object",
        properties: {
          memory_id: { type: "string", description: "ID of the memory to update" },
          data: { type: "string", description: "New text content for the memory" },
        },
        required: ["memory_id", "data"],
      },
    },
    {
      name: "get_memory_history",
      description: "Get the change history of a memory",
      inputSchema: {
        type: "object",
        properties: {
          memory_id: { type: "string", description: "Memory ID" },
        },
        required: ["memory_id"],
      },
    },
    {
      name: "delete_memory",
      description: "Delete a specific memory by ID",
      inputSchema: {
        type: "object",
        properties: {
          memory_id: { type: "string", description: "Memory ID to delete" },
        },
        required: ["memory_id"],
      },
    },
    {
      name: "delete_all_memories",
      description: "Delete all memories for a given user / agent / run",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Delete memories for this user ID" },
          agent_id: { type: "string", description: "Delete memories for this agent ID" },
          run_id: { type: "string", description: "Delete memories for this run/session ID" },
        },
      },
    },
    {
      name: "reset_memories",
      description: "Reset (wipe) all memories in the store",
      inputSchema: { type: "object", properties: {} },
    },
    // ── Config / health ──────────────────────────────────────────────────────
    {
      name: "get_health",
      description: "Check the health and current LLM configuration of the Mem0 service",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_config",
      description: "Get the current Mem0 service configuration (LLM provider, embedder, stores)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "switch_provider",
      description: "Switch the LLM provider used by the Mem0 service on the fly",
      inputSchema: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            enum: ["gemini", "openrouter", "nvidia", "qwen"],
            description: "LLM provider to switch to",
          },
          model: {
            type: "string",
            description: "Optional model override (e.g. gemini/gemini-3.1-flash-lite-preview)",
          },
        },
        required: ["provider"],
      },
    },
    {
      name: "configure",
      description: "Replace the full mem0 Memory configuration (advanced)",
      inputSchema: {
        type: "object",
        properties: {
          config: { type: "object", description: "Full mem0 configuration object" },
        },
        required: ["config"],
      },
    },
  ],
}));

// ── Tool dispatch ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── add_memory ─────────────────────────────────────────────────────────
      case "add_memory": {
        const { content, user_id, agent_id, run_id, metadata } =
          AddMemorySchema.parse(args);

        const body: Record<string, unknown> = {
          messages: [{ role: "user", content }],
        };
        // At least one identifier is required by the API; default to user_id
        if (agent_id) body.agent_id = agent_id;
        else if (run_id) body.run_id = run_id;
        else body.user_id = user_id ?? DEFAULT_USER_ID;

        if (metadata) body.metadata = metadata;

        const result = await callMem0API("/v1/memories", "POST", body);
        return {
          content: [{ type: "text", text: `Memory added:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── get_memories ───────────────────────────────────────────────────────
      case "get_memories": {
        const { user_id, agent_id, run_id } = GetMemoriesSchema.parse(args);
        const params: Record<string, string> = {};
        if (agent_id) params.agent_id = agent_id;
        else if (run_id) params.run_id = run_id;
        else params.user_id = user_id ?? DEFAULT_USER_ID;

        const result = await callMem0API("/v1/memories", "GET", undefined, params);
        return {
          content: [
            {
              type: "text",
              text: `Memories:\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      // ── get_memory ─────────────────────────────────────────────────────────
      case "get_memory": {
        const { memory_id } = GetMemorySchema.parse(args);
        const result = await callMem0API(`/v1/memories/${memory_id}`);
        return {
          content: [{ type: "text", text: `Memory:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── search_memories ────────────────────────────────────────────────────
      case "search_memories": {
        const { query, user_id, agent_id, run_id, filters, limit } =
          SearchMemoriesSchema.parse(args);

        const body: Record<string, unknown> = { query };
        if (agent_id) body.agent_id = agent_id;
        else if (run_id) body.run_id = run_id;
        else body.user_id = user_id ?? DEFAULT_USER_ID;

        if (filters) body.filters = filters;
        if (limit) body.limit = limit;

        const result = await callMem0API("/v1/search", "POST", body);
        return {
          content: [{ type: "text", text: `Search results:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── update_memory ──────────────────────────────────────────────────────
      case "update_memory": {
        const { memory_id, data } = UpdateMemorySchema.parse(args);
        const result = await callMem0API(`/v1/memories/${memory_id}`, "PUT", { data });
        return {
          content: [{ type: "text", text: `Memory updated:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── get_memory_history ─────────────────────────────────────────────────
      case "get_memory_history": {
        const { memory_id } = GetMemoryHistorySchema.parse(args);
        const result = await callMem0API(`/v1/memories/${memory_id}/history`);
        return {
          content: [{ type: "text", text: `Memory history:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── delete_memory ──────────────────────────────────────────────────────
      case "delete_memory": {
        const { memory_id } = DeleteMemorySchema.parse(args);
        const result = await callMem0API(`/v1/memories/${memory_id}`, "DELETE");
        return {
          content: [{ type: "text", text: `Memory deleted:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── delete_all_memories ────────────────────────────────────────────────
      case "delete_all_memories": {
        const { user_id, agent_id, run_id } = DeleteAllMemoriesSchema.parse(args);
        const params: Record<string, string> = {};
        if (agent_id) params.agent_id = agent_id;
        else if (run_id) params.run_id = run_id;
        else params.user_id = user_id ?? DEFAULT_USER_ID;

        const result = await callMem0API("/v1/memories", "DELETE", undefined, params);
        return {
          content: [{ type: "text", text: `All memories deleted:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── reset_memories ─────────────────────────────────────────────────────
      case "reset_memories": {
        const result = await callMem0API("/v1/reset", "POST");
        return {
          content: [{ type: "text", text: `Memories reset:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── get_health ─────────────────────────────────────────────────────────
      case "get_health": {
        const result = await callMem0API("/v1/health");
        return {
          content: [{ type: "text", text: `Service health:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── get_config ─────────────────────────────────────────────────────────
      case "get_config": {
        const result = await callMem0API("/v1/config");
        return {
          content: [{ type: "text", text: `Current config:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── switch_provider ────────────────────────────────────────────────────
      case "switch_provider": {
        const { provider, model } = SwitchProviderSchema.parse(args);
        const body: Record<string, unknown> = { provider };
        if (model) body.model = model;

        const result = await callMem0API("/v1/config/switch", "POST", body);
        return {
          content: [{ type: "text", text: `Provider switched:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      // ── configure ──────────────────────────────────────────────────────────
      case "configure": {
        const { config } = ConfigureSchema.parse(args);
        const result = await callMem0API("/v1/configure", "POST", config);
        return {
          content: [{ type: "text", text: `Configuration applied:\n${JSON.stringify(result, null, 2)}` }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof McpError) throw error;
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid arguments: ${error.message}`);
    }
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : String(error)
    );
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr only — must not pollute the stdio MCP protocol stream
  console.error("Mem0 Custom MCP Server running");
  console.error(`API URL: ${MEM0_API_URL}`);
  console.error(`Default User ID: ${DEFAULT_USER_ID}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

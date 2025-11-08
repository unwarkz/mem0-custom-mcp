#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Environment configuration
const MEM0_API_URL = process.env.MEM0_API_URL || "http://10.0.0.1:8888";
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "default";

// Zod schemas for input validation
const AddMemorySchema = z.object({
  content: z.string().describe("The content to store as a memory"),
  user_id: z.string().optional().describe("User ID (defaults to env DEFAULT_USER_ID)"),
  metadata: z.record(z.any()).optional().describe("Optional metadata"),
});

const SearchMemoriesSchema = z.object({
  query: z.string().describe("Search query"),
  user_id: z.string().optional().describe("User ID (defaults to env DEFAULT_USER_ID)"),
  limit: z.number().optional().describe("Maximum number of results (default: 10)"),
});

const GetMemoriesSchema = z.object({
  user_id: z.string().optional().describe("User ID (defaults to env DEFAULT_USER_ID)"),
  limit: z.number().optional().describe("Maximum number of results (default: 100)"),
});

const DeleteMemorySchema = z.object({
  memory_id: z.string().describe("ID of the memory to delete"),
});

// Helper function for API calls
async function callMem0API(
  endpoint: string,
  method: string = "GET",
  body?: any
): Promise<any> {
  const url = `${MEM0_API_URL}${endpoint}`;

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Mem0 API error (${response.status}): ${errorText}`
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to call Mem0 API: ${error.message}`);
    }
    throw error;
  }
}

// Create MCP server
const server = new Server(
  {
    name: "mem0-custom-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "add_memory",
        description: "Store a new memory in Mem0",
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The content to store as a memory",
            },
            user_id: {
              type: "string",
              description: "User ID (defaults to env DEFAULT_USER_ID)",
            },
            metadata: {
              type: "object",
              description: "Optional metadata",
            },
          },
          required: ["content"],
        },
      },
      {
        name: "search_memories",
        description: "Search for memories using semantic search",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
            user_id: {
              type: "string",
              description: "User ID (defaults to env DEFAULT_USER_ID)",
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 10)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_memories",
        description: "Retrieve all memories for a user",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "User ID (defaults to env DEFAULT_USER_ID)",
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 100)",
            },
          },
        },
      },
      {
        name: "delete_memory",
        description: "Delete a specific memory by ID",
        inputSchema: {
          type: "object",
          properties: {
            memory_id: {
              type: "string",
              description: "ID of the memory to delete",
            },
          },
          required: ["memory_id"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "add_memory": {
        const { content, user_id, metadata } = AddMemorySchema.parse(args);
        const result = await callMem0API("/v1/memories/", "POST", {
          messages: [{ role: "user", content }],
          user_id: user_id || DEFAULT_USER_ID,
          metadata,
        });
        return {
          content: [
            {
              type: "text",
              text: `Memory added successfully:\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case "search_memories": {
        const { query, user_id, limit } = SearchMemoriesSchema.parse(args);
        const result = await callMem0API("/v1/memories/search/", "POST", {
          query,
          user_id: user_id || DEFAULT_USER_ID,
          limit: limit || 10,
        });
        return {
          content: [
            {
              type: "text",
              text: `Search results:\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case "get_memories": {
        const { user_id, limit } = GetMemoriesSchema.parse(args);
        const userId = user_id || DEFAULT_USER_ID;
        const limitParam = limit || 100;
        // Note: Mem0 API uses user_id as path parameter, limit is handled by API
        const result = await callMem0API(`/v1/memories/${userId}`);
        // Filter by limit on our side since API doesn't support limit parameter
        const memories = Array.isArray(result) ? result.slice(0, limitParam) : result;
        return {
          content: [
            {
              type: "text",
              text: `Retrieved ${Array.isArray(memories) ? memories.length : 0} memories:\n${JSON.stringify(memories, null, 2)}`,
            },
          ],
        };
      }

      case "delete_memory": {
        const { memory_id } = DeleteMemorySchema.parse(args);
        const result = await callMem0API(`/v1/memories/${memory_id}`, "DELETE");
        return {
          content: [
            {
              type: "text",
              text: `Memory deleted successfully:\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid arguments: ${error.message}`);
    }
    throw error;
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with stdio protocol
  console.error("Mem0 Custom MCP Server running");
  console.error(`API URL: ${MEM0_API_URL}`);
  console.error(`Default User ID: ${DEFAULT_USER_ID}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

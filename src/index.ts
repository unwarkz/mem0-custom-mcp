#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";

// ── Environment configuration ─────────────────────────────────────────────────
const MEM0_API_URL = process.env.MEM0_API_URL || "http://localhost:8888";
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "default";

const _rawPort = parseInt(process.env.MCP_PORT ?? "3000", 10);
if (!Number.isInteger(_rawPort) || _rawPort < 1 || _rawPort > 65535) {
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), level: "ERROR", message: `Invalid MCP_PORT value: "${process.env.MCP_PORT}". Must be an integer between 1 and 65535.` }) + "\n");
  process.exit(1);
}
const MCP_PORT = _rawPort;

// Bearer token sent as "Authorization: Bearer <token>" on every mem0 HTTP request.
// Leave unset to disable.
const MEM0_BEARER_TOKEN = process.env.MEM0_BEARER_TOKEN ?? "";

// Token required from MCP clients in the "Authorization: Bearer <token>" HTTP header.
// Leave unset to disable.
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? "";

// ── Logger ────────────────────────────────────────────────────────────────────

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LOG_LEVEL_RANK: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const _rawLogLevel = (process.env.LOG_LEVEL ?? "INFO").toUpperCase() as LogLevel;
const LOG_LEVEL: LogLevel = LOG_LEVEL_RANK[_rawLogLevel] !== undefined ? _rawLogLevel : "INFO";

function log(level: LogLevel, message: string, data?: unknown): void {
  if (LOG_LEVEL_RANK[level] < LOG_LEVEL_RANK[LOG_LEVEL]) return;
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message,
  };
  if (data !== undefined) entry.data = data;
  process.stderr.write(JSON.stringify(entry) + "\n");
}

function logError(message: string, error: unknown, extra?: Record<string, unknown>): void {
  const data: Record<string, unknown> = { ...extra };
  if (error instanceof Error) {
    data.error = error.message;
    if (error.stack) data.stack = error.stack;
  } else {
    data.error = String(error);
  }
  log("ERROR", message, data);
}

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

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (MEM0_BEARER_TOKEN) {
    headers["Authorization"] = `Bearer ${MEM0_BEARER_TOKEN}`;
  }

  const options: RequestInit = { method, headers };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  // 2-minute timeout to accommodate slow LLM-based memory processing
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  const start = Date.now();
  log("INFO", "mem0 request", { method, url: endpoint, body: body ?? null });

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    const elapsed = Date.now() - start;

    if (!response.ok) {
      const errorText = await response.text();
      log("ERROR", "mem0 error response", { method, url: endpoint, status: response.status, elapsed, body: errorText });
      throw new McpError(
        ErrorCode.InternalError,
        `Mem0 API error (${response.status}): ${errorText}`
      );
    }


    // Some endpoints return empty bodies (204 No Content style)
    const text = await response.text();
    const result = text ? JSON.parse(text) : { message: "OK" };
    log("INFO", "mem0 response", { method, url: endpoint, status: response.status, elapsed });
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof McpError) throw error;
    const elapsed = Date.now() - start;
    logError("mem0 call failed", error, { method, url: endpoint, elapsed });
    if (error instanceof Error) {
      throw new McpError(ErrorCode.InternalError, `Failed to call Mem0 API: ${error.message}`);
    }
    throw error;
  }
}

// ── MCP server factory ────────────────────────────────────────────────────────
// Each client session gets its own McpServer instance so that session state
// is fully isolated.  The heavy lifting (tool registration) happens here once
// per session; it is cheap because McpServer just wires up handlers.

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "mem0-custom-mcp", version: "1.2.0" });

  // ── add_memory ──────────────────────────────────────────────────────────────
  server.registerTool(
    "add_memory",
    {
      description: "Store new memories extracted from a message in Mem0",
      inputSchema: AddMemorySchema,
    },
    async ({ content, user_id, agent_id, run_id, metadata }) => {
      const body: Record<string, unknown> = {
        messages: [{ role: "user", content }],
      };
      if (agent_id) body.agent_id = agent_id;
      else if (run_id) body.run_id = run_id;
      else body.user_id = user_id ?? DEFAULT_USER_ID;
      if (metadata) body.metadata = metadata;

      const result = await callMem0API("/v1/memories/", "POST", body);
      return { content: [{ type: "text" as const, text: `Memory added:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── get_memories ────────────────────────────────────────────────────────────
  server.registerTool(
    "get_memories",
    {
      description: "Retrieve all memories for a user / agent / run",
      inputSchema: GetMemoriesSchema,
    },
    async ({ user_id, agent_id, run_id }) => {
      const userId = agent_id ?? run_id ?? user_id ?? DEFAULT_USER_ID;
      const result = await callMem0API(`/v1/memories/${userId}`);
      return { content: [{ type: "text" as const, text: `Memories:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── get_memory ──────────────────────────────────────────────────────────────
  server.registerTool(
    "get_memory",
    {
      description: "Retrieve a single memory by its ID",
      inputSchema: GetMemorySchema,
    },
    async ({ memory_id }) => {
      const result = await callMem0API(`/v1/memories/${memory_id}`);
      return { content: [{ type: "text" as const, text: `Memory:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── search_memories ─────────────────────────────────────────────────────────
  server.registerTool(
    "search_memories",
    {
      description: "Semantic search across memories",
      inputSchema: SearchMemoriesSchema,
    },
    async ({ query, user_id, agent_id, run_id, filters, limit }) => {
      const body: Record<string, unknown> = { query };
      if (agent_id) body.agent_id = agent_id;
      else if (run_id) body.run_id = run_id;
      else body.user_id = user_id ?? DEFAULT_USER_ID;
      if (filters) body.filters = filters;
      if (limit) body.limit = limit;

      const result = await callMem0API("/v1/memories/search/", "POST", body);
      return { content: [{ type: "text" as const, text: `Search results:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── update_memory ───────────────────────────────────────────────────────────
  server.registerTool(
    "update_memory",
    {
      description: "Update the text content of an existing memory",
      inputSchema: UpdateMemorySchema,
    },
    async ({ memory_id, data }) => {
      const result = await callMem0API(`/v1/memories/${memory_id}`, "PUT", { data });
      return { content: [{ type: "text" as const, text: `Memory updated:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── get_memory_history ──────────────────────────────────────────────────────
  server.registerTool(
    "get_memory_history",
    {
      description: "Get the change history of a memory",
      inputSchema: GetMemoryHistorySchema,
    },
    async ({ memory_id }) => {
      const result = await callMem0API(`/v1/memories/${memory_id}/history`);
      return { content: [{ type: "text" as const, text: `Memory history:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── delete_memory ───────────────────────────────────────────────────────────
  server.registerTool(
    "delete_memory",
    {
      description: "Delete a specific memory by ID",
      inputSchema: DeleteMemorySchema,
    },
    async ({ memory_id }) => {
      const result = await callMem0API(`/v1/memories/${memory_id}`, "DELETE");
      return { content: [{ type: "text" as const, text: `Memory deleted:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── delete_all_memories ─────────────────────────────────────────────────────
  server.registerTool(
    "delete_all_memories",
    {
      description: "Delete all memories for a given user / agent / run",
      inputSchema: DeleteAllMemoriesSchema,
    },
    async ({ user_id, agent_id, run_id }) => {
      const params: Record<string, string> = {};
      if (agent_id) params.agent_id = agent_id;
      else if (run_id) params.run_id = run_id;
      else params.user_id = user_id ?? DEFAULT_USER_ID;

      const result = await callMem0API("/v1/memories", "DELETE", undefined, params);
      return { content: [{ type: "text" as const, text: `All memories deleted:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── reset_memories ──────────────────────────────────────────────────────────
  server.registerTool(
    "reset_memories",
    { description: "Reset (wipe) all memories in the store" },
    async () => {
      const result = await callMem0API("/v1/reset", "POST");
      return { content: [{ type: "text" as const, text: `Memories reset:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── get_health ──────────────────────────────────────────────────────────────
  server.registerTool(
    "get_health",
    { description: "Check the health and current LLM configuration of the Mem0 service" },
    async () => {
      const result = await callMem0API("/v1/health");
      return { content: [{ type: "text" as const, text: `Service health:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── get_config ──────────────────────────────────────────────────────────────
  server.registerTool(
    "get_config",
    { description: "Get the current Mem0 service configuration (LLM provider, embedder, stores)" },
    async () => {
      const result = await callMem0API("/v1/config");
      return { content: [{ type: "text" as const, text: `Current config:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── switch_provider ─────────────────────────────────────────────────────────
  server.registerTool(
    "switch_provider",
    {
      description: "Switch the LLM provider used by the Mem0 service on the fly",
      inputSchema: SwitchProviderSchema,
    },
    async ({ provider, model }) => {
      const body: Record<string, unknown> = { provider };
      if (model) body.model = model;
      const result = await callMem0API("/v1/config/switch", "POST", body);
      return { content: [{ type: "text" as const, text: `Provider switched:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  // ── configure ───────────────────────────────────────────────────────────────
  server.registerTool(
    "configure",
    {
      description: "Replace the full mem0 Memory configuration (advanced)",
      inputSchema: ConfigureSchema,
    },
    async ({ config }) => {
      const result = await callMem0API("/v1/configure", "POST", config);
      return { content: [{ type: "text" as const, text: `Configuration applied:\n${JSON.stringify(result, null, 2)}` }] };
    }
  );

  return server;
}

// ── Session management ────────────────────────────────────────────────────────
// Stateful mode: each MCP session gets its own McpServer + transport pair.
// Sessions are keyed by the session ID generated by the transport.

interface Session {
  mcpServer: McpServer;
  transport: StreamableHTTPServerTransport;
}

const sessions = new Map<string, Session>();

// ── Body parser ───────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => { data += chunk; });
    req.on("end", () => {
      if (!data) { resolve(undefined); return; }
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// ── HTTP request handler ──────────────────────────────────────────────────────

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // ── Log incoming request ───────────────────────────────────────────────────
  const remoteIp = req.socket?.remoteAddress ?? "unknown";
  log("INFO", "incoming request", {
    method: req.method,
    url: req.url,
    remoteIp,
    sessionId: req.headers["mcp-session-id"] ?? null,
    contentType: req.headers["content-type"] ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  });

  // ── Auth check ─────────────────────────────────────────────────────────────
  if (MCP_AUTH_TOKEN) {
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== `Bearer ${MCP_AUTH_TOKEN}`) {
      log("WARN", "unauthorized request", { method: req.method, url: req.url });
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized: invalid or missing Bearer token" }));
      return;
    }
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "POST") {
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    if (!sessionId) {
      // New session — must be an initialize request
      if (!isInitializeRequest(body)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Expected initialize request for new session" }));
        return;
      }

      const mcpServer = createMcpServer();

      // onsessioninitialized fires inside handleRequest once the session ID is
      // assigned — this is the right moment to register the session.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { mcpServer, transport });
          log("INFO", "session created", { sessionId: sid });
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
          log("INFO", "session closed", { sessionId: transport.sessionId });
        }
      };

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    // Continuing existing session
    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    await session.transport.handleRequest(req, res, body);
    return;
  }

  if (req.method === "GET") {
    // SSE stream for server-initiated messages
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "mcp-session-id header required" }));
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    await session.transport.handleRequest(req, res);
    return;
  }

  if (req.method === "DELETE") {
    // Explicit session termination
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "mcp-session-id header required" }));
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404);
      res.end();
      return;
    }

    await session.transport.close();
    sessions.delete(sessionId);
    log("INFO", "session terminated by client", { sessionId });
    res.writeHead(200);
    res.end();
    return;
  }

  res.writeHead(405, { "Allow": "GET, POST, DELETE" });
  res.end("Method Not Allowed");
}

// ── HTTP server ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";

    // Health probe for Docker / load-balancers — does not require auth
    if (url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", sessions: sessions.size }));
      return;
    }

    if (url === "/mcp" || url.startsWith("/mcp?")) {
      try {
        await handleMcpRequest(req, res);
      } catch (error) {
        logError("unhandled request error", error);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  httpServer.listen(MCP_PORT, "0.0.0.0", () => {
    log("INFO", "Mem0 Custom MCP Server running (HTTP Streamable)", {
      port: MCP_PORT,
      endpoint: `http://0.0.0.0:${MCP_PORT}/mcp`,
      api_url: MEM0_API_URL,
      default_user_id: DEFAULT_USER_ID,
      mem0_auth: MEM0_BEARER_TOKEN ? "enabled" : "disabled",
      mcp_auth: MCP_AUTH_TOKEN ? "enabled" : "disabled",
    });
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    log("INFO", "SIGTERM received, shutting down");
    for (const [id, session] of sessions) {
      await session.transport.close().catch((err: unknown) => {
        log("WARN", "error closing session during shutdown", {
          sessionId: id,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      });
      sessions.delete(id);
    }
    httpServer.close(() => process.exit(0));
  });
}

main().catch((error) => {
  logError("Fatal error", error);
  process.exit(1);
});

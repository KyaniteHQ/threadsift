import type { OpenAPIHono } from "@hono/zod-openapi";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";

import type { Ports } from "../core/kernel/ports.ts";
import { access, ownCheck } from "./access.ts";
import { MCP_PATH } from "./document-path.ts";
import { registerAddTool } from "./mcp-add-tool.ts";
import { McpExtraSchema, mcpGate } from "./mcp-gate.ts";
import { registerReadTools } from "./mcp-read-tools.ts";

function createMcpServer(ports: Ports, tokenId: number): McpServer {
  const server = new McpServer({ name: "threadsift", version: "1" });

  registerReadTools(server, ports);
  registerAddTool(server, ports, tokenId);

  return server;
}

export function registerMcpRoute(app: OpenAPIHono, ports: Ports): void {
  const handler = createMcpHandler(({ authInfo }) =>
    createMcpServer(ports, McpExtraSchema.parse(authInfo?.extra).tokenId),
  );

  app.all(MCP_PATH, ownCheck(mcpGate(ports)), access("self"), (c) =>
    handler.fetch(c.req.raw, { authInfo: c.get("caller") }),
  );
}

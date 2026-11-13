import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { Hono } from "hono";

import type { Ports } from "../core/ports.ts";
import { MCP_PATH } from "./document-path.ts";
import { bodyCap } from "./guard.ts";
import { registerAddTool } from "./mcp-add-tool.ts";
import { type McpEnv, mcpGate } from "./mcp-gate.ts";
import { registerReadTools } from "./mcp-read-tools.ts";

function createMcpServer(ports: Ports): McpServer {
  const server = new McpServer({ name: "threadsift", version: "1" });

  registerReadTools(server, ports);
  registerAddTool(server, ports);

  return server;
}

export function mcpRoute(ports: Ports): Hono<McpEnv> {
  const handler = createMcpHandler(() => createMcpServer(ports));

  const route = new Hono<McpEnv>();

  route.all(MCP_PATH, mcpGate(ports), bodyCap, (c) =>
    handler.fetch(c.req.raw, { authInfo: c.get("caller") }),
  );

  return route;
}

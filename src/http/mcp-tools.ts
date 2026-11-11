import { McpServer } from "@modelcontextprotocol/server";

import type { Ports } from "../core/ports.ts";
import { registerAddTool } from "./mcp-add-tool.ts";
import { registerReadTools } from "./mcp-read-tools.ts";

export function createMcpServer(ports: Ports): McpServer {
  const server = new McpServer({ name: "threadsift", version: "1" });

  registerReadTools(server, ports);
  registerAddTool(server, ports);

  return server;
}

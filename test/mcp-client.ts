import assert from "node:assert/strict";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { z } from "zod";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import type { Instance, Json } from "./instance.ts";

export const MCP_URL = "http://localhost/mcp";

export interface AgentToken {
  readonly id: number;
  readonly value: string;
}

export interface Agents {
  readonly legacy: Client;
  readonly modern: Client;
}

export async function createAgentToken(instance: Instance, name: string): Promise<AgentToken> {
  const { token, value } = await instance.read("POST", "/api/tokens", CreatedTokenResponseSchema, {
    name,
  });

  return { id: token.id, value };
}

export async function connectAgent(
  instance: Instance,
  token: AgentToken,
  negotiation: "legacy" | "modern" = "legacy",
): Promise<Client> {
  const client = new Client(
    { name: "threadsift-test", version: "1" },
    negotiation === "modern" ? { versionNegotiation: { mode: "auto" } } : {},
  );

  await client.connect(
    new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: { headers: { authorization: `Bearer ${token.value}` } },
      fetch: (url, init) => instance.fetch(String(url), init),
    }),
  );

  return client;
}

export async function connectBoth(instance: Instance, token: AgentToken): Promise<Agents> {
  return {
    legacy: await connectAgent(instance, token, "legacy"),
    modern: await connectAgent(instance, token, "modern"),
  };
}

export function bearer(token: AgentToken) {
  return { authorization: `Bearer ${token.value}` };
}

export const TOOLS_LIST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

export function mcpRequest(
  instance: Instance,
  {
    url = MCP_URL,
    headers = {},
    body = TOOLS_LIST,
  }: Readonly<{ url?: string; headers?: Readonly<Record<string, string>>; body?: BodyInit }>,
): Promise<Response> {
  return instance.fetch(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body,
    }),
  );
}

export async function restJson(instance: Instance, path: string): Promise<Json> {
  return z.json().parse(JSON.parse((await instance.send("GET", path)).body));
}

export function callBoth(agents: Agents, name: string, args: Readonly<Record<string, Json>>) {
  return Promise.all(
    [agents.legacy, agents.modern].map(async (client) => {
      const answer = await client.callTool({ name, arguments: args });

      return {
        isError: answer.isError === true,
        content: answer.content,
        body: answer.structuredContent,
      };
    }),
  );
}

export async function sameAsRest(
  instance: Instance,
  agents: Agents,
  path: string,
  name: string,
  args: Readonly<Record<string, Json>>,
): Promise<Json> {
  const expected = await restJson(instance, path);

  for (const answer of await callBoth(agents, name, args)) {
    assert.equal(answer.isError, false);
    assert.deepEqual(answer.body, expected);
  }

  return expected;
}

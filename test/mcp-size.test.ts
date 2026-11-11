import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ItemReadResponseSchema } from "../src/http/schemas.ts";
import { Instance } from "./instance.ts";
import {
  type AgentToken,
  MCP_URL,
  bearer,
  createAgentToken,
  mcpHeaders,
  mcpRequest,
} from "./mcp-client.ts";

const BODY_LIMIT = 64 * 1024;

function call(name: string, args: Readonly<Record<string, string>>): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

function sizedSearch(bytes: number): string {
  const bare = new TextEncoder().encode(call("search", { padding: "" })).length;

  return call("search", { padding: "a".repeat(bytes - bare) });
}

function chunked(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let at = 0;

  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close();

        return;
      }

      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

describe("/mcp takes at most 64 KiB of request, whether or not the request says its length", () => {
  let instance: Instance;
  let token: AgentToken;

  const itemTotal = async (): Promise<number | undefined> =>
    (await instance.read("GET", "/api/items", ItemReadResponseSchema)).counts?.total;

  const declared = (text: string) =>
    new Request(MCP_URL, {
      method: "POST",
      headers: mcpHeaders({
        ...bearer(token),
        "content-length": String(new TextEncoder().encode(text).length),
      }),
      body: text,
    });

  const streamed = (text: string, chunkBytes: number) => {
    const init = {
      method: "POST",
      headers: mcpHeaders(bearer(token)),
      body: chunked(text, chunkBytes),
      duplex: "half",
    };

    return new Request(MCP_URL, init);
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    token = await createAgentToken(instance, "mcp body");
  });

  after(() => instance.close());

  it("serves a body of exactly 64 KiB and answers 413 to one byte more", async () => {
    assert.equal((await instance.fetch(declared(sizedSearch(BODY_LIMIT)))).status, 200);

    const over = await instance.fetch(declared(sizedSearch(BODY_LIMIT + 1)));

    assert.equal(over.status, 413);
    assert.match(await over.text(), /64 KiB/u);
  });

  it("answers 413 to an oversized body, with a Content-Length or without, and writes nothing", async () => {
    const totalBefore = await itemTotal();

    const text = call("add", {
      url: "https://x.com/someone/status/3000000001",
      padding: "a".repeat(BODY_LIMIT),
    });

    const withLength = declared(text);
    const withoutLength = streamed(text, 4096);

    assert.equal(withLength.headers.get("content-length"), String(text.length));
    assert.equal(withoutLength.headers.has("content-length"), false);
    assert.equal((await instance.fetch(withLength)).status, 413);
    assert.equal((await instance.fetch(withoutLength)).status, 413);
    assert.equal(await itemTotal(), totalBefore);
  });

  it("serves a chunked body inside the limit, and its add writes one Item", async () => {
    const totalBefore = await itemTotal();

    const text = call("add", {
      url: "https://x.com/someone/status/3000000002",
      padding: "a".repeat(1000),
    });

    const request = streamed(text, 100);

    assert.equal(request.headers.has("content-length"), false);
    assert.equal((await instance.fetch(request)).status, 200);
    assert.equal(await itemTotal(), (totalBefore ?? 0) + 1);
  });

  it("answers a body that is not JSON with a JSON-RPC parse error", async () => {
    const answer = await mcpRequest(instance, { headers: bearer(token), body: "{not json" });

    assert.equal(answer.status, 400);
    assert.match(await answer.text(), /-32700/u);
  });
});

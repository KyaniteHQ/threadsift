import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readResponse, requestBytes } from "../src/targets/worker/http1.ts";

const encoder = new TextEncoder();

function* pieces(text: string, size: number): Generator<Uint8Array> {
  const bytes = encoder.encode(text);

  for (let at = 0; at < bytes.length; at += size) yield bytes.subarray(at, at + size);
}

function piecesOf(text: string, size: number): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]: () => {
      const iterator = pieces(text, size);

      return { next: () => Promise.resolve(iterator.next()) };
    },
  };
}

async function bodyOf(text: string, size: number): Promise<string> {
  const response = await readResponse(piecesOf(text, size));
  const parts: Uint8Array[] = [];

  for await (const part of response.body) parts.push(part);

  return new TextDecoder().decode(Buffer.concat(parts));
}

const BODY = '{"kind":"Listing","data":{"children":[]}}';

const HEAD = [
  "HTTP/1.1 200 OK",
  "Content-Type: application/json; charset=UTF-8",
  "X-RateLimit-Remaining: 97.0",
  "X-RateLimit-Reset: 537",
  "Retry-After: 12",
  "Location: https://www.reddit.com/elsewhere",
];

const lengthAnswer = [...HEAD, `Content-Length: ${String(BODY.length)}`, "", BODY].join("\r\n");

const chunkedAnswer = [
  ...HEAD,
  "Transfer-Encoding: chunked",
  "",
  `${BODY.slice(0, 10).length.toString(16)};ext=1`,
  BODY.slice(0, 10),
  BODY.slice(10).length.toString(16),
  BODY.slice(10),
  "0",
  "X-Trailer: yes",
  "",
  "",
].join("\r\n");

const closeAnswer = [...HEAD, "", BODY].join("\r\n");

const SIZES = [1, 3, 7, 4096] as const;

const MALFORMED = { name: "MalformedResponse" } as const;

describe("the Worker's HTTP/1.1 reader", () => {
  for (const size of SIZES) {
    it(`reads a body that ends by Content-Length when the bytes arrive in pieces of ${String(size)}`, async () => {
      assert.equal(await bodyOf(lengthAnswer, size), BODY);
    });

    it(`reads a chunked body, its extension and its trailer, in pieces of ${String(size)}`, async () => {
      assert.equal(await bodyOf(chunkedAnswer, size), BODY);
    });

    it(`reads a body that ends when the connection closes, in pieces of ${String(size)}`, async () => {
      assert.equal(await bodyOf(closeAnswer, size), BODY);
    });
  }

  it("reads the status, the type and the rate-limit headers whatever the case of their names", async () => {
    const response = await readResponse(piecesOf(lengthAnswer, 5));

    assert.equal(response.status, 200);
    assert.equal(response.contentType, "application/json; charset=UTF-8");
    assert.equal(response.location, "https://www.reddit.com/elsewhere");
    assert.deepEqual(response.rateLimit, { retryAfter: "12", remaining: "97.0", reset: "537" });
  });

  it("skips an interim 103 answer and reads the final answer that follows it", async () => {
    const early = "HTTP/1.1 103 Early Hints\r\nLink: </a.css>; rel=preload\r\n\r\n";
    const response = await readResponse(piecesOf(`${early}${lengthAnswer}`, 6));

    assert.equal(response.status, 200);
    assert.equal(response.rateLimit.remaining, "97.0");
  });

  it("reads an answer with no body", async () => {
    assert.equal(await bodyOf("HTTP/1.1 204 No Content\r\n\r\n", 9), "");
  });

  const refused = [
    [
      "a body that is not identity encoded",
      "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: 2\r\n\r\nxx",
    ],
    ["a status line that is not HTTP/1", "SPDY 200 OK\r\n\r\n"],
    ["a head that ends before its blank line", "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n"],
    ["a head longer than 16 KiB", `HTTP/1.1 200 OK\r\nX-Long: ${"a".repeat(17_000)}\r\n\r\n`],
    ["a Content-Length that is not a number", "HTTP/1.1 200 OK\r\nContent-Length: two\r\n\r\nxx"],
  ] as const;

  for (const [name, text] of refused) {
    it(`refuses ${name}`, async () => {
      await assert.rejects(() => bodyOf(text, 64), MALFORMED);
    });
  }

  it("refuses a body that ends before its Content-Length", async () => {
    await assert.rejects(
      () => bodyOf("HTTP/1.1 200 OK\r\nContent-Length: 50\r\n\r\nshort", 64),
      MALFORMED,
    );
  });

  it("refuses a chunk whose size is not hexadecimal and a chunked body cut short", async () => {
    await assert.rejects(
      () =>
        bodyOf("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nzz\r\nab\r\n0\r\n\r\n", 64),
      MALFORMED,
    );
    await assert.rejects(
      () => bodyOf("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhel", 64),
      MALFORMED,
    );
  });

  it("writes a GET request line, the host, the headers and a closing connection", () => {
    const lines = new TextDecoder()
      .decode(requestBytes("www.reddit.com", "/api/me.json", { accept: "application/json" }))
      .split("\r\n");

    assert.equal(lines[0], "GET /api/me.json HTTP/1.1");
    assert.ok(lines.includes("host: www.reddit.com"));
    assert.ok(lines.includes("accept: application/json"));
    assert.ok(lines.includes("connection: close"));
    assert.deepEqual(lines.slice(-2), ["", ""]);
  });
});

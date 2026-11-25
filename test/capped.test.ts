import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readPrefix } from "../src/core/kernel/capped.ts";

const encoder = new TextEncoder();

function chunksOf(...texts: readonly string[]): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]: () => {
      const chunks = texts.map((text) => encoder.encode(text)).values();

      return { next: () => Promise.resolve(chunks.next()) };
    },
  };
}

async function prefixOf(limit: number): Promise<string> {
  return new TextDecoder().decode(await readPrefix(chunksOf("error code:", " 1016"), limit));
}

describe("readPrefix", () => {
  it("joins the chunks of a body and stops at the byte limit, inside a chunk when the limit falls there", async () => {
    assert.deepEqual(await Promise.all([prefixOf(64), prefixOf(14)]), [
      "error code: 1016",
      "error code: 10",
    ]);
  });
});

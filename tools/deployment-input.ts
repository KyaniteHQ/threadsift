import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { z } from "zod";

import { DigestSchema } from "../src/core/ai-contract.ts";
import { catalogKey } from "../src/core/catalog.ts";
import type { ItemDetailResponseSchema } from "../src/http/schemas.ts";

const url = new URL("https://www.sqlite.org/whentouse.html");

url.searchParams.set("threadsift-check", randomUUID());

export const DEPLOYMENT_INPUT = {
  url: url.href,
  digest: DigestSchema.parse({
    title: "Deployment check",
    topic: "Deployment check",
    tags: [],
    summary: "Caller-supplied publication check.",
    keyPoints: ["This Digest proves publication without a Provider call."],
  }),
};

export function suppliedDigestMatches(
  item: Readonly<
    Pick<z.infer<typeof ItemDetailResponseSchema>["item"], "digestTitle" | "digestTopic" | "digest">
  >,
): boolean {
  const expected = DEPLOYMENT_INPUT.digest;

  return (
    item.digestTitle === expected.title &&
    catalogKey(item.digestTopic ?? "") === catalogKey(expected.topic) &&
    isDeepStrictEqual(item.digest, {
      summary: expected.summary,
      keyPoints: expected.keyPoints,
      tags: expected.tags,
    })
  );
}

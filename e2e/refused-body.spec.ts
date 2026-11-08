import { type APIRequestContext, expect, request, test } from "@playwright/test";

import { agentToken, bearer } from "./access.ts";
import { slowLink } from "./slow-link.ts";

const MIB = 1024 * 1024;
const ROUNDS = 3;

let owner: APIRequestContext;
let stopLink: () => Promise<void>;

test.beforeAll(async ({ baseURL }) => {
  const link = await slowLink(baseURL ?? "");
  stopLink = link.stop;
  owner = await request.newContext({ baseURL: link.url, extraHTTPHeaders: bearer(agentToken()) });
});

test.afterAll(async () => {
  await owner.dispose();
  await stopLink();
});

test("a request on the same request context after a refused 9 MiB body sent over a slow link is answered", async () => {
  for (let round = 1; round <= ROUNDS; round += 1) {
    const refused = await owner.post("/api/items", {
      data: { url: "https://example.com/", content: "x".repeat(9 * MIB) },
    });

    expect(refused.status(), `refused body ${round}`).toBe(413);

    const next = await owner.get("/api/items");

    expect(next.status(), `request after refused body ${round}`).toBe(200);
  }
});

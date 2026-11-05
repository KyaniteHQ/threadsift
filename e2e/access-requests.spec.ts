import { expect } from "@playwright/test";

import { expectRefusal } from "./access-helpers.ts";
import { agentToken, bearer, test } from "./access.ts";
import { newRunId } from "./links.ts";

const KIB = 1024;

test("a cross-site form post with the owner's cookie gets 403, and a bearer JSON post with no Origin succeeds", async ({
  request,
}) => {
  const url = `https://example.com/${newRunId()}/csrf`;

  const forged = await request.post("/api/items", {
    form: { url },
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });

  await expectRefusal(forged, 403, "a cross-site form post");

  const text = await request.post("/api/items", {
    data: JSON.stringify({ url }),
    headers: { "content-type": "text/plain", origin: "https://evil.example" },
  });

  await expectRefusal(text, 403, "a cross-site text/plain post");

  const agent = await request.post("/api/items", { data: { url }, headers: bearer(agentToken()) });
  expect(agent.status()).toBe(201);
});

test("a bearer post with no content type reaches its route, and a cross-site bodyless delete with the owner's cookie still gets 403", async ({
  request,
}) => {
  const bare = await request.post("/api/items", { headers: bearer(agentToken()) });
  await expectRefusal(bare, 400, "a bearer post with no body");

  const forged = await request.delete("/api/tokens/1", {
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });

  await expectRefusal(forged, 403, "a cross-site bodyless delete");
});

test("a body over 64 KiB gets 413 with a JSON error and a 1 KiB body gets through", async ({
  request,
  stranger,
}) => {
  const run = newRunId();
  const padded = (size: number) => ({ url: `https://example.com/${run}/${"a".repeat(size)}` });

  await expectRefusal(await request.post("/api/items", { data: padded(65 * KIB) }), 413, "65 KiB");
  expect((await request.post("/api/items", { data: padded(KIB) })).status(), "1 KiB").toBe(201);

  const login = await stranger.post("/api/login", { data: { password: "x".repeat(65 * KIB) } });
  await expectRefusal(login, 413, "65 KiB to the public login route");
});

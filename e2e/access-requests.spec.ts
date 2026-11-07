import { expect } from "@playwright/test";
import { z } from "zod";

import { ListedTokens, createToken, expectRefusal, revokeToken } from "./access-helpers.ts";
import { agentToken, bearer, test } from "./access.ts";
import { newRunId } from "./links.ts";

const KIB = 1024;

const Saved = z.object({ item: z.object({ id: z.number() }) });

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

  const created = await createToken(request, `csrf ${newRunId()}`);

  const forged = await request.delete(`/api/tokens/${created.token.id}`, {
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  });

  await expectRefusal(forged, 403, "a cross-site bodyless delete");
  const listed = ListedTokens.parse(await (await request.get("/api/tokens")).json());
  expect(
    listed.tokens.map((token) => token.id),
    "the token is still there",
  ).toContain(created.token.id);
  expect((await revokeToken(request, created.token.id)).status()).toBe(204);
});

function padded(size: number) {
  return { readState: "read", padding: "a".repeat(size) };
}

test("a body over 64 KiB gets 413 with a JSON error and a 1 KiB body gets through", async ({
  request,
  stranger,
}) => {
  const created = await request.post("/api/items", {
    data: { url: `https://example.com/${newRunId()}/limits` },
  });

  expect(created.status(), "the Item for the read-state route").toBe(201);
  const { item } = Saved.parse(await created.json());
  const readState = `/api/items/${item.id}/read-state`;

  await expectRefusal(await request.put(readState, { data: padded(65 * KIB) }), 413, "65 KiB");
  expect((await request.put(readState, { data: padded(KIB) })).status(), "1 KiB").toBe(200);

  const login = await stranger.post("/api/login", { data: { password: "x".repeat(65 * KIB) } });
  await expectRefusal(login, 413, "65 KiB to the public login route");
});

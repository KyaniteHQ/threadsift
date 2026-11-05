import { expect, test } from "@playwright/test";
import { z } from "zod";

import { ListedTokens, createToken, expectRefusal, sha256Hex } from "./access-helpers.ts";
import { bearer, mainInstance } from "./access.ts";
import { newRunId } from "./links.ts";

const Stored = z.array(z.object({ digest: z.string() }));

test("an agent token is shown once as tsa_ and 32 bytes, stored only as a digest and listed without its value", async ({
  request,
}) => {
  const { token, value } = await createToken(request, `Extension ${newRunId()}`);
  expect(value).toMatch(/^tsa_[\w-]{43}$/u);
  expect(token.lastUsedAt).toBeNull();

  const listing = await request.get("/api/tokens");
  expect(await listing.text(), "the list never shows a value").not.toContain(value);
  expect(ListedTokens.parse(await listing.json()).tokens.map((entry) => entry.id)).toContain(
    token.id,
  );

  const stored = mainInstance().query("SELECT digest FROM agent_tokens", Stored);
  expect(stored.map((row) => row.digest)).toContain(sha256Hex(value));
  expect(
    stored.map((row) => row.digest),
    "no raw token is stored",
  ).not.toContain(value);
  await request.delete(`/api/tokens/${token.id}`, { data: {} });
});

test("a token records its last use and is refused after it is revoked", async ({ request }) => {
  const { token, value } = await createToken(request, `Use ${newRunId()}`);
  expect((await request.get("/api/items", { headers: bearer(value) })).status()).toBe(200);

  const listed = ListedTokens.parse(await (await request.get("/api/tokens")).json());
  expect(listed.tokens.find((entry) => entry.id === token.id)?.lastUsedAt).not.toBeNull();

  expect((await request.delete(`/api/tokens/${token.id}`, { data: {} })).status()).toBe(204);
  const refused = await request.get("/api/items", { headers: bearer(value) });
  await expectRefusal(refused, 401, "the revoked token");
});

test("a token name of 1 to 80 characters is accepted and anything else gets 400", async ({
  request,
}) => {
  for (const name of ["", "   ", "n".repeat(81)]) {
    const response = await request.post("/api/tokens", { data: { name } });
    await expectRefusal(response, 400, `the name "${name.slice(0, 5)}"`);
  }

  const { token } = await createToken(request, "n".repeat(80));
  await request.delete(`/api/tokens/${token.id}`, { data: {} });
});

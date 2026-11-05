import { expect, test } from "@playwright/test";
import { z } from "zod";

import {
  ListedTokens,
  createToken,
  expectRefusal,
  revokeToken,
  sha256Hex,
} from "./access-helpers.ts";
import { bearer, mainInstance } from "./access.ts";
import { newRunId } from "./links.ts";

const HOUR_MS = 3_600_000;
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
  await revokeToken(request, token.id);
});

test("a token's last use updates at most once an hour", async ({ request }) => {
  const { token, value } = await createToken(request, `Use ${newRunId()}`);

  const lastUse = async (): Promise<number | null> => {
    const listed = ListedTokens.parse(await (await request.get("/api/tokens")).json());

    return listed.tokens.find((entry) => entry.id === token.id)?.lastUsedAt ?? null;
  };

  const useAndMoveBack = async (ago: number): Promise<number> => {
    const stored = Date.now() - ago;
    mainInstance().sql(`UPDATE agent_tokens SET last_used_at = ${stored} WHERE id = ${token.id}`);
    expect((await request.get("/api/items", { headers: bearer(value) })).status()).toBe(200);

    return stored;
  };

  expect((await request.get("/api/items", { headers: bearer(value) })).status()).toBe(200);
  expect(await lastUse(), "the first use is recorded").not.toBeNull();

  const twoHoursAgo = await useAndMoveBack(2 * HOUR_MS);
  expect(await lastUse(), "a use after two hours moves the time").toBeGreaterThan(twoHoursAgo);

  const halfHourAgo = await useAndMoveBack(HOUR_MS / 2);
  expect(await lastUse(), "a use within the hour leaves it").toBe(halfHourAgo);
  await revokeToken(request, token.id);
});

test("a token name of 1 to 80 characters is accepted and anything else gets 400", async ({
  request,
}) => {
  for (const name of ["", "   ", "n".repeat(81)]) {
    const response = await request.post("/api/tokens", { data: { name } });
    await expectRefusal(response, 400, `the name "${name.slice(0, 5)}"`);
  }

  const { token } = await createToken(request, "n".repeat(80));
  await revokeToken(request, token.id);
});

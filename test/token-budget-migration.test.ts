import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { TokenListResponseSchema } from "../src/http/schemas.ts";
import { type OlderRelease, startOlderRelease } from "./older-release.ts";
import { rows, xLink } from "./token-budget-fixtures.ts";

const VALUE = "tsa_a-token-saved-by-the-release-before-budgets";

const TRIED = 3;

describe("a token that existed before daily budgets keeps working with no budget", () => {
  let release: OlderRelease;

  before(async () => {
    const digest = createHash("sha256").update(VALUE).digest("hex");

    release = await startOlderRelease(
      "0052_agent-token-budget.sql",
      `insert into agent_tokens (name, digest, created_at) values ('before budgets', '${digest}', 1)`,
    );
  });

  after(() => release.close());

  it("lists the token with no budget, stores it as NULL, and adds without a limit", async () => {
    const { instance } = release;
    const { tokens } = await instance.read("GET", "/api/tokens", TokenListResponseSchema);

    assert.deepEqual(
      tokens.map(({ name, budget }) => [name, budget]),
      [["before budgets", { kind: "unlimited", added: 0 }]],
    );

    assert.deepEqual(
      rows(instance, "select daily_budget is null as unlimited from agent_tokens").map((row) =>
        z.object({ unlimited: z.number() }).parse(row),
      ),
      [{ unlimited: 1 }],
    );

    const adds = await Promise.all(
      Array.from({ length: TRIED }, (_, number) =>
        instance.sendWithToken(VALUE, "POST", "/api/items", { url: xLink(number) }),
      ),
    );

    assert.deepEqual(
      adds.map(({ status }) => status),
      [201, 201, 201],
    );

    const listed = await instance.read("GET", "/api/tokens", TokenListResponseSchema);

    assert.deepEqual(listed.tokens[0]?.budget, { kind: "unlimited", added: TRIED });
  });
});

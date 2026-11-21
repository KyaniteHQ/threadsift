import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  PROPOSAL_KINDS,
  ProposalPageSchema,
  type ProposalKind,
} from "../src/core/contract/proposal-contract.ts";
import { Instance } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";

const StateSchema = z.object({ id: z.number(), state: z.string() });

describe("a Proposal head with no subject row", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();

    PROPOSAL_KINDS.forEach((kind) => {
      exec(
        instance,
        "insert into proposals (kind, reason, state, created_at) values (?, 'A reason.', 'open', 1)",
        kind,
      );
    });
  });

  after(() => instance.close());

  it("is left out of the list, which answers 200", async () => {
    const page = await instance.read("GET", "/api/proposals", ProposalPageSchema);

    assert.deepEqual(page.proposals, []);
  });

  const unknownAnswer = async (path: string): Promise<readonly [number, string]> => {
    const answer = await instance.send("GET", path);

    return [answer.status, answer.body];
  };

  const answersAsUnknown = async (kind: ProposalKind): Promise<void> => {
    const [found] = rows(
      instance,
      z.object({ id: z.number() }),
      "select id from proposals where kind = ?",
      kind,
    );

    assert.ok(found !== undefined);

    const path = `/api/proposals/${String(found.id)}`;
    const unknown = await unknownAnswer("/api/proposals/999999");

    assert.deepEqual(await unknownAnswer(path), unknown);
    assert.deepEqual(
      [
        (await instance.send("POST", `${path}/accept`)).status,
        (await instance.send("POST", `${path}/reject`)).status,
      ],
      [404, 404],
    );
    assert.deepEqual(
      rows(instance, StateSchema, "select id, state from proposals where id = ?", found.id),
      [{ id: found.id, state: "open" }],
    );
  };

  for (const kind of PROPOSAL_KINDS) {
    it(`answers a ${kind} head as an unknown id on the state read, Accept and Reject and leaves it open`, async () => {
      await answersAsUnknown(kind);
    });
  }
});

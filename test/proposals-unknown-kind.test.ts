import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ITEMS_PAGE_SIZE } from "../src/core/item-page.ts";
import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import { propose } from "./accept-fixtures.ts";
import { Instance } from "./instance.ts";
import { dump, script } from "./pin-fixtures.ts";
import { paste, rows } from "./related-fixtures.ts";
import { proposeTopics } from "./topic-accept-fixtures.ts";

const IdSchema = z.object({ id: z.number() });

const UNKNOWN_ROWS = ITEMS_PAGE_SIZE + 10;

describe("a Proposal of a kind a later release stores is neither listed nor acted on", () => {
  let instance: Instance;
  let unknown = 0;
  let unknownRows = "";

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "one", { title: "One", topic: "ML", tags: ["ml", "llm"] });
    await paste(instance, "two", { title: "Two", topic: "Machine learning", tags: ["llms"] });
    propose(instance, ["ml", "llm"]);
    proposeTopics(instance, ["ML", "Machine learning"]);
    script(
      instance,
      `drop trigger proposals_values_insert;
       drop trigger proposals_values_update;
       drop trigger proposals_subject_insert;
       drop trigger proposals_subject_update;
       with recursive n(i) as (select 1 union all select i + 1 from n where i < ${String(UNKNOWN_ROWS)})
       insert into proposals (kind, reason, state, created_at) select 'dedupe-topic', 'Same.', 'open', 1 from n;`,
    );

    const [first] = rows(
      instance,
      IdSchema,
      "select min(id) as id from proposals where kind = 'dedupe-topic'",
    );

    assert.ok(first !== undefined && first.id > 0);
    unknown = first.id;
    unknownRows = dump(instance, "select * from proposals where kind = 'dedupe-topic' order by id");
  });

  after(() => instance.close());

  it("lists only the two known rows on one page with no next cursor, though the unknown rows fill the page", async () => {
    const page = await instance.read("GET", "/api/proposals", ProposalPageSchema);

    assert.deepEqual(page.proposals.map(({ kind }) => kind).toSorted(), [
      "tag-merge",
      "topic-merge",
    ]);
    assert.equal(page.next, null);
  });

  it("answers 404 to Accept and Reject of an unknown row and leaves it as it was", async () => {
    const accepted = await instance.send("POST", `/api/proposals/${String(unknown)}/accept`);
    const rejected = await instance.send("POST", `/api/proposals/${String(unknown)}/reject`);

    assert.deepEqual([accepted.status, rejected.status], [404, 404]);
    assert.equal(
      dump(instance, "select * from proposals where kind = 'dedupe-topic' order by id"),
      unknownRows,
    );
  });

  it("lets the sweep run with unknown rows, including an accepting one, and changes none of them", async () => {
    script(instance, `update proposals set state = 'accepting' where id = ${String(unknown)}`);
    unknownRows = dump(instance, "select * from proposals where kind = 'dedupe-topic' order by id");
    script(instance, "delete from scheduled_runs where task = 'sweep'");
    await instance.tick();

    assert.equal(
      dump(instance, "select * from proposals where kind = 'dedupe-topic' order by id"),
      unknownRows,
    );
  });
});

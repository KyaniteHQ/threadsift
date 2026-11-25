import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Instance, SECRET_KEY } from "./instance.ts";
import { paste } from "./library-fixtures.ts";
import {
  keepLostHighlight,
  proposeLost,
  readPage,
  repaste,
  textHolding,
} from "./lost-highlight-fixtures.ts";

describe("the Proposals page lists a row only while its subject still holds", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("omits a row whose Highlight is found again without a half-filled row", async () => {
    const again = await keepLostHighlight(instance, "again", "gone", "the passage that returns");

    const id = await proposeLost(instance, again.highlightId);

    assert.equal(
      (await readPage(instance)).proposals.some((row) => row.id === id),
      true,
    );
    await repaste(instance, "again", textHolding("the passage that returns"));
    assert.equal(
      (await readPage(instance)).proposals.some((row) => row.id === id),
      false,
    );
  });
});

describe("the Proposals list filters before the page limit", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "many", { title: "Many" });
    instance.database
      .exec(`with recursive n(i) as (select 1 union all select i + 1 from n where i < 62)
       insert into highlights (item_id, exact, prefix, suffix, hint, created_at, status, start)
       select (select max(id) from items), 'quote ' || i, '', '', 0, i, case when i > 51 then 'attached' else 'gone' end, case when i > 51 then 1 else null end from n`);
    instance.database.exec(
      "insert into proposals (id, kind, reason, state, created_at) select id, 'highlight-lost', 'plain-check', 'open', 1 from highlights order by id",
    );
    instance.database.exec(
      "insert into highlight_lost_proposals (proposal_id, kind, highlight_id) select id, 'highlight-lost', id from highlights",
    );
  });

  after(() => instance.close());

  it("fills the page with 50 eligible rows and pages on by the last id", async () => {
    const first = await readPage(instance);

    assert.equal(first.proposals.length, 50);
    assert.equal(first.proposals[0]?.id, 51);
    const cursor = String(first.proposals.at(-1)?.id);

    assert.equal(first.next, cursor);

    const second = await readPage(instance, `?cursor=${cursor}`);

    assert.deepEqual(
      second.proposals.map(({ id }) => id),
      [1],
    );
    assert.equal(second.next, null);
  });
});

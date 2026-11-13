import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ProposalPageSchema } from "../src/core/proposal-contract.ts";
import { Instance } from "./instance.ts";
import { writingAfterTheFirstRead } from "./interrupted-database.ts";
import {
  keepLostHighlight,
  proposeLost,
  readPage,
  repaste,
  textHolding,
} from "./lost-highlight-fixtures.ts";
import { SECRET_KEY, exec, paste } from "./related-fixtures.ts";

const READ_BY_THE_PAGE = ['"proposals"', '"highlights"', '"items"', '"digests"'];

const readsThePage = (sql: string) => READ_BY_THE_PAGE.some((table) => sql.includes(table));

describe("the Proposals page reads each row and its subject in one snapshot", () => {
  let instance: Instance;
  let lost: { itemId: number; highlightId: number };

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    lost = await keepLostHighlight(instance, "snapshot", "gone", "the snapshot passage");
    await proposeLost(instance, lost.highlightId);
  });

  after(() => instance.close());

  it("shows the row as it was when the read began when a Digest is replaced right after", async () => {
    const listed = await readPage(instance);

    const replacing = writingAfterTheFirstRead(instance.databaseFile, readsThePage, async () => {
      await paste(instance, "snapshot", {
        title: "A new title",
        postText: textHolding("a passage that is not the quote"),
      });
    });

    const during = await instance.readThrough(replacing, "/api/proposals", ProposalPageSchema);
    const later = await readPage(instance);

    assert.deepEqual(during, listed);
    assert.notDeepEqual(later, listed);
  });

  it("lists the row when its Highlight is removed right after the read began", async () => {
    const listed = await readPage(instance);

    const removing = writingAfterTheFirstRead(instance.databaseFile, readsThePage, () => {
      exec(instance, "delete from search_parts where highlight_id = ?", lost.highlightId);
      exec(instance, "delete from highlights where id = ?", lost.highlightId);

      return Promise.resolve();
    });

    const during = await instance.readThrough(removing, "/api/proposals", ProposalPageSchema);

    assert.equal(listed.proposals.length, 1);
    assert.deepEqual(during, listed);
    assert.deepEqual((await readPage(instance)).proposals, []);
  });

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
    exec(
      instance,
      `with recursive n(i) as (select 1 union all select i + 1 from n where i < 62)
       insert into highlights (item_id, exact, prefix, suffix, hint, projection, created_at, status, start)
       select (select max(id) from items), 'quote ' || i, '', '', 0, 1, i, case when i > 51 then 'attached' else 'gone' end, case when i > 51 then 1 else null end from n`,
    );
    exec(
      instance,
      "insert into proposals (kind, highlight_id, reason, state, created_at) select 'highlight-lost', id, 'plain-check', 'open', 1 from highlights order by id",
    );
  });

  after(() => instance.close());

  it("fills the page with 50 eligible rows and pages on by the last id", async () => {
    const first = await readPage(instance);

    assert.equal(first.proposals.length, 50);
    assert.equal(first.proposals[0]?.id, 51);
    assert.equal(first.next, String(first.proposals.at(-1)?.id));

    const second = await readPage(instance, `?cursor=${first.next ?? ""}`);

    assert.deepEqual(
      second.proposals.map(({ id }) => id),
      [1],
    );
    assert.equal(second.next, null);
  });
});

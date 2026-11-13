import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { Instance } from "./instance.ts";
import {
  claims,
  highlightStatus,
  keepLostHighlight,
  moveClaimBack,
  nextTick,
  readPage,
  repaste,
  textHolding,
} from "./lost-highlight-fixtures.ts";
import { SECRET_KEY, exec, paste, rows, saveProvider } from "./related-fixtures.ts";

const LostSchema = z.object({
  id: z.number(),
  highlight_id: z.number(),
  state: z.string(),
  reason: z.string().nullable(),
});

const TASK = "highlight_proposals";

const CountSchema = z.object({ n: z.number() });

const lostRows = (instance: Instance) =>
  rows(
    instance,
    LostSchema,
    "select id, highlight_id, state, reason from proposals where kind = 'highlight-lost' order by id",
  );

const highlightIds = (instance: Instance) =>
  lostRows(instance).map(({ highlight_id }) => highlight_id);

const count = (instance: Instance, query: string) => rows(instance, CountSchema, query)[0]?.n ?? 0;

describe("the weekly lost-Highlight check with no Provider saved", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await keepLostHighlight(instance, "unclaimed");
  });

  after(() => instance.close());

  it("claims nothing and stores no row, then claims on the first tick after a Provider is saved", async () => {
    await instance.tick();
    assert.deepEqual([claims(instance, TASK), lostRows(instance)], [[], []]);

    await saveProvider(instance);
    await nextTick(instance);
    assert.equal(claims(instance, TASK).length, 1);
    assert.equal(lostRows(instance).length, 1);
  });
});

describe("the weekly lost-Highlight check with a Provider saved", () => {
  let instance: Instance;
  let gone: number;
  let ambiguous: number;
  let attached: number;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    ({ highlightId: gone } = await keepLostHighlight(instance, "gone", "gone"));
    ({ highlightId: ambiguous } = await keepLostHighlight(instance, "ambiguous", "ambiguous"));
    ({ highlightId: attached } = await keepLostHighlight(instance, "found", "gone"));
    await repaste(instance, "found", textHolding("the passage of found"));
    assert.equal(highlightStatus(instance, attached), "attached");
    await saveProvider(instance);
    exec(
      instance,
      "insert or replace into scheduled_runs (task, last_run_at) values ('disagreement_proposals', ?)",
      Date.now(),
    );
  });

  after(() => instance.close());

  it("stores one open row for each Highlight that is gone or ambiguous and none for an attached one, with no model call", async () => {
    const highlightsBefore = rows(instance, z.unknown(), "select * from highlights order by id");

    const tasks = rows(instance, z.unknown(), "select * from ai_tasks order by id");

    await nextTick(instance);

    assert.deepEqual(highlightIds(instance), [gone, ambiguous]);
    assert.deepEqual(
      lostRows(instance).map(({ state, reason }) => [state, reason]),
      [
        ["open", "plain-check"],
        ["open", "plain-check"],
      ],
    );
    assert.equal(claims(instance, TASK).length, 1);
    assert.deepEqual(
      rows(instance, z.unknown(), "select * from highlights order by id"),
      highlightsBefore,
    );
    assert.deepEqual(rows(instance, z.unknown(), "select * from ai_tasks order by id"), tasks);
    assert.equal(
      count(instance, "select count(*) as n from ai_tasks where inputs like '%passage%'"),
      0,
    );
  });

  it("stores nothing on a second tick in the week", async () => {
    const stored = lostRows(instance);
    const [claimed] = claims(instance, TASK);

    await keepLostHighlight(instance, "second");
    await nextTick(instance);
    assert.deepEqual(lostRows(instance), stored);
    assert.deepEqual(claims(instance, TASK), [claimed]);
  });

  it("stores a row for a Highlight that has none once the claim is 7 days old", async () => {
    moveClaimBack(instance, TASK);
    await nextTick(instance);

    assert.equal(lostRows(instance).length, 3);
  });

  it("deletes an open row whose Highlight is found again only when the week is claimed, and no read lists it before", async () => {
    const [first] = lostRows(instance);

    assert.ok(first !== undefined);

    await repaste(instance, "gone", textHolding("the passage of gone"));
    assert.equal(highlightStatus(instance, first.highlight_id), "attached");
    assert.equal(
      (await readPage(instance)).proposals.some(
        (row) => row.kind === "highlight-lost" && row.highlight.id === first.highlight_id,
      ),
      false,
    );
    assert.equal(lostRows(instance).length, 3);

    await nextTick(instance);
    assert.equal(highlightIds(instance).includes(first.highlight_id), true);
    assert.equal(lostRows(instance).length, 3);

    moveClaimBack(instance, TASK);
    await nextTick(instance);
    assert.deepEqual(highlightIds(instance).includes(first.highlight_id), false);
    assert.equal(lostRows(instance).length, 2);
  });

  it("never stores a row again for a Highlight with a rejected row, even when it is lost a second time", async () => {
    const [first] = lostRows(instance);

    assert.ok(first !== undefined);
    assert.equal(
      (await instance.send("POST", `/api/proposals/${String(first.id)}/reject`)).status,
      200,
    );

    await repaste(instance, "ambiguous", textHolding("the passage of ambiguous"));
    await repaste(instance, "ambiguous", textHolding("something else"));
    assert.equal(highlightStatus(instance, first.highlight_id), "gone");

    moveClaimBack(instance, TASK);
    await nextTick(instance);

    assert.deepEqual(
      lostRows(instance).filter(({ highlight_id }) => highlight_id === first.highlight_id),
      [{ ...first, state: "rejected" }],
    );
  });
});

describe("the weekly lost-Highlight check with more than 20 lost Highlights", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await paste(instance, "many", { title: "Many" });
    exec(
      instance,
      `with recursive n(i) as (select 1 union all select i + 1 from n where i < 25)
       insert into highlights (item_id, exact, prefix, suffix, hint, projection, created_at, status, start)
       select (select max(id) from items), 'quote ' || i, '', '', 0, 1, i, case when i % 2 = 0 then 'gone' else 'ambiguous' end, null from n`,
    );
    await saveProvider(instance);
  });

  after(() => instance.close());

  it("stores 20 rows for the newest Highlights, lists the newest first, and stores the other 5 the next week", async () => {
    await nextTick(instance);

    const first = highlightIds(instance);

    assert.deepEqual(
      first,
      Array.from({ length: 20 }, (_, at) => at + 6),
    );

    const page = await readPage(instance);

    assert.deepEqual(
      page.proposals.flatMap((row) => (row.kind === "highlight-lost" ? [row.highlight.id] : [])),
      first.toReversed(),
    );

    moveClaimBack(instance, TASK);
    await nextTick(instance);
    assert.deepEqual(
      highlightIds(instance).toSorted((a, b) => a - b),
      Array.from({ length: 25 }, (_, at) => at + 1),
    );
    assert.deepEqual(highlightIds(instance).slice(20), [1, 2, 3, 4, 5]);
  });
});

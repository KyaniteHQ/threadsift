import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { drizzle } from "drizzle-orm/sqlite-proxy";
import { z } from "zod";

import type { Database } from "../src/core/ports.ts";
import { readProposalPage } from "../src/core/proposal-page.ts";
import { Instance } from "./instance.ts";
import {
  keepLostHighlight,
  proposeLost,
  readPage,
  repaste,
  textHolding,
} from "./lost-highlight-fixtures.ts";
import { exec, paste } from "./related-fixtures.ts";

interface Counted {
  readonly db: Database;
  readonly calls: () => number;
}

const BindingsSchema = z.array(
  z.union([z.null(), z.number(), z.bigint(), z.string(), z.instanceof(Uint8Array)]),
);

function interrupted(file: string, between: () => Promise<void>): Counted {
  const sqlite = new DatabaseSync(file);
  let calls = 0;

  const execute = ({
    sql,
    params,
    method,
  }: Readonly<{ sql: string; params: unknown[]; method: string }>) => {
    const statement = sqlite.prepare(sql);

    statement.setReturnArrays(true);

    const bindings = BindingsSchema.parse(params);

    if (method === "run") {
      statement.run(...bindings);

      return { rows: [] };
    }

    return { rows: statement.all(...bindings) };
  };

  const db = drizzle(
    async (sql, params, method) => {
      calls += 1;
      await between();

      return execute({ sql, params, method });
    },
    async (queries) => {
      calls += 1;
      await between();
      sqlite.exec("BEGIN");

      try {
        return queries.map((query) => execute(query));
      } finally {
        sqlite.exec("COMMIT");
      }
    },
  );

  return { db, calls: () => calls };
}

describe("the Proposals page reads each row and its subject in one snapshot", () => {
  let instance: Instance;
  let lost: { itemId: number; highlightId: number };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    lost = await keepLostHighlight(instance, "snapshot", "gone", "the snapshot passage");
    proposeLost(instance, lost.highlightId);
  });

  after(() => instance.close());

  it("makes one call, so a Digest replaced before it is read whole and never half-filled", async () => {
    const replacing = interrupted(instance.databaseFile, async () => {
      await paste(instance, "snapshot", {
        title: "A new title",
        postText: textHolding("a passage that is not the quote"),
      });
    });

    const page = await readProposalPage(replacing.db, null);
    const [row] = page.proposals;

    assert.equal(replacing.calls(), 1);
    assert.equal(row?.kind, "highlight-lost");
    assert.deepEqual(
      row?.kind === "highlight-lost" ? [row.highlight.quote, row.highlight.item.title] : [],
      ["the snapshot passage", "A new title"],
    );
  });

  it("makes one call, so a Highlight removed before it is read leaves no row", async () => {
    const removing = interrupted(instance.databaseFile, () => {
      exec(instance, "delete from search_parts where highlight_id = ?", lost.highlightId);
      exec(instance, "delete from highlights where id = ?", lost.highlightId);

      return Promise.resolve();
    });

    const page = await readProposalPage(removing.db, null);

    assert.equal(removing.calls(), 1);
    assert.deepEqual(page.proposals, []);
  });

  it("omits a row whose Highlight is found again without a half-filled row", async () => {
    const again = await keepLostHighlight(instance, "again", "gone", "the passage that returns");

    const id = proposeLost(instance, again.highlightId);

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

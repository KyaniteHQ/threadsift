import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import type { ProposalKind } from "../src/core/kinds.ts";
import { Instance } from "./instance.ts";

const BUSY_TIMEOUT_MS = 5000;

const SEEDED = 400;

const MERGE_COLUMNS = ["cursor", "moved", "unit_revision"] as const;

const SUBJECTS = {
  "tag-merge": (n) => ["from_tag_id, into_tag_id", `${String(n)}, ${String(n + 1)}`],
  "topic-merge": (n) => ["from_topic_id, into_topic_id", `${String(n)}, ${String(n + 1)}`],
  "highlight-lost": (n) => ["highlight_id", String(n)],
  "overview-gap": (n) => ["topic_id", String(n)],
  "items-disagree": (n) => [
    "from_item_id, into_item_id, from_digest, into_digest",
    `${String(n)}, ${String(n + 1)}, 1, 2`,
  ],
} as const satisfies Readonly<
  Record<ProposalKind, (n: number) => readonly [columns: string, values: string]>
>;

const setting = (id: number, assignment: string): string =>
  `update proposals set ${assignment} where id = ${String(id)}`;

describe("the proposal triggers keep a state with the kinds that hold it and the merge columns with accepting", () => {
  let instance: Instance;
  let database: DatabaseSync;
  let used = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });
    database.exec(`
      with recursive n(i) as (select 1 union all select i + 1 from n where i < ${String(SEEDED)})
      insert into tags (id, key, name) select i, 'k' || i, 'k' || i from n;
      with recursive n(i) as (select 1 union all select i + 1 from n where i < ${String(SEEDED)})
      insert into topics (id, key, name) select i, 'k' || i, 'k' || i from n;
      with recursive n(i) as (select 1 union all select i + 1 from n where i < ${String(SEEDED)})
      insert into items (id, source, kind, normalized_url, original_url, saved_at)
        select i, 'article', 'article', 'u' || i, 'u' || i, 0 from n;
      with recursive n(i) as (select 1 union all select i + 1 from n where i < ${String(SEEDED)})
      insert into highlights (id, item_id, exact, prefix, suffix, hint, projection, created_at, status, start)
        select i, 1, 'q' || i, '', '', 0, 1, 0, 'gone', null from n;
    `);
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  const insertion = (kind: ProposalKind, state: string, column = ""): string => {
    used += 2;

    const [columns, values] = SUBJECTS[kind](used);
    const extra = column === "" ? ["", ""] : [`, ${column}`, ", 5"];

    return `insert into proposals (kind, ${columns}, reason, state, created_at${extra[0] ?? ""}) values ('${kind}', ${values}, 'r', '${state}', 0${extra[1] ?? ""})`;
  };

  const stored = (kind: ProposalKind, state: string, column = ""): number => {
    const row = database.prepare(`${insertion(kind, state, column)} returning id`).get();

    return Number(row?.["id"]);
  };

  const refuses = (title: string, statement: () => string, message: RegExp): void => {
    it(title, () => {
      assert.throws(() => {
        database.exec(statement());
      }, message);
    });
  };

  for (const kind of ["highlight-lost", "overview-gap", "items-disagree"] as const) {
    for (const state of ["accepting", "declined"]) {
      refuses(
        `refuses a ${kind} proposal, ${state}, on insert`,
        () => insertion(kind, state),
        /proposals_state/u,
      );
      refuses(
        `refuses to update a ${kind} proposal to ${state}`,
        () => setting(stored(kind, "open"), `state = '${state}'`),
        /proposals_state/u,
      );
    }
  }

  for (const column of MERGE_COLUMNS) {
    for (const [kind, state] of [
      ["tag-merge", "open"],
      ["tag-merge", "rejected"],
      ["tag-merge", "declined"],
      ["topic-merge", "open"],
      ["highlight-lost", "open"],
      ["items-disagree", "rejected"],
    ] as const) {
      refuses(
        `refuses ${column} on a ${kind} proposal that is ${state}, on insert`,
        () => insertion(kind, state, column),
        /proposals_accepting/u,
      );
    }

    refuses(
      `refuses ${column} on an open proposal, on update`,
      () => setting(stored("tag-merge", "open"), `${column} = 5`),
      /proposals_accepting/u,
    );

    for (const state of ["open", "rejected", "declined"]) {
      refuses(
        `refuses a proposal that leaves accepting for ${state} with ${column} still set`,
        () => setting(stored("tag-merge", "accepting", column), `state = '${state}'`),
        /proposals_accepting/u,
      );
    }
  }
});

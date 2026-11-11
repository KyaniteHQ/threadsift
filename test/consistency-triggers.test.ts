import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import type {
  FailureReason,
  ItemStatus,
  JobKind,
  JobState,
  Kind,
  Source,
} from "../src/core/kinds.ts";
import {
  FAILURE_REASONS,
  ITEM_STATUSES,
  JOB_KINDS,
  JOB_STATES,
  KINDS,
  LOG_ACTIONS,
  PIN_KINDS,
  PROPOSAL_KINDS,
  PROPOSAL_STATES,
} from "../src/core/kinds.ts";
import { sourceOf } from "../src/core/links.ts";
import { Instance } from "./instance.ts";

const BUSY_TIMEOUT_MS = 5000;

interface ItemRow {
  readonly source: Source;
  readonly kind: Kind;
  readonly status: ItemStatus;
  readonly reason: FailureReason | null;
}

interface JobRow {
  readonly kind: JobKind;
  readonly state: JobState;
}

const BASELINE_ITEM: ItemRow = {
  source: "other",
  kind: "link",
  status: "processing",
  reason: null,
};

const BASELINE_JOB: JobRow = { kind: "fetch", state: "queued" };

const withStatus = (status: ItemStatus, reason: FailureReason | null): ItemRow => ({
  source: BASELINE_ITEM.source,
  kind: BASELINE_ITEM.kind,
  status,
  reason,
});

const withKind = (kind: Kind): ItemRow => ({
  source: sourceOf(kind),
  kind,
  status: "ready",
  reason: null,
});

const statusRows: readonly ItemRow[] = ITEM_STATUSES.flatMap((status): readonly ItemRow[] =>
  status === "failed"
    ? FAILURE_REASONS.map((reason) => withStatus(status, reason))
    : [withStatus(status, null)],
);

const kindRows: readonly ItemRow[] = KINDS.filter((kind) => kind !== BASELINE_ITEM.kind).map(
  (kind) => withKind(kind),
);

const jobRows: readonly JobRow[] = JOB_KINDS.flatMap((kind) =>
  JOB_STATES.map((state) => ({ kind, state })),
);

describe("every status, reason, Source, kind, job, Log and proposal value in src/core/kinds.ts passes the consistency triggers", () => {
  let instance: Instance;
  let database: DatabaseSync;
  let saved = 0;

  const insertItem = (row: Readonly<ItemRow>): number => {
    saved += 1;
    const url = `https://example.com/consistency/${String(saved)}`;

    const inserted = database
      .prepare(
        `insert into items (source, kind, normalized_url, original_url, saved_at, status, reason)
         values (?, ?, ?, ?, ?, ?, ?) returning id`,
      )
      .get(row.source, row.kind, url, url, saved, row.status, row.reason);

    return z.object({ id: z.number() }).parse(inserted).id;
  };

  const insertJob = (itemId: number, row: Readonly<JobRow>): void => {
    database
      .prepare(
        `insert into jobs (kind, item_id, address, state, next_attempt_at)
         values (?, ?, ?, ?, 0)`,
      )
      .run(row.kind, itemId, "https://example.com/consistency", row.state);
  };

  before(async () => {
    instance = await Instance.start();
    database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  const itemCases = (row: Readonly<ItemRow>): void => {
    const name = `${row.kind} from ${row.source}, ${row.status}, reason ${String(row.reason)}`;

    it(`stores an Item: ${name}`, () => {
      assert.doesNotThrow(() => insertItem(row));
    });

    it(`updates an Item to: ${name}`, () => {
      const id = insertItem(BASELINE_ITEM);

      assert.doesNotThrow(() => {
        database
          .prepare("update items set source = ?, kind = ?, status = ?, reason = ? where id = ?")
          .run(row.source, row.kind, row.status, row.reason, id);
      });
    });
  };

  const jobCases = (row: Readonly<JobRow>): void => {
    const name = `${row.kind} job, ${row.state}`;

    it(`stores a ${name}`, () => {
      const id = insertItem(BASELINE_ITEM);

      assert.doesNotThrow(() => {
        insertJob(id, row);
      });
    });

    it(`updates a job to a ${name}`, () => {
      const id = insertItem(BASELINE_ITEM);
      insertJob(id, BASELINE_JOB);

      assert.doesNotThrow(() => {
        database
          .prepare("update jobs set kind = ?, state = ? where item_id = ?")
          .run(row.kind, row.state, id);
      });
    });
  };

  for (const row of [...statusRows, ...kindRows]) itemCases(row);

  for (const row of jobRows) jobCases(row);

  const logCases = (action: string): void => {
    it(`stores a Log entry: ${action}`, () => {
      assert.doesNotThrow(() => {
        database.prepare("insert into log_entries (at, action) values (0, ?)").run(action);
      });
    });

    it(`updates a Log entry to: ${action}`, () => {
      database.prepare("insert into log_entries (at, action) values (0, 'topic')").run();

      assert.doesNotThrow(() => {
        database
          .prepare("update log_entries set action = ? where id = (select max(id) from log_entries)")
          .run(action);
      });
    });
  };

  for (const action of LOG_ACTIONS) logCases(action);

  const insertTags = (): readonly [number, number] => {
    saved += 1;

    const rows = database
      .prepare("insert into tags (key, name) values (?, ?), (?, ?) returning id")
      .all(`a${String(saved)}`, "A", `b${String(saved)}`, "B");

    const [from, into] = z
      .array(z.object({ id: z.number() }))
      .parse(rows)
      .map(({ id }) => id);

    return [from ?? 0, into ?? 0];
  };

  const proposalCases = (kind: string, state: string): void => {
    it(`stores a ${kind} proposal, ${state}`, () => {
      const [from, into] = insertTags();

      assert.doesNotThrow(() => {
        database
          .prepare(
            "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values (?, ?, ?, 'a reason', ?, 0)",
          )
          .run(kind, from, into, state);
      });
    });

    it(`updates a proposal to a ${kind} proposal, ${state}`, () => {
      const [from, into] = insertTags();
      database
        .prepare(
          "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values ('tag-merge', ?, ?, 'a reason', 'open', 0)",
        )
        .run(from, into);

      assert.doesNotThrow(() => {
        database
          .prepare("update proposals set kind = ?, state = ? where from_tag_id = ?")
          .run(kind, state, from);
      });
    });
  };

  for (const kind of PROPOSAL_KINDS) {
    for (const state of PROPOSAL_STATES) proposalCases(kind, state);
  }

  it("refuses a proposal with a kind or state the code does not list, on insert and on update", () => {
    const [from, into] = insertTags();

    const insert = database.prepare(
      "insert into proposals (kind, from_tag_id, into_tag_id, reason, state, created_at) values (?, ?, ?, 'a reason', ?, 0)",
    );

    assert.throws(() => insert.run("unknown", from, into, "open"), /proposals_values/u);
    assert.throws(() => insert.run("tag-merge", from, into, "unknown"), /proposals_values/u);

    insert.run("tag-merge", from, into, "open");

    const update = database.prepare(
      "update proposals set kind = ?, state = ? where from_tag_id = ?",
    );

    assert.throws(() => update.run("unknown", "open", from), /proposals_values/u);
    assert.throws(() => update.run("tag-merge", "unknown", from), /proposals_values/u);
  });

  const pinCases = (kind: string): void => {
    it(`stores and updates a ${kind} Pin`, () => {
      const [, into] = insertTags();

      assert.doesNotThrow(() => {
        database
          .prepare(
            "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values (?, ?, 'a name', ?, 0)",
          )
          .run(kind, `a key for ${kind}`, into);
        database
          .prepare("update pins set kind = ? where from_key = ?")
          .run(kind, `a key for ${kind}`);
      });
    });
  };

  for (const kind of PIN_KINDS) pinCases(kind);

  it("refuses a Pin with a kind the code does not list, on insert and on update", () => {
    const [, into] = insertTags();

    const insert = database.prepare(
      "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values (?, 'refused key', 'a name', ?, 0)",
    );

    assert.throws(() => insert.run("unknown", into), /pins_values/u);

    insert.run("tag-merge", into);

    assert.throws(() => {
      database.prepare("update pins set kind = 'unknown' where from_key = 'refused key'").run();
    }, /pins_values/u);
  });

  it("refuses a Log entry with an action the code does not list, on insert and on update", () => {
    assert.throws(() => {
      database.prepare("insert into log_entries (at, action) values (0, 'unknown')").run();
    }, /log_entries_action/u);

    database.prepare("insert into log_entries (at, action) values (0, 'topic')").run();
    assert.throws(() => {
      database
        .prepare(
          "update log_entries set action = 'unknown' where id = (select max(id) from log_entries)",
        )
        .run();
    }, /log_entries_action/u);
  });
});

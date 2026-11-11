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

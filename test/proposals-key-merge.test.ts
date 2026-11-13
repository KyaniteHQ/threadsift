import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { migrateData } from "../src/core/data-steps.ts";
import { openDatabase } from "../src/targets/node/database.ts";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const SUBJECTS = [
  { kind: "tag-merge", table: "tags", from: "from_tag_id", into: "into_tag_id", step: "tag-keys" },
  {
    kind: "topic-merge",
    table: "topics",
    from: "from_topic_id",
    into: "into_topic_id",
    step: "topic-keys",
  },
] as const;

type Subject = (typeof SUBJECTS)[number];

const rowOf =
  ({ kind }: Subject) =>
  (from: number, into: number, state: string, reason: string): string =>
    `('${kind}', ${String(from)}, ${String(into)}, '${reason}', '${state}', 1)`;

for (const subject of SUBJECTS) {
  const row = rowOf(subject);

  describe(`the ${subject.step} step keeps the owner's decisions when two spellings become one`, () => {
    let folder = "";
    let database: ReturnType<typeof openDatabase>;
    let sqlite: DatabaseSync;

    const proposals = (): string =>
      JSON.stringify(
        sqlite
          .prepare(
            `select id, ${subject.from} as a, ${subject.into} as b, state, reason from proposals order by id`,
          )
          .all(),
      );

    before(async () => {
      folder = await mkdtemp(join(tmpdir(), "threadsift-proposals-merge-"));
      const file = join(folder, "threadsift.db");
      database = openDatabase(file, MIGRATIONS);
      sqlite = new DatabaseSync(file);
      sqlite.exec("PRAGMA foreign_keys = ON");

      sqlite.exec(`
        insert into ${subject.table} (id, key, name) values
          (1, 'stored-a', 'Machine Learning'), (2, 'stored-b', 'machine learning'),
          (3, 'ml', 'ml'), (4, 'four', 'four'), (5, 'five', 'five'), (6, 'six', 'six'), (7, 'seven', 'seven'), (8, 'eight', 'eight'),
          (9, 'nine', 'nine');
        insert into proposals (kind, ${subject.from}, ${subject.into}, reason, state, created_at) values
          ${[
            row(2, 3, "rejected", "Short form."),
            row(1, 2, "open", "Same name."),
            row(1, 4, "open", "Open on the survivor."),
            row(4, 2, "rejected", "Rejected on the loser."),
            row(1, 5, "rejected", "Rejected on the survivor."),
            row(2, 5, "open", "Open on the loser."),
            row(2, 6, "open", "Open on the loser, the smaller id."),
            row(1, 6, "open", "Open on the survivor."),
            row(1, 7, "accepting", "Accepting on the survivor."),
            row(7, 2, "declined", "Declined on the loser."),
            row(1, 8, "open", "Open on the survivor, the smaller id."),
            row(2, 8, "open", "Open on the loser, the larger id."),
            row(1, 9, "rejected", "Rejected on the survivor, the older row."),
            row(2, 9, "accepting", "Accepting on the loser, the newer row."),
          ].join(",\n")};
      `);

      await migrateData(database.db);
    });

    after(async () => {
      sqlite.close();
      database.close();
      await rm(folder, { recursive: true });
    });

    it("leaves one subject under the recomputed key", () => {
      assert.equal(
        JSON.stringify(
          sqlite.prepare(`select id, name from ${subject.table} where id in (1, 2)`).all(),
        ),
        '[{"id":1,"name":"Machine Learning"}]',
      );
    });

    it("repoints a rejected row, drops the pair of one subject with itself, and keeps the stronger row of two that reach one pair: accepting, then rejected, then open or declined, then the smaller id", () => {
      assert.equal(
        proposals(),
        JSON.stringify([
          { id: 1, a: 1, b: 3, state: "rejected", reason: "Short form." },
          { id: 4, a: 4, b: 1, state: "rejected", reason: "Rejected on the loser." },
          { id: 5, a: 1, b: 5, state: "rejected", reason: "Rejected on the survivor." },
          { id: 7, a: 1, b: 6, state: "open", reason: "Open on the loser, the smaller id." },
          { id: 9, a: 1, b: 7, state: "accepting", reason: "Accepting on the survivor." },
          { id: 11, a: 1, b: 8, state: "open", reason: "Open on the survivor, the smaller id." },
          {
            id: 14,
            a: 1,
            b: 9,
            state: "accepting",
            reason: "Accepting on the loser, the newer row.",
          },
        ]),
      );
    });
  });
}

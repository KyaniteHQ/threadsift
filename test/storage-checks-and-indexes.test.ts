import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import type { ProposalKind } from "../src/core/contract/proposal-contract.ts";
import {
  ITEM_COLUMNS,
  INVALID_PINS,
  type SubjectStorage,
  subjectStorage,
  openStorage,
  type Storage,
} from "./proposal-storage-fixtures.ts";

describe("jobs and the Log accept only known values", () => {
  let storage: Storage;
  let database: DatabaseSync;

  before(async () => {
    storage = await openStorage();
    database = storage.database;
  });

  after(() => storage.close());

  it("refuses a Log entry with an action the code does not list, on insert and on update", () => {
    assert.throws(() => {
      database.prepare("insert into log_entries (at, action) values (0, 'unknown')").run();
    }, /log_entries_action/u);

    database.prepare("insert into log_entries (at, action) values (0, 'topic')").run();
    assert.throws(() => {
      database.exec(
        "update log_entries set action = 'unknown' where id = (select max(id) from log_entries)",
      );
    }, /log_entries_action/u);
  });

  it("refuses an unknown job kind on insert and update", () => {
    database.exec(
      "insert into items (id, source, kind, normalized_url, original_url, saved_at) values (1, 'article', 'article', 'https://example.com/job', 'https://example.com/job', 0)",
    );

    const insert = database.prepare(
      "insert into jobs (kind, item_id, address, state, next_attempt_at) values (?, 1, 'https://example.com/job', 'queued', 0)",
    );

    assert.throws(() => insert.run("unknown"), /jobs_values_check/u);
    insert.run("fetch");
    assert.throws(() => {
      database.exec("update jobs set kind = 'unknown' where item_id = 1");
    }, /jobs_values_check/u);
  });
});

const MERGE_COLUMNS = ["cursor", "moved", "unit_revision", "failed_runs"] as const;

const insertion = (kind: ProposalKind, state: string, column = ""): string => {
  const extra = column === "" ? ["", ""] : [`, ${column}`, ", 5"];

  return `insert into proposals (kind, reason, state, created_at${extra[0] ?? ""}) values ('${kind}', 'r', '${state}', 0${extra[1] ?? ""})`;
};

const setting = (id: number, assignment: string): string =>
  `update proposals set ${assignment} where id = ${String(id)}`;

describe("the proposal constraints keep a state with the kinds that hold it and the merge columns with accepting", () => {
  let storage: SubjectStorage;
  before(async () => {
    storage = await subjectStorage();
  });
  after(() => storage.close());

  const stored = (kind: ProposalKind, state: string, column = ""): number => {
    const id = Number(
      storage.database.prepare(insertion(kind, state, column)).run().lastInsertRowid,
    );
    storage.attach(kind, id, storage.subjectsOf(kind));
    return id;
  };

  const refuses = (title: string, statement: () => string, message: RegExp): void => {
    it(title, () => {
      assert.throws(() => {
        storage.database.exec(statement());
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

describe("the Pin constraints hold which columns each Pin kind uses", () => {
  let storage: Storage;
  let database: DatabaseSync;

  before(async () => {
    storage = await openStorage();
    database = storage.database;
    database.exec(`
      insert into tags (id, key, name) values (1, 'a', 'A');
      insert into topics (id, key, name) values (1, 'x', 'X');
      insert into items (id, source, kind, normalized_url, original_url, saved_at) values
        (1, 'article', 'article', 'u1', 'u1', 1), (2, 'article', 'article', 'u2', 'u2', 2);
    `);
  });

  after(() => storage.close());

  INVALID_PINS.forEach(([name, kind, columns, values]) => {
    it(`refuses ${name} on insert`, () => {
      assert.throws(
        () => storage.insertPin(kind, "refused", columns.split(", "), values),
        /pins_subject/u,
      );
    });
  });

  it("refuses an update that breaks a Pin of each kind", () => {
    storage.insertPin("items-disagree", "refused", ITEM_COLUMNS.split(", "), [1, 2, 1, 2]);
    database.exec(
      "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values ('tag-merge', 'tag', 'a name', 1, 0)",
    );

    const db = database;

    for (const statement of [
      "update pins set into_item_id = from_item_id where kind = 'items-disagree'",
      "update pins set into_tag_id = 1 where kind = 'items-disagree'",
      "update pins set from_digest = 3 where kind = 'tag-merge'",
    ]) {
      assert.throws(() => {
        db.exec(statement);
      }, /pins_subject/u);
    }
  });
});

describe("Proposals and Pins refuse unknown values and mismatched subjects", () => {
  let storage: SubjectStorage;

  before(async () => {
    storage = await subjectStorage();
  });

  after(() => storage.close());

  it("refuses a proposal with a kind or state the code does not list, on insert and on update", () => {
    const insert = storage.database.prepare(
      "insert into proposals (kind, reason, state, created_at) values (?, 'a reason', ?, 0)",
    );

    assert.throws(() => insert.run("unknown", "open"), /proposals_values/u);
    assert.throws(() => insert.run("tag-merge", "unknown"), /proposals_values/u);

    const id = Number(insert.run("tag-merge", "open").lastInsertRowid);
    const update = storage.database.prepare(
      "update proposals set kind = ?, state = ? where id = ?",
    );

    assert.throws(() => update.run("unknown", "open", id), /proposals_values/u);
    assert.throws(() => update.run("tag-merge", "unknown", id), /proposals_values/u);
  });

  it("refuses a Pin with a kind the code does not list, on insert and on update", () => {
    const [, into] = storage.parents("tags");

    const insert = storage.database.prepare(
      "insert into pins (kind, from_key, from_name, into_tag_id, created_at) values (?, 'refused key', 'a name', ?, 0)",
    );

    assert.throws(() => insert.run("unknown", into), /pins_values/u);

    insert.run("tag-merge", into);

    assert.throws(() => {
      storage.database.exec("update pins set kind = 'unknown' where from_key = 'refused key'");
    }, /pins_values/u);
  });

  it("refuses a Pin whose target column does not match its kind, on insert and on update", () => {
    const [, intoTag] = storage.parents("tags");
    const [, intoTopic] = storage.parents("topics");

    const { insertPin } = storage;

    for (const [kind, columns, values] of [
      ["tag-merge", ["into_topic_id"], [intoTopic]],
      ["topic-merge", ["into_tag_id"], [intoTag]],
      ["topic-merge", ["into_tag_id", "into_topic_id"], [intoTag, intoTopic]],
      ["tag-merge", [], []],
    ] as const) {
      assert.throws(() => insertPin(kind, "wrong target", columns, values), /pins_subject/u);
    }

    storage.insertPin("tag-merge", "tag for update", ["into_tag_id"], [intoTag]);
    storage.insertPin("topic-merge", "topic for update", ["into_topic_id"], [intoTopic]);

    assert.throws(
      () =>
        storage.database
          .prepare("update pins set kind = 'topic-merge' where from_key = 'tag for update'")
          .run(),
      /pins_subject/u,
    );
    assert.throws(
      () =>
        storage.database
          .prepare("update pins set into_tag_id = ? where from_key = 'topic for update'")
          .run(intoTag),
      /pins_subject/u,
    );
  });

  it("lets a Tag Pin and a Topic Pin share a key", () => {
    const [, intoTag] = storage.parents("tags");
    const [, intoTopic] = storage.parents("topics");

    storage.insertPin("tag-merge", "shared key", ["into_tag_id"], [intoTag]);

    assert.doesNotThrow(() => {
      storage.insertPin("topic-merge", "shared key", ["into_topic_id"], [intoTopic]);
    });
    assert.throws(() => {
      storage.insertPin("topic-merge", "shared key", ["into_topic_id"], [intoTopic]);
    }, /UNIQUE/u);
  });

  (["tag-merge", "topic-merge", "items-disagree"] as const).forEach((kind) => {
    it(`keeps one ${kind} Proposal for an unordered pair`, () => {
      const [from = 0, into = 0, ...rest] = storage.subjectsOf(kind);

      storage.proposed(kind, [from, into, ...rest]);
      assert.throws(
        () => storage.proposed(kind, [into, from, ...rest]),
        /UNIQUE constraint failed/u,
      );
    });

    it(`refuses a ${kind} Proposal with the same subject twice`, () => {
      const [from = 0, , ...rest] = storage.subjectsOf(kind);

      assert.throws(() => storage.proposed(kind, [from, from, ...rest]), /_proposals_distinct/u);
    });
  });

  (["highlight-lost", "overview-gap"] as const).forEach((kind) => {
    it(`keeps one ${kind} Proposal for its subject`, () => {
      const subjects = storage.subjectsOf(kind);

      storage.proposed(kind, subjects);
      assert.throws(() => storage.proposed(kind, subjects), /UNIQUE constraint failed/u);
    });
  });
});

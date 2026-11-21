import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { PROPOSAL_KINDS, type ProposalKind } from "../src/core/contract/proposal-contract.ts";
import { Instance } from "./instance.ts";
import { subjectTable } from "./proposal-seed.ts";
import { paste } from "./related-fixtures.ts";

const BUSY_TIMEOUT_MS = 5000;

const COLUMNS = {
  "tag-merge": ["from_tag_id", "into_tag_id"],
  "topic-merge": ["from_topic_id", "into_topic_id"],
  "highlight-lost": ["highlight_id"],
  "overview-gap": ["topic_id"],
  "items-disagree": ["from_item_id", "into_item_id", "from_digest", "into_digest"],
} as const satisfies Readonly<Record<ProposalKind, readonly string[]>>;

const PARENT = {
  "tag-merge": "tags",
  "topic-merge": "topics",
  "highlight-lost": "highlights",
  "overview-gap": "topics",
  "items-disagree": "items",
} as const satisfies Readonly<Record<ProposalKind, string>>;

const INSERTS = {
  tags: "insert into tags (key, name) values (?, ?), (?, ?) returning id",
  topics: "insert into topics (key, name) values (?, ?), (?, ?) returning id",
  items:
    "insert into items (source, kind, normalized_url, original_url, saved_at) values ('article', 'article', ?, ?, 0), ('article', 'article', ?, ?, 0) returning id",
} as const;

const otherKind = (kind: ProposalKind): ProposalKind =>
  PROPOSAL_KINDS[(PROPOSAL_KINDS.indexOf(kind) + 1) % PROPOSAL_KINDS.length] ?? kind;

const IdsSchema = z.array(z.object({ id: z.number() }));

describe("a Proposal and the subject row of its kind", () => {
  let instance: Instance;
  let database: DatabaseSync;
  let saved = 0;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    await paste(instance, "subject", { title: "A subject" });
    database = new DatabaseSync(instance.databaseFile, { timeout: BUSY_TIMEOUT_MS });
  });

  after(async () => {
    database.close();
    await instance.close();
  });

  const parents = (table: keyof typeof INSERTS): readonly [number, number] => {
    saved += 1;

    const [from, into] = IdsSchema.parse(
      database.prepare(INSERTS[table]).all(`a${String(saved)}`, "A", `b${String(saved)}`, "B"),
    ).map(({ id }) => id);

    return [from ?? 0, into ?? 0];
  };

  const highlight = (): number => {
    saved += 1;

    const [found] = IdsSchema.parse(
      database
        .prepare(
          `insert into highlights (item_id, exact, prefix, suffix, hint, created_at, status, start)
           select id, ?, '', '', 0, 0, 'gone', null from items limit 1 returning id`,
        )
        .all(`quote ${String(saved)}`),
    );

    return found?.id ?? 0;
  };

  const SUBJECTS = {
    "tag-merge": () => parents("tags"),
    "topic-merge": () => parents("topics"),
    "highlight-lost": () => [highlight()],
    "overview-gap": () => [parents("topics")[0]],
    "items-disagree": () => [...parents("items"), 1, 2],
  } as const satisfies Readonly<Record<ProposalKind, () => readonly number[]>>;

  const subjectsOf = (kind: ProposalKind): readonly number[] => SUBJECTS[kind]();

  const head = (kind: ProposalKind): number =>
    Number(
      database
        .prepare(
          "insert into proposals (kind, reason, state, created_at) values (?, 'r', 'open', 0)",
        )
        .run(kind).lastInsertRowid,
    );

  const attach = (
    kind: ProposalKind,
    id: number,
    subjects: readonly number[],
    rowKind: ProposalKind = kind,
  ): void => {
    database
      .prepare(
        `insert into ${subjectTable(kind)} (proposal_id, kind, ${COLUMNS[kind].join(", ")}) values (?, ?, ${COLUMNS[kind].map(() => "?").join(", ")})`,
      )
      .run(id, rowKind, ...subjects);
  };

  const proposed = (kind: ProposalKind, subjects: readonly number[]): number => {
    const id = head(kind);

    attach(kind, id, subjects);

    return id;
  };

  const subjectIds = (kind: ProposalKind, id: number) =>
    IdsSchema.parse(
      database
        .prepare(`select proposal_id as id from ${subjectTable(kind)} where proposal_id = ?`)
        .all(id),
    );

  const proposalIds = (id: number) =>
    IdsSchema.parse(database.prepare("select id from proposals where id = ?").all(id));

  const refusesNull = (kind: ProposalKind): void => {
    const id = proposed(kind, subjectsOf(kind));

    COLUMNS[kind].forEach((column) => {
      assert.throws(() => {
        database
          .prepare(`update ${subjectTable(kind)} set ${column} = null where proposal_id = ?`)
          .run(id);
      }, /NOT NULL constraint failed/u);
    });
  };

  const refusesOrphan = (kind: ProposalKind): void => {
    assert.throws(() => {
      attach(kind, 0, subjectsOf(kind));
    }, /FOREIGN KEY constraint failed/u);
  };

  const refusesOtherKindHead = (kind: ProposalKind): void => {
    const other = otherKind(kind);
    const id = head(other);

    assert.throws(() => {
      attach(kind, id, subjectsOf(kind));
    }, /FOREIGN KEY constraint failed/u);

    assert.throws(() => {
      attach(kind, id, subjectsOf(kind), other);
    }, /_proposals_kind/u);

    assert.deepEqual(subjectIds(kind, id), []);
  };

  const refusesSecondSubject = (kind: ProposalKind): void => {
    const id = proposed(kind, subjectsOf(kind));

    assert.throws(() => {
      attach(kind, id, subjectsOf(kind));
    }, /UNIQUE constraint failed/u);

    const other = otherKind(kind);

    assert.throws(() => {
      attach(other, id, subjectsOf(other), other);
    }, /FOREIGN KEY constraint failed/u);

    assert.deepEqual(subjectIds(other, id), []);
  };

  const goesWithParent = (kind: ProposalKind, side: number): void => {
    const subjects = subjectsOf(kind);
    const id = proposed(kind, subjects);

    database.prepare(`delete from ${PARENT[kind]} where id = ?`).run(subjects[side] ?? 0);

    assert.deepEqual(proposalIds(id), []);
    assert.deepEqual(subjectIds(kind, id), []);
  };

  const headStaysWithSubject = (kind: ProposalKind): void => {
    const id = proposed(kind, subjectsOf(kind));

    assert.throws(() => {
      database.prepare("delete from proposals where id = ?").run(id);
    }, /FOREIGN KEY constraint failed/u);

    assert.deepEqual([proposalIds(id), subjectIds(kind, id)], [[{ id }], [{ id }]]);
  };

  const headGoesWithSubject = (kind: ProposalKind): void => {
    const id = proposed(kind, subjectsOf(kind));

    database.prepare(`delete from ${subjectTable(kind)} where proposal_id = ?`).run(id);

    assert.deepEqual(proposalIds(id), []);
  };

  for (const kind of PROPOSAL_KINDS) {
    it(`refuses a ${kind} subject row with no value in a column`, () => {
      refusesNull(kind);
    });

    it(`refuses a ${kind} subject row with no Proposal`, () => {
      refusesOrphan(kind);
    });

    it(`refuses a ${kind} subject row for a Proposal of another kind`, () => {
      refusesOtherKindHead(kind);
    });

    it(`refuses a second subject row for one ${kind} Proposal`, () => {
      refusesSecondSubject(kind);
    });

    it(`removes a ${kind} Proposal with the row its first subject column names`, () => {
      goesWithParent(kind, 0);
    });

    it(`refuses to remove a ${kind} Proposal while its subject row exists`, () => {
      headStaysWithSubject(kind);
    });

    it(`removes a ${kind} Proposal with its subject row`, () => {
      headGoesWithSubject(kind);
    });
  }

  for (const kind of ["tag-merge", "topic-merge", "items-disagree"] as const) {
    it(`removes a ${kind} Proposal with the row its second subject column names`, () => {
      goesWithParent(kind, 1);
    });

    it(`keeps one ${kind} Proposal for an unordered pair`, () => {
      const [from = 0, into = 0, ...rest] = subjectsOf(kind);

      proposed(kind, [from, into, ...rest]);
      assert.throws(() => proposed(kind, [into, from, ...rest]), /UNIQUE constraint failed/u);
    });

    it(`refuses a ${kind} Proposal with the same subject twice`, () => {
      const [from = 0, , ...rest] = subjectsOf(kind);

      assert.throws(() => proposed(kind, [from, from, ...rest]), /_proposals_distinct/u);
    });
  }

  for (const kind of ["highlight-lost", "overview-gap"] as const) {
    it(`keeps one ${kind} Proposal for its subject`, () => {
      const subjects = subjectsOf(kind);

      proposed(kind, subjects);
      assert.throws(() => proposed(kind, subjects), /UNIQUE constraint failed/u);
    });
  }
});

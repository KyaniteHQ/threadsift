import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import {
  PROPOSAL_KINDS,
  ProposalPageSchema,
  type ProposalKind,
} from "../src/core/contract/proposal-contract.ts";
import { Instance } from "./instance.ts";
import { subjectTable } from "./proposal-seed.ts";
import { COLUMNS, type SubjectStorage, subjectStorage } from "./proposal-storage-fixtures.ts";
import { exec, rows } from "./sqlite-fixtures.ts";

const PARENT = {
  "tag-merge": "tags",
  "topic-merge": "topics",
  "highlight-lost": "highlights",
  "overview-gap": "topics",
  "items-disagree": "items",
} as const satisfies Readonly<Record<ProposalKind, string>>;

describe("deleting a Proposal or its subject", () => {
  let storage: SubjectStorage;

  before(async () => {
    storage = await subjectStorage();
  });

  after(() => storage?.close());

  const goesWithParent = (kind: ProposalKind, side: number): void => {
    const subjects = storage.subjectsOf(kind);
    const id = storage.proposed(kind, subjects);

    storage.database.prepare(`delete from ${PARENT[kind]} where id = ?`).run(subjects[side] ?? 0);

    assert.deepEqual(storage.proposalIds(id), []);
    assert.deepEqual(storage.subjectIds(kind, id), []);
  };

  const headStaysWithSubject = (kind: ProposalKind): void => {
    const id = storage.proposed(kind, storage.subjectsOf(kind));

    assert.throws(() => {
      storage.database.prepare("delete from proposals where id = ?").run(id);
    }, /FOREIGN KEY constraint failed/u);

    assert.deepEqual([storage.proposalIds(id), storage.subjectIds(kind, id)], [[{ id }], [{ id }]]);
  };

  const headGoesWithSubject = (kind: ProposalKind): void => {
    const id = storage.proposed(kind, storage.subjectsOf(kind));

    storage.database.prepare(`delete from ${subjectTable(kind)} where proposal_id = ?`).run(id);

    assert.deepEqual(storage.proposalIds(id), []);
  };

  for (const kind of PROPOSAL_KINDS) {
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
  }
});

const StateSchema = z.object({ id: z.number(), state: z.string() });

describe("a Proposal head with no subject row", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();

    PROPOSAL_KINDS.forEach((kind) => {
      exec(
        instance,
        "insert into proposals (kind, reason, state, created_at) values (?, 'A reason.', 'open', 1)",
        kind,
      );
    });
  });

  after(() => instance.close());

  it("is left out of the list, which answers 200", async () => {
    const page = await instance.read("GET", "/api/proposals", ProposalPageSchema);

    assert.deepEqual(page.proposals, []);
  });

  const unknownAnswer = async (path: string): Promise<readonly [number, string]> => {
    const answer = await instance.send("GET", path);

    return [answer.status, answer.body];
  };

  const answersAsUnknown = async (kind: ProposalKind): Promise<void> => {
    const [found] = rows(
      instance,
      z.object({ id: z.number() }),
      "select id from proposals where kind = ?",
      kind,
    );

    assert.ok(found !== undefined);

    const path = `/api/proposals/${String(found.id)}`;
    const unknown = await unknownAnswer("/api/proposals/999999");

    assert.deepEqual(await unknownAnswer(path), unknown);
    assert.deepEqual(
      [
        (await instance.send("POST", `${path}/accept`)).status,
        (await instance.send("POST", `${path}/reject`)).status,
      ],
      [404, 404],
    );
    assert.deepEqual(
      rows(instance, StateSchema, "select id, state from proposals where id = ?", found.id),
      [{ id: found.id, state: "open" }],
    );
  };

  for (const kind of PROPOSAL_KINDS) {
    it(`answers a ${kind} head as an unknown id on the state read, Accept and Reject and leaves it open`, async () => {
      await answersAsUnknown(kind);
    });
  }
});

const otherKind = (kind: ProposalKind): ProposalKind =>
  PROPOSAL_KINDS[(PROPOSAL_KINDS.indexOf(kind) + 1) % PROPOSAL_KINDS.length] ?? kind;

describe("the constraints and unique indexes on Proposal subject rows", () => {
  let storage: SubjectStorage;

  before(async () => {
    storage = await subjectStorage();
  });

  after(() => storage?.close());

  const refusesNull = (kind: ProposalKind): void => {
    const id = storage.proposed(kind, storage.subjectsOf(kind));

    COLUMNS[kind].forEach((column) => {
      assert.throws(() => {
        storage.database
          .prepare(`update ${subjectTable(kind)} set ${column} = null where proposal_id = ?`)
          .run(id);
      }, /NOT NULL constraint failed/u);
    });
  };

  const refusesOrphan = (kind: ProposalKind): void => {
    assert.throws(() => {
      storage.attach(kind, 0, storage.subjectsOf(kind));
    }, /FOREIGN KEY constraint failed/u);
  };

  const refusesOtherKindHead = (kind: ProposalKind): void => {
    const other = otherKind(kind);
    const id = storage.head(other);

    assert.throws(() => {
      storage.attach(kind, id, storage.subjectsOf(kind));
    }, /FOREIGN KEY constraint failed/u);

    assert.throws(() => {
      storage.attach(kind, id, storage.subjectsOf(kind), other);
    }, /_proposals_kind/u);

    assert.deepEqual(storage.subjectIds(kind, id), []);
  };

  const refusesSecondSubject = (kind: ProposalKind): void => {
    const id = storage.proposed(kind, storage.subjectsOf(kind));

    assert.throws(() => {
      storage.attach(kind, id, storage.subjectsOf(kind));
    }, /UNIQUE constraint failed/u);

    const other = otherKind(kind);

    assert.throws(() => {
      storage.attach(other, id, storage.subjectsOf(other), other);
    }, /FOREIGN KEY constraint failed/u);

    assert.deepEqual(storage.subjectIds(other, id), []);
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
  }

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

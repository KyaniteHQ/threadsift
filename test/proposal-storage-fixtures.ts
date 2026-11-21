import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import type { PinKind, ProposalKind } from "../src/core/contract/proposal-contract.ts";
import { bestEffort } from "../src/core/kernel/failure-log.ts";
import { Instance } from "./instance.ts";
import { subjectTable } from "./proposal-seed.ts";
import { paste } from "./related-fixtures.ts";

export const COLUMNS = {
  "tag-merge": ["from_tag_id", "into_tag_id"],
  "topic-merge": ["from_topic_id", "into_topic_id"],
  "highlight-lost": ["highlight_id"],
  "overview-gap": ["topic_id"],
  "items-disagree": ["from_item_id", "into_item_id", "from_digest", "into_digest"],
} as const satisfies Readonly<Record<ProposalKind, readonly string[]>>;

const INSERTS = {
  tags: "insert into tags (key, name) values (?, ?), (?, ?) returning id",
  topics: "insert into topics (key, name) values (?, ?), (?, ?) returning id",
  items:
    "insert into items (source, kind, normalized_url, original_url, saved_at) values ('article', 'article', ?, ?, 0), ('article', 'article', ?, ?, 0) returning id",
} as const;

const IdsSchema = z.array(z.object({ id: z.number() }));

export async function openStorage() {
  const instance = await Instance.start();
  let database: DatabaseSync;
  try {
    await instance.setUp();
    database = new DatabaseSync(instance.databaseFile, { timeout: 5000 });
  } catch (error) {
    await bestEffort({ event: "test-setup-cleanup-failed", fields: {} }, () => instance.close());
    throw error;
  }

  const insertPin = (
    kind: PinKind,
    key: string,
    columns: readonly string[],
    values: readonly number[],
  ) => {
    const names = ["kind", "from_key", "from_name", "created_at", ...columns];
    return database
      .prepare(`insert into pins (${names.join(", ")}) values (${names.map(() => "?").join(", ")})`)
      .run(kind, key, "a name", 0, ...values);
  };

  return {
    insertPin,
    instance,
    database,
    close: async () => {
      try {
        database.close();
      } finally {
        await instance.close();
      }
    },
  };
}

export type Storage = Awaited<ReturnType<typeof openStorage>>;

export async function subjectStorage() {
  const storage = await openStorage();
  const { instance, database } = storage;
  try {
    await paste(instance, "subject", { title: "A subject" });
  } catch (error) {
    await bestEffort({ event: "test-setup-cleanup-failed", fields: {} }, () => storage.close());
    throw error;
  }
  let saved = 0;
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

  return { ...storage, parents, subjectsOf, head, attach, proposed, subjectIds, proposalIds };
}

export type SubjectStorage = Awaited<ReturnType<typeof subjectStorage>>;

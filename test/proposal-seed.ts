import { DatabaseSync } from "node:sqlite";

import { getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import { PROPOSAL_KINDS, type ProposalKind } from "../src/core/contract/proposal-contract.ts";
import { SUBJECT_TABLE } from "../src/core/kernel/schema.ts";
import type { Instance } from "./instance.ts";

interface Seed {
  readonly id?: number;
  readonly reason?: string | null;
  readonly state?: string;
  readonly createdAt?: number;
  readonly run?: Readonly<{ cursor: number; moved: number; unitRevision: number }>;
}

export function subjectTable(kind: ProposalKind): string {
  return getTableName(SUBJECT_TABLE[kind]);
}

type SubjectOf<Kind extends ProposalKind> = Kind extends ProposalKind
  ? Readonly<Omit<(typeof SUBJECT_TABLE)[Kind]["$inferInsert"], "proposalId" | "kind">>
  : never;

export function seedProposal<Kind extends ProposalKind>(
  instance: Instance,
  kind: Kind,
  subject: SubjectOf<Kind>,
  { id, reason = "A reason.", state = "open", createdAt = 1, run }: Readonly<Seed> = {},
): number {
  const given: Readonly<Partial<Record<string, number>>> = subject;
  const columns = Object.entries(getTableColumns<SQLiteTable>(SUBJECT_TABLE[kind])).flatMap(
    ([key, { name }]) => {
      const value = given[key];

      return value === undefined ? [] : [{ name, value }];
    },
  );

  using database = new DatabaseSync(instance.databaseFile);

  database.exec("begin immediate");

  const head = database
    .prepare(
      "insert into proposals (id, kind, reason, state, created_at, cursor, moved, unit_revision) values (?, ?, ?, ?, ?, ?, ?, ?) returning id",
    )
    .get(
      id ?? null,
      kind,
      reason,
      state,
      createdAt,
      run?.cursor ?? null,
      run?.moved ?? null,
      run?.unitRevision ?? null,
    );

  const proposalId = Number(head?.["id"]);

  database
    .prepare(
      `insert into ${subjectTable(kind)} (proposal_id, kind, ${columns.map(({ name }) => name).join(", ")}) values (?, ?, ${columns.map(() => "?").join(", ")})`,
    )
    .run(proposalId, kind, ...columns.map(({ value }) => value));
  database.exec("commit");

  return proposalId;
}

export function removeProposals(instance: Instance): void {
  using database = new DatabaseSync(instance.databaseFile);

  for (const kind of PROPOSAL_KINDS) database.prepare(`delete from ${subjectTable(kind)}`).run();
}

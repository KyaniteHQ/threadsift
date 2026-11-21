import { DatabaseSync } from "node:sqlite";

import { PROPOSAL_KINDS, type ProposalKind } from "../src/core/contract/proposal-contract.ts";
import type { Instance } from "./instance.ts";

interface Seed {
  readonly id?: number;
  readonly reason?: string | null;
  readonly state?: string;
  readonly createdAt?: number;
  readonly run?: Readonly<{ cursor: number; moved: number; unitRevision: number }>;
}

export function subjectTable(kind: ProposalKind): string {
  return `${kind.replaceAll("-", "_")}_proposals`;
}

export function seedProposal(
  instance: Instance,
  kind: ProposalKind,
  subject: Readonly<Record<string, number>>,
  { id, reason = "A reason.", state = "open", createdAt = 1, run }: Readonly<Seed> = {},
): number {
  const database = new DatabaseSync(instance.databaseFile);

  try {
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
    const columns = Object.keys(subject);

    database
      .prepare(
        `insert into ${subjectTable(kind)} (proposal_id, kind, ${columns.join(", ")}) values (?, ?, ${columns.map(() => "?").join(", ")})`,
      )
      .run(proposalId, kind, ...Object.values(subject));

    return proposalId;
  } finally {
    database.close();
  }
}

export function removeProposals(instance: Instance, id?: number): void {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    for (const kind of PROPOSAL_KINDS) {
      if (id === undefined) database.prepare(`delete from ${subjectTable(kind)}`).run();
      else database.prepare(`delete from ${subjectTable(kind)} where proposal_id = ?`).run(id);
    }
  } finally {
    database.close();
  }
}

import { type SQLWrapper, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { OwnedJobKind } from "../../../core/contract/job-contract.ts";
import { type ProposalKind, WEEKLY_TASK } from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { enqueueRows, opening } from "../../../core/kernel/job-rows.ts";
import { items } from "../../../core/kernel/schema.ts";
import {
  type Proposed,
  insertedProposals,
  removedOpen,
  whereSubject,
} from "./proposal-lifecycle.ts";
import { NEWEST_DIGESTED_ITEM, claimedAt, claimingWeek } from "./scheduled-claim.ts";

const PLAIN_CHECK = "plain-check";

type ModelKind = {
  readonly [Kind in ProposalKind]: (typeof WEEKLY_TASK)[Kind] extends OwnedJobKind ? Kind : never;
}[ProposalKind];

type PlainKind = Exclude<ProposalKind, ModelKind>;

export type PlainRows<Kind extends PlainKind> = Omit<Proposed<Kind>, "state" | "reason">;

interface PlainWeek<Kind extends PlainKind> {
  readonly proposed: (db: Database) => PlainRows<Kind>;
  readonly closedWhen: (db: Database) => Readonly<SQLWrapper>;
}

export interface WeeklyCheck<Kind extends ProposalKind> {
  readonly kind: Kind;
  readonly run: (ports: JobPorts, now: number) => Promise<void>;
}

export function plainCheck<Kind extends PlainKind>(
  kind: Kind,
  { proposed, closedWhen }: Readonly<PlainWeek<Kind>>,
): WeeklyCheck<Kind> {
  const task = WEEKLY_TASK[kind];

  return {
    kind,
    run: async ({ db }, now) => {
      await db.batch([
        claimingWeek(db, now, task),
        ...insertedProposals(
          db,
          kind,
          now,
          { ...proposed(db), state: sql`'open'`, reason: sql`${PLAIN_CHECK}` },
          sql`changes() > 0`,
        ),
        removedOpen(db, kind, claimedAt(task, now), whereSubject(kind, closedWhen(db))),
      ]);
    },
  };
}

export function modelCheck<Kind extends ModelKind>(
  kind: Kind,
  after: (db: Database, now: number) => readonly BatchItem<"sqlite">[] = () => [],
): WeeklyCheck<Kind> {
  const task = WEEKLY_TASK[kind];

  return {
    kind,
    run: async (ports, now) => {
      const { db } = ports;

      const [, opened] = await db.batch([
        claimingWeek(db, now, task),
        opening(db, {
          kind: task,
          address: sql`${items.originalUrl}`,
          now,
          where: sql`${items.id} = ${NEWEST_DIGESTED_ITEM} and changes() > 0`,
        }),
        ...after(db, now),
      ]);

      await enqueueRows(ports, opened);
    },
  };
}

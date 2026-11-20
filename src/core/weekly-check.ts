import { type SQLWrapper, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "./database.ts";
import type { JobPorts } from "./job-outcome.ts";
import { enqueueRows, opening } from "./job-rows.ts";
import { type OwnedJobKind, type ProposalKind, WEEKLY_TASK } from "./kinds.ts";
import { type OwnSubjects, proposalRow, removedOpen } from "./proposal-lifecycle.ts";
import { NEWEST_DIGESTED_ITEM, claimedAt, claimingWeek } from "./scheduled-claim.ts";
import { items, proposals } from "./schema.ts";

const PLAIN_CHECK = "plain-check";

type ModelKind = {
  readonly [Kind in ProposalKind]: (typeof WEEKLY_TASK)[Kind] extends OwnedJobKind ? Kind : never;
}[ProposalKind];

type PlainKind = Exclude<ProposalKind, ModelKind>;

export type PlainRow<Kind extends PlainKind> = (
  subjects: OwnSubjects<Kind>,
) => ReturnType<typeof proposalRow>;

interface PlainWeek<Kind extends PlainKind> {
  readonly inserted: (db: Database, row: PlainRow<Kind>) => BatchItem<"sqlite">;
  readonly closedWhen: (db: Database) => Readonly<SQLWrapper>;
}

export interface WeeklyCheck<Kind extends ProposalKind> {
  readonly kind: Kind;
  readonly run: (ports: JobPorts, now: number) => Promise<void>;
}

export function plainCheck<Kind extends PlainKind>(
  kind: Kind,
  { inserted, closedWhen }: Readonly<PlainWeek<Kind>>,
): WeeklyCheck<Kind> {
  const task = WEEKLY_TASK[kind];

  return {
    kind,
    run: async ({ db }, now) => {
      const row: PlainRow<Kind> = (subjects) =>
        proposalRow(
          { kind, state: sql`'open'`, reason: sql`${PLAIN_CHECK}`, createdAt: now },
          subjects,
        );

      await db.batch([
        claimingWeek(db, now, task),
        inserted(db, row),
        removedOpen(db, claimedAt(task, now), eq(proposals.kind, kind), closedWhen(db)),
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

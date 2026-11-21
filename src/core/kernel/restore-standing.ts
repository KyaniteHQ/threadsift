import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import type { RESTORE_STATES } from "../contract/restore-contract.ts";
import { listed } from "./schema-checks.ts";

export type Standing = Readonly<{
  state: (typeof RESTORE_STATES)[number];
  gaveUp?: true;
  undoing?: boolean;
  pastCheck?: boolean;
  wrote?: boolean;
}>;

type Columns = Readonly<Record<"state" | "phase" | "failure" | "restored", Readonly<SQLWrapper>>>;

export const NOTHING_WRITTEN = "{}";

export const HOLDING: readonly Standing[] = [
  { state: "running" },
  { state: "failed", gaveUp: true },
];

export const OPEN_RUNS: readonly Standing[] = [{ state: "uploading" }, ...HOLDING];

function conditionsOf(
  columns: Columns,
  { state, gaveUp, undoing, pastCheck, wrote }: Standing,
): readonly SQL[] {
  return [
    sql`${columns.state} = ${listed([state])}`,
    ...(gaveUp === true ? [sql`${columns.failure} = 'gave-up'`] : []),
    ...(undoing === undefined
      ? []
      : [undoing ? sql`${columns.phase} = 'undoing'` : sql`${columns.phase} <> 'undoing'`]),
    ...(pastCheck === undefined
      ? []
      : [pastCheck ? sql`${columns.phase} <> 'check'` : sql`${columns.phase} = 'check'`]),
    ...(wrote === undefined
      ? []
      : [
          wrote
            ? sql`${columns.restored} <> ${NOTHING_WRITTEN}`
            : sql`${columns.restored} = ${NOTHING_WRITTEN}`,
        ]),
  ];
}

function allOf(conditions: readonly SQL[]): SQL {
  return sql.join([...conditions], sql` and `);
}

function groupOf(conditions: readonly SQL[]): SQL {
  return conditions.length > 1 ? sql`(${allOf(conditions)})` : allOf(conditions);
}

export function standingSql(columns: Columns, standings: readonly Standing[]): SQL {
  const [only, ...others] = standings;

  if (only !== undefined && others.length === 0) {
    return allOf(conditionsOf(columns, only));
  }

  return sql`(${sql.join(
    standings.map((standing) => groupOf(conditionsOf(columns, standing))),
    sql` or `,
  )})`;
}

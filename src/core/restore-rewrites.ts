import { type SQL, sql } from "drizzle-orm";

export type Extract = (column: string) => SQL;

export type Rewrite = (get: Extract) => SQL;

function unlessAccepting(column: string): Rewrite {
  return (get) => sql`case when ${get("state")} = 'accepting' then null else ${get(column)} end`;
}

const PROPOSAL_REWRITES = {
  state: (get) => sql`case ${get("state")} when 'accepting' then 'open' else ${get("state")} end`,
  cursor: unlessAccepting("cursor"),
  moved: unlessAccepting("moved"),
  unit_revision: unlessAccepting("unit_revision"),
  failed_runs: unlessAccepting("failed_runs"),
} satisfies Readonly<Record<string, Rewrite>>;

export const REWRITES: ReadonlyMap<string, Readonly<Record<string, Rewrite>>> = new Map([
  ["proposals", PROPOSAL_REWRITES],
]);

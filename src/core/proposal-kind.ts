import type { SQLWrapper } from "drizzle-orm";

import type { JobPorts } from "./job-outcome.ts";
import type { MergeAcceptance } from "./merge-accept.ts";
import type { ProposalKind, Proposal } from "./proposal-contract.ts";
import type { PageRow } from "./proposal-rows.ts";
import type { WeeklyCheck } from "./weekly-check.ts";

export type Acceptance = MergeAcceptance | "not-current" | "no-provider";

type ProposalOf<Kind extends ProposalKind> = Proposal extends infer Listed
  ? Listed extends { readonly kind: infer Kinds }
    ? Kind extends Kinds
      ? Listed
      : never
    : never
  : never;

type Nullable<Value> = Value extends string
  ? string | null
  : Value extends number
    ? number | null
    : { readonly [Key in keyof Value]: Nullable<Value[Key]> };

type PageEntry<Kind extends ProposalKind> = Pick<PageRow, "kind" | "state"> &
  Nullable<Omit<ProposalOf<Kind>, "kind" | "state">>;

export interface ProposalKindSpec<Kind extends ProposalKind> {
  readonly stage: string;
  readonly accept: (ports: JobPorts, id: number) => Promise<Acceptance>;
  readonly listedWhile: Readonly<SQLWrapper> | undefined;
  readonly pageEntry: (row: Readonly<PageRow>) => PageEntry<Kind>;
  readonly weekly: WeeklyCheck<Kind>;
}

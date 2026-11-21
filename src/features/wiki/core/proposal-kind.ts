import type { SQLWrapper } from "drizzle-orm";

import type {
  Acceptance,
  ProposalKind,
  Proposal,
} from "../../../core/contract/proposal-contract.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { PageRow } from "./proposal-rows.ts";
import type { WeeklyCheck } from "./weekly-check.ts";

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

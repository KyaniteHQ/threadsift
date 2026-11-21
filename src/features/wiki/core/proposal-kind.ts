import type {
  Acceptance,
  Proposal,
  ProposalKind,
} from "../../../core/contract/proposal-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { WeeklyCheck } from "./weekly-check.ts";

export type ProposalOf<Kind extends ProposalKind> = Proposal extends infer Entry
  ? Entry extends { readonly kind: infer Kinds }
    ? Kind extends Kinds
      ? Entry
      : never
    : never
  : never;

export interface ListedRow {
  readonly id: number;
}

export interface ProposalKindSpec<Kind extends ProposalKind> {
  readonly stage: string;
  readonly accept: (ports: JobPorts, id: number) => Promise<Acceptance>;
  page(db: Database, cursor: number | null): PromiseLike<readonly ListedRow[]>;
  pageEntry(row: ListedRow): ProposalOf<Kind>;
  readonly weekly: WeeklyCheck<Kind>;
}

import { isRefusedLink } from "../../../core/contract/links.ts";
import type { Refused } from "../../../core/kernel/paste-outcome.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { type Closed, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { type Budgeted, withinBudget } from "../../access/core/agent-token-budget.ts";
import type { Caller } from "../../access/core/caller.ts";

type OwnerCaller = Extract<Caller, { readonly kind: "owner" }>;

const REFUSED: Refused = { kind: "refused" };

export function admitted<Result>(
  ports: Ports,
  caller: Readonly<OwnerCaller>,
  urls: readonly string[],
  run: () => Promise<Result>,
): Promise<Result | Closed>;
export function admitted<Result>(
  ports: Ports,
  caller: Readonly<Caller>,
  urls: readonly string[],
  run: () => Promise<Result>,
): Promise<Budgeted<Result> | Closed>;
export function admitted<Result>(
  ports: Ports,
  caller: Readonly<Caller>,
  urls: readonly string[],
  run: () => Promise<Result>,
): Promise<Budgeted<Result> | Closed> {
  return whileOpen(ports.db, () => withinBudget(ports, caller, urls, run));
}

export function refusedHost(absoluteUrl: string): Refused | null {
  return isRefusedLink(absoluteUrl) ? REFUSED : null;
}

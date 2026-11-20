import { type Budgeted, withinBudget } from "../access/agent-token-budget.ts";
import type { Caller } from "../access/caller.ts";
import { isRefusedLink } from "../contract/links.ts";
import type { Refused } from "../kernel/paste-outcome.ts";
import type { Ports } from "../kernel/ports.ts";
import { type Closed, whileOpen } from "../kernel/restore-hold.ts";

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

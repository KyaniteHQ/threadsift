import { type Budgeted, withinBudget } from "./agent-token-budget.ts";
import type { Caller } from "./caller.ts";
import { isRefusedLink } from "./links.ts";
import type { Refused } from "./paste-outcome.ts";
import type { Ports } from "./ports.ts";
import { type Closed, whileOpen } from "./restore-hold.ts";

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

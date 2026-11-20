import { z } from "zod";

import { WholeCount } from "./whole-count.ts";

export const SCOPES = ["read", "add", "digest", "delete", "reddit"] as const;

export type Scope = (typeof SCOPES)[number];

export const ScopeListSchema = z.array(z.enum(SCOPES));

export const DEFAULT_SCOPES = ["read", "add"] as const satisfies readonly Scope[];

export const STORED_DEFAULT_SCOPES = [
  "read",
  "add",
  "digest",
  "delete",
] as const satisfies readonly Scope[];

export const DEFAULT_TOKEN_BUDGET = 200;

export const UNKNOWN_TOKEN = "Unknown or revoked agent token";

export const BUDGET_SPENT = "budget-spent";

export interface BudgetSpent {
  readonly kind: typeof BUDGET_SPENT;
  readonly until: number;
}

export const TokenBudgetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited"), added: WholeCount }),
  z.object({
    kind: z.literal("within"),
    limit: WholeCount,
    added: WholeCount,
    left: WholeCount,
  }),
  z.object({
    kind: z.literal("spent"),
    limit: WholeCount,
    added: WholeCount,
    until: z.number().int(),
  }),
]);

export type TokenBudget = z.infer<typeof TokenBudgetSchema>;

export const DailyBudgetSchema = z.number().int().positive().nullable();

export type NeededScopes = readonly [Scope, ...Scope[]];

export function missingScope(granted: readonly string[], needed: NeededScopes): Scope | undefined {
  return needed.find((scope) => !granted.includes(scope));
}

export function pasteScopes(sendsDigest: boolean): NeededScopes {
  return sendsDigest ? ["add", "digest"] : ["add"];
}

export function lacksScope(scope: Scope): string {
  return `This agent token lacks the ${scope} scope`;
}

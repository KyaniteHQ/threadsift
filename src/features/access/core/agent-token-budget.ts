import { and, eq, gte, lt } from "drizzle-orm";

import {
  BUDGET_SPENT,
  type BudgetSpent,
  type TokenBudget,
} from "../../../core/contract/agent-token-contract.ts";
import { isRedditShareLink, isRefusedLink, parseLink } from "../../../core/contract/links.ts";
import { DAY_MS } from "../../../core/contract/time-units.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { agentTokens, itemAliases, items } from "../../../core/kernel/schema.ts";
import { among } from "../../../core/kernel/sql-expressions.ts";
import type { Caller } from "./caller.ts";

function nextUtcMidnight(now: number): number {
  return (Math.floor(now / DAY_MS) + 1) * DAY_MS;
}

export function retryAfterSeconds({ until }: Readonly<BudgetSpent>, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 1000));
}

export function budgetOf(limit: number | null, added: number, now: number): TokenBudget {
  if (limit === null) return { kind: "unlimited", added };

  return added < limit
    ? { kind: "within", limit, added, left: limit - added }
    : { kind: "spent", limit, added, until: nextUtcMidnight(now) };
}

function spentUntilMidnight(now: number): BudgetSpent {
  return { kind: BUDGET_SPENT, until: nextUtcMidnight(now) };
}

export interface UnknownToken {
  readonly kind: "unknown-token";
}

export type Budgeted<Result> = Result | BudgetSpent | UnknownToken;

export function tokenItemsToday(
  db: Database,
  tokenIdOrColumn: number | typeof agentTokens.id,
  now: number,
) {
  const start = Math.floor(now / DAY_MS) * DAY_MS;

  return db.$count(
    items,
    and(
      eq(items.addedByToken, tokenIdOrColumn),
      gte(items.savedAt, start),
      lt(items.savedAt, start + DAY_MS),
    ),
  );
}

async function possiblyNew(db: Database, urls: readonly string[]): Promise<number> {
  const links = new Set<string>();

  for (const url of urls) {
    if (!isRefusedLink(url)) links.add(parseLink(url).normalizedUrl);
  }

  if (links.size === 0) return 0;

  const listed = [...links];

  const [heldItems, aliases] = await Promise.all([
    db.select({ key: items.normalizedUrl }).from(items).where(among(items.normalizedUrl, listed)),
    db
      .select({ key: itemAliases.normalizedUrl, address: itemAliases.address })
      .from(itemAliases)
      .where(among(itemAliases.normalizedUrl, listed)),
  ]);

  const known = new Set(heldItems.map(({ key }) => key));

  for (const { key, address } of aliases) {
    if (isRedditShareLink(address)) known.delete(key);
    else known.add(key);
  }

  return links.size - known.size;
}

export async function withinBudget<Saved>(
  { db }: Readonly<Pick<Ports, "db">>,
  caller: Readonly<Caller>,
  urls: readonly string[],
  run: () => Promise<Saved>,
): Promise<Budgeted<Saved>> {
  if (caller.kind === "owner") return run();

  const [token] = await db
    .select({ limit: agentTokens.dailyBudget })
    .from(agentTokens)
    .where(eq(agentTokens.id, caller.id));

  if (token === undefined) return { kind: "unknown-token" };

  if (token.limit === null) return run();

  const now = Date.now();

  const [added, newItems] = await Promise.all([
    tokenItemsToday(db, caller.id, now),
    possiblyNew(db, urls),
  ]);

  return newItems > 0 && added + newItems > token.limit ? spentUntilMidnight(now) : run();
}

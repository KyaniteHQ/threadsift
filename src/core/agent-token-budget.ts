import { and, eq, gte, lt, sql } from "drizzle-orm";

import type { Caller } from "./caller.ts";
import type { Database } from "./database.ts";
import { among } from "./guards.ts";
import { BUDGET_SPENT, type BudgetSpent, type TokenBudget } from "./kinds.ts";
import { isRefusedLink, parseLink } from "./links.ts";
import type { Ports } from "./ports.ts";
import { agentTokens, itemAliases, items } from "./schema.ts";

const DAY_MS = 86_400_000;

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

export type Budgeted<Result> = Result | BudgetSpent | { readonly kind: "unknown-token" };

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

  const [heldItems, heldAliases] = await Promise.all([
    db.$count(items, among(items.normalizedUrl, listed)),
    db.$count(
      itemAliases,
      sql`${among(itemAliases.normalizedUrl, listed)} and ${itemAliases.normalizedUrl} not in (select ${items.normalizedUrl} from ${items})`,
    ),
  ]);

  return links.size - heldItems - heldAliases;
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

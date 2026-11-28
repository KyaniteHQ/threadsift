import { and, eq, exists, gte, lt, sql } from "drizzle-orm";

import {
  BUDGET_SPENT,
  type BudgetSpent,
  type TokenBudget,
} from "../../../core/contract/agent-token-contract.ts";
import { aliasAnswers, isRefusedLink, parseLink } from "../../../core/contract/links.ts";
import { DAY_MS } from "../../../core/contract/time-units.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { insertGuard, refusedWith } from "../../../core/kernel/guards.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { type Closed, unlessHeld } from "../../../core/kernel/restore-hold.ts";
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

const UNKNOWN: UnknownToken = { kind: "unknown-token" };

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

export function dailyBudgetGuard(
  db: Database,
  {
    addedByToken,
    normalizedUrl,
    savedAt,
  }: Readonly<{ addedByToken: number | null; normalizedUrl: string; savedAt: number }>,
) {
  if (addedByToken === null) return insertGuard(db, sql`1`, "budget");

  const held = exists(
    db
      .select({ one: sql`1` })
      .from(items)
      .where(eq(items.normalizedUrl, normalizedUrl)),
  );

  const within = exists(
    db
      .select({ one: sql`1` })
      .from(agentTokens)
      .where(
        and(
          eq(agentTokens.id, addedByToken),
          sql`(${agentTokens.dailyBudget} is null or ${tokenItemsToday(db, addedByToken, savedAt)} < ${agentTokens.dailyBudget})`,
        ),
      ),
  );

  return insertGuard(db, sql`${held} or ${within}`, "budget");
}

async function refusedBudget(db: Database, tokenId: number): Promise<BudgetSpent | UnknownToken> {
  const [token] = await db
    .select({ id: agentTokens.id })
    .from(agentTokens)
    .where(eq(agentTokens.id, tokenId));

  return token === undefined ? UNKNOWN : spentUntilMidnight(Date.now());
}

export async function budgetAnswered<Saved>(
  db: Database,
  tokenId: number,
  run: () => Promise<Saved>,
): Promise<Budgeted<Saved>> {
  try {
    return await run();
  } catch (error) {
    if (!refusedWith(error, "budget")) throw error;
  }

  return refusedBudget(db, tokenId);
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
    if (aliasAnswers(address)) known.add(key);
    else known.delete(key);
  }

  return links.size - known.size;
}

export async function withinBudget<Saved>(
  { db }: Readonly<Pick<Ports, "db">>,
  caller: Readonly<Caller>,
  urls: readonly string[],
  run: () => Promise<Saved>,
): Promise<Budgeted<Saved> | Closed> {
  if (caller.kind === "owner") return run();

  const [token] = await db
    .select({ limit: agentTokens.dailyBudget })
    .from(agentTokens)
    .where(eq(agentTokens.id, caller.id));

  if (token === undefined) return UNKNOWN;

  if (token.limit !== null) {
    const now = Date.now();

    const [added, newItems] = await Promise.all([
      tokenItemsToday(db, caller.id, now),
      possiblyNew(db, urls),
    ]);

    if (newItems > 0 && added + newItems > token.limit) {
      return unlessHeld(db, spentUntilMidnight(now));
    }
  }

  return budgetAnswered(db, caller.id, run);
}

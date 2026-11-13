import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";

import type { Caller } from "./caller.ts";
import { refusedBy } from "./guards.ts";
import { BUDGET_SPENT, type BudgetSpent, type TokenBudget } from "./kinds.ts";
import { isRedditShareLink, isRefusedLink, isShortLink, parseLink } from "./links.ts";
import type { Database, Ports } from "./ports.ts";
import { agentTokenDays, agentTokens, itemAliases, items } from "./schema.ts";

const DAY_MS = 86_400_000;

const DAYS_KEPT = 2;

const REFUSED_BY_BUDGET = /agent_token_budget:/u;

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function nextUtcMidnight(now: number): number {
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

export function spentUntilMidnight(now: number): BudgetSpent {
  return { kind: BUDGET_SPENT, until: nextUtcMidnight(now) };
}

export type Budgeted<Result> = Result | BudgetSpent;

export async function unlessSpent<Result>(run: () => Promise<Result>): Promise<Budgeted<Result>> {
  try {
    return await run();
  } catch (error) {
    if (refusedBy(error, REFUSED_BY_BUDGET)) return spentUntilMidnight(Date.now());

    throw error;
  }
}

async function reserveSlots(
  db: Database,
  tokenId: number,
  slots: number,
  day: string,
): Promise<boolean> {
  const limit = sql`(select ${agentTokens.dailyBudget} from ${agentTokens} where ${agentTokens.id} = ${tokenId})`;

  const reserved = await db
    .insert(agentTokenDays)
    .select(
      db
        .select({
          tokenId: agentTokens.id,
          day: sql<string>`${day}`.as("day"),
          added: sql<number>`${slots}`.as("added"),
        })
        .from(agentTokens)
        .where(
          and(
            eq(agentTokens.id, tokenId),
            or(isNull(agentTokens.dailyBudget), gte(agentTokens.dailyBudget, slots)),
          ),
        ),
    )
    .onConflictDoUpdate({
      target: [agentTokenDays.tokenId, agentTokenDays.day],
      set: { added: sql`${agentTokenDays.added} + ${slots}` },
      setWhere: sql`${limit} is null or ${agentTokenDays.added} + ${slots} <= ${limit}`,
    })
    .returning({ added: agentTokenDays.added });

  return reserved.length > 0;
}

async function adjustDay(db: Database, tokenId: number, day: string, change: number) {
  if (change === 0) return;

  await db
    .insert(agentTokenDays)
    .values({ tokenId, day, added: Math.max(change, 0) })
    .onConflictDoUpdate({
      target: [agentTokenDays.tokenId, agentTokenDays.day],
      set: { added: sql`max(${agentTokenDays.added} + ${change}, 0)` },
    });
}

function jsonList(values: readonly (string | number)[]) {
  return sql`(select value from json_each(${JSON.stringify(values)}))`;
}

async function possiblyNew(db: Database, urls: readonly string[]): Promise<number> {
  const addresses = new Set<string>();
  const shortLinks = new Set<string>();

  for (const url of urls) {
    if (isRefusedLink(url)) continue;

    const { normalizedUrl } = parseLink(url);

    (isShortLink(url) || isRedditShareLink(url) ? shortLinks : addresses).add(normalizedUrl);
  }

  const [heldAddresses, heldShortLinks] = await Promise.all([
    addresses.size === 0
      ? 0
      : db.$count(items, sql`${items.normalizedUrl} in ${jsonList([...addresses])}`),
    shortLinks.size === 0
      ? 0
      : db.$count(itemAliases, sql`${itemAliases.normalizedUrl} in ${jsonList([...shortLinks])}`),
  ]);

  return addresses.size - heldAddresses + (shortLinks.size - heldShortLinks);
}

interface SavedBatch {
  readonly kind: string;
  readonly entries?: readonly {
    readonly outcome: string;
    readonly item?: { readonly id: number };
  }[];
}

async function settle(
  db: Database,
  tokenId: number,
  saved: Readonly<SavedBatch>,
  reserved: { readonly slots: number; readonly day: string },
): Promise<void> {
  const created = (saved.entries ?? []).flatMap(({ outcome, item }) =>
    outcome === "added" && item !== undefined ? [item.id] : [],
  );

  const attributed =
    created.length === 0
      ? []
      : await db
          .update(items)
          .set({ addedByToken: tokenId })
          .where(sql`${items.id} in ${jsonList(created)}`)
          .returning({ savedAt: items.savedAt });

  const perDay = new Map<string, number>([[reserved.day, -reserved.slots]]);

  for (const { savedAt } of attributed) {
    const day = utcDay(savedAt);

    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  await Promise.all([...perDay].map(([day, change]) => adjustDay(db, tokenId, day, change)));
}

export async function withinBudget<Saved extends SavedBatch>(
  { db }: Readonly<Pick<Ports, "db">>,
  caller: Readonly<Caller>,
  urls: readonly string[],
  run: (saveAs: Caller) => Promise<Saved>,
): Promise<Budgeted<Saved>> {
  if (caller.kind !== "token") return run(caller);

  const now = Date.now();
  const reserved = { slots: await possiblyNew(db, urls), day: utcDay(now) };

  if (reserved.slots > 0 && !(await reserveSlots(db, caller.id, reserved.slots, reserved.day))) {
    return spentUntilMidnight(now);
  }

  const saved = await run({ kind: "batch", id: caller.id });

  await settle(db, caller.id, saved, reserved);

  return saved;
}

export async function forgetOldDays(db: Database, tokenId: number, now: number): Promise<void> {
  await db
    .delete(agentTokenDays)
    .where(
      and(
        eq(agentTokenDays.tokenId, tokenId),
        lt(agentTokenDays.day, utcDay(now - DAYS_KEPT * DAY_MS)),
      ),
    );
}

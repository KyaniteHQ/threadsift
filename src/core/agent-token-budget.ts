import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";

import type { Caller } from "./caller.ts";
import { refusedBy } from "./guards.ts";
import type { SaveResult } from "./items.ts";
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

interface Reserved {
  readonly slots: number;
  readonly day: string;
}

export interface CountedSaves {
  readonly save: <Result extends SaveResult>(
    write: (caller: Caller) => Promise<Result>,
  ) => Promise<Result>;
}

interface SlotLedger {
  readonly saves: CountedSaves;
  readonly created: readonly number[];
  readonly free: () => number;
}

function slotLedger(tokenId: number, slots: number): SlotLedger {
  const created: number[] = [];
  let free = slots;

  const save: CountedSaves["save"] = async (write) => {
    if (free === 0) return write({ kind: "token", id: tokenId });

    free -= 1;

    const result = await write({ kind: "batch", id: tokenId });

    if (result.kind === "saved" && result.created) created.push(result.item.id);
    else free += 1;

    return result;
  };

  return { saves: { save }, created, free: () => free };
}

async function settle(
  db: Database,
  tokenId: number,
  { created, free }: Readonly<Pick<SlotLedger, "created" | "free">>,
  reserved: Reserved,
): Promise<void> {
  const attributed =
    created.length === 0
      ? []
      : await db
          .update(items)
          .set({ addedByToken: tokenId })
          .where(sql`${items.id} in ${jsonList(created)}`)
          .returning({ savedAt: items.savedAt });

  const perDay = new Map<string, number>([[reserved.day, -(free() + created.length)]]);

  for (const { savedAt } of attributed) {
    const day = utcDay(savedAt);

    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }

  await Promise.all([...perDay].map(([day, change]) => adjustDay(db, tokenId, day, change)));
}

export async function withinBudget<Saved>(
  { db }: Readonly<Pick<Ports, "db">>,
  caller: Readonly<Caller>,
  urls: readonly string[],
  run: (saves: CountedSaves) => Promise<Saved>,
): Promise<Budgeted<Saved>> {
  if (caller.kind !== "token") return run({ save: (write) => write(caller) });

  const now = Date.now();
  const reserved = { slots: await possiblyNew(db, urls), day: utcDay(now) };

  if (reserved.slots > 0 && !(await reserveSlots(db, caller.id, reserved.slots, reserved.day))) {
    return spentUntilMidnight(now);
  }

  const ledger = slotLedger(caller.id, reserved.slots);

  const saved = await unlessSpent(() => run(ledger.saves));

  await settle(db, caller.id, ledger, reserved);

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

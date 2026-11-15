import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";

import type { Caller } from "./caller.ts";
import { withCleanup } from "./failure-log.ts";
import { refusedBy } from "./guards.ts";
import type { SaveResult } from "./items.ts";
import { BUDGET_SPENT, type BudgetSpent, type TokenBudget } from "./kinds.ts";
import { isRefusedLink, parseLink } from "./links.ts";
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

function jsonList(values: readonly (string | number)[]) {
  return sql`(select value from json_each(${JSON.stringify(values)}))`;
}

async function possiblyNew(db: Database, urls: readonly string[]): Promise<number> {
  const links = new Set<string>();

  for (const url of urls) {
    if (!isRefusedLink(url)) links.add(parseLink(url).normalizedUrl);
  }

  if (links.size === 0) return 0;

  const listed = jsonList([...links]);

  const [heldItems, heldAliases] = await Promise.all([
    db.$count(items, sql`${items.normalizedUrl} in ${listed}`),
    db.$count(
      itemAliases,
      sql`${itemAliases.normalizedUrl} in ${listed} and ${itemAliases.normalizedUrl} not in (select ${items.normalizedUrl} from ${items})`,
    ),
  ]);

  return links.size - heldItems - heldAliases;
}

interface Reserved {
  readonly slots: number;
  readonly day: string;
}

export type SaveAs = <Result extends SaveResult>(
  write: (caller: Caller) => Promise<Result>,
) => Promise<Result>;

function slotLedger(db: Database, tokenId: number, { slots, day }: Readonly<Reserved>) {
  let held = 0;
  let created = 0;
  let createdOnDay = 0;

  const saveAs: SaveAs = async (write) => {
    if (held === slots) return write({ kind: "token", id: tokenId });

    held += 1;

    const result = await write({ kind: "batch", id: tokenId, day });

    if (result.kind === "saved" && result.created) {
      created += 1;

      if (utcDay(result.item.savedAt) === day) createdOnDay += 1;
    } else {
      held -= 1;
    }

    return result;
  };

  const settle = async () => {
    const change = held - created + createdOnDay - slots;

    if (change === 0) return;

    await db
      .update(agentTokenDays)
      .set({ added: sql`max(${agentTokenDays.added} + ${change}, 0)` })
      .where(and(eq(agentTokenDays.tokenId, tokenId), eq(agentTokenDays.day, day)));
  };

  return { saveAs, settle };
}

export async function withinBudget<Saved>(
  { db }: Readonly<Pick<Ports, "db">>,
  caller: Readonly<Caller>,
  urls: readonly string[],
  run: (saveAs: SaveAs) => Promise<Saved>,
): Promise<Budgeted<Saved>> {
  if (caller.kind !== "token") return run((write) => write(caller));

  const slots = await possiblyNew(db, urls);
  const now = Date.now();
  const reserved = { slots, day: utcDay(now) };

  if (reserved.slots > 0 && !(await reserveSlots(db, caller.id, reserved.slots, reserved.day))) {
    return spentUntilMidnight(now);
  }

  const ledger = slotLedger(db, caller.id, reserved);

  return withCleanup(
    { event: "token-budget-not-settled", fields: { tokenId: caller.id } },
    () => unlessSpent(() => run(ledger.saveAs)),
    () => ledger.settle(),
  );
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

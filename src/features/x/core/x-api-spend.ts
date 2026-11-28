import { and, eq, sql } from "drizzle-orm";

import { DAY_MS } from "../../../core/contract/time-units.ts";
import type { XApiSpend } from "../../../core/contract/x-api-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { xApiItemSpend, xApiSpend } from "../../../core/kernel/schema.ts";

const DAY_LENGTH = "YYYY-MM-DD".length;

export interface Charge {
  readonly micros: number;
  readonly posts: number;
  readonly users: number;
}

export interface Reservation {
  readonly day: string;
  readonly worstMicros: number;
  readonly itemId: number | null;
}

export function utcDayOf(now: number): string {
  return new Date(now).toISOString().slice(0, DAY_LENGTH);
}

export function nextUtcDayAt(now: number): number {
  return (Math.floor(now / DAY_MS) + 1) * DAY_MS;
}

export async function spentOn(db: Database, day: string): Promise<XApiSpend> {
  const [row] = await db
    .select({ micros: xApiSpend.micros, posts: xApiSpend.posts, users: xApiSpend.users })
    .from(xApiSpend)
    .where(eq(xApiSpend.day, day));

  return { day, micros: row?.micros ?? 0, posts: row?.posts ?? 0, users: row?.users ?? 0 };
}

export async function itemSpentOn(db: Database, itemId: number, day: string): Promise<number> {
  const [row] = await db
    .select({ micros: xApiItemSpend.micros })
    .from(xApiItemSpend)
    .where(and(eq(xApiItemSpend.itemId, itemId), eq(xApiItemSpend.day, day)));

  return row?.micros ?? 0;
}

async function itemAdded(db: Database, day: string, itemId: number | null, micros: number) {
  if (itemId === null) return;

  await db
    .insert(xApiItemSpend)
    .values({ itemId, day, micros: sql`max(0, ${micros})` })
    .onConflictDoUpdate({
      target: [xApiItemSpend.itemId, xApiItemSpend.day],
      set: { micros: sql`max(0, ${xApiItemSpend.micros} + ${micros})` },
    });
}

export async function reserved(
  db: Database,
  reservation: Readonly<Reservation & { dayLimitMicros: number }>,
): Promise<boolean> {
  const { day, worstMicros, dayLimitMicros, itemId } = reservation;

  if (worstMicros > dayLimitMicros) return false;

  const rows = await db
    .insert(xApiSpend)
    .values({ day, micros: worstMicros })
    .onConflictDoUpdate({
      target: xApiSpend.day,
      set: { micros: sql`${xApiSpend.micros} + ${worstMicros}` },
      setWhere: sql`${xApiSpend.micros} + ${worstMicros} <= ${dayLimitMicros}`,
    })
    .returning({ day: xApiSpend.day });

  if (rows.length === 0) return false;

  await itemAdded(db, day, itemId, worstMicros);

  return true;
}

export async function settled(
  db: Database,
  reservation: Readonly<Reservation>,
  charge: Readonly<Charge>,
): Promise<void> {
  const { day, worstMicros, itemId } = reservation;
  const change = charge.micros - worstMicros;

  await db
    .update(xApiSpend)
    .set({
      micros: sql`max(0, ${xApiSpend.micros} + ${change})`,
      posts: sql`${xApiSpend.posts} + ${charge.posts}`,
      users: sql`${xApiSpend.users} + ${charge.users}`,
    })
    .where(eq(xApiSpend.day, day));

  await itemAdded(db, day, itemId, change);
}

export async function recordXPosts(db: Database, day: string, xPosts: number): Promise<void> {
  await db
    .insert(xApiSpend)
    .values({ day, xPosts })
    .onConflictDoUpdate({ target: xApiSpend.day, set: { xPosts } });
}

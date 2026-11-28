import { and, eq, sql } from "drizzle-orm";

import { DAY_MS } from "../../../core/contract/time-units.ts";
import type { XApiSpend } from "../../../core/contract/x-api-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { guardedBatch } from "../../../core/kernel/guards.ts";
import { xApiItemSpend, xApiSpend } from "../../../core/kernel/schema.ts";

const DAY_LENGTH = "YYYY-MM-DD".length;

export interface Charge {
  readonly micros: number;
  readonly posts: number;
  readonly users: number;
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

export interface ItemLimit {
  readonly id: number;
  readonly limitMicros: number;
}

export interface Reservation {
  readonly day: string;
  readonly worstMicros: number;
  readonly item: ItemLimit | null;
}

function dayMicros(day: string) {
  return sql`coalesce((select ${xApiSpend.micros} from ${xApiSpend} where ${xApiSpend.day} = ${day}), 0)`;
}

function itemMicros(item: Readonly<ItemLimit>, day: string) {
  return sql`coalesce((select ${xApiItemSpend.micros} from ${xApiItemSpend} where ${xApiItemSpend.itemId} = ${item.id} and ${xApiItemSpend.day} = ${day}), 0)`;
}

function roomFor(reservation: Readonly<Reservation>, dayLimitMicros: number) {
  const { day, worstMicros, item } = reservation;
  const dayRoom = sql`${dayMicros(day)} + ${worstMicros} <= ${dayLimitMicros}`;

  return item === null
    ? dayRoom
    : sql`${dayRoom} and ${itemMicros(item, day)} + ${worstMicros} <= ${item.limitMicros}`;
}

export function reserved(
  db: Database,
  reservation: Readonly<Reservation>,
  dayLimitMicros: number,
): Promise<boolean> {
  const { day, worstMicros, item } = reservation;
  const dayWrite = db
    .insert(xApiSpend)
    .values({ day, micros: worstMicros })
    .onConflictDoUpdate({
      target: xApiSpend.day,
      set: { micros: sql`${xApiSpend.micros} + ${worstMicros}` },
    });

  if (item === null) return guardedBatch(db, roomFor(reservation, dayLimitMicros), [dayWrite]);

  return guardedBatch(db, roomFor(reservation, dayLimitMicros), [
    dayWrite,
    db
      .insert(xApiItemSpend)
      .values({ itemId: item.id, day, micros: worstMicros })
      .onConflictDoUpdate({
        target: [xApiItemSpend.itemId, xApiItemSpend.day],
        set: { micros: sql`${xApiItemSpend.micros} + ${worstMicros}` },
      }),
  ]);
}

export async function settled(
  db: Database,
  reservation: Readonly<Reservation>,
  charge: Readonly<Charge>,
): Promise<void> {
  const { day, worstMicros, item } = reservation;
  const change = charge.micros - worstMicros;
  const dayWrite = db
    .update(xApiSpend)
    .set({
      micros: sql`${xApiSpend.micros} + ${change}`,
      posts: sql`${xApiSpend.posts} + ${charge.posts}`,
      users: sql`${xApiSpend.users} + ${charge.users}`,
    })
    .where(eq(xApiSpend.day, day));

  if (item === null) {
    await dayWrite;

    return;
  }

  await db.batch([
    dayWrite,
    db
      .update(xApiItemSpend)
      .set({ micros: sql`${xApiItemSpend.micros} + ${change}` })
      .where(and(eq(xApiItemSpend.itemId, item.id), eq(xApiItemSpend.day, day))),
  ]);
}

export async function recordXPosts(db: Database, day: string, xPosts: number): Promise<void> {
  await db
    .insert(xApiSpend)
    .values({ day, xPosts })
    .onConflictDoUpdate({ target: xApiSpend.day, set: { xPosts } });
}

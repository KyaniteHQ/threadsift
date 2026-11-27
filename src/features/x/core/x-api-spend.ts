import { eq, sql } from "drizzle-orm";

import { DAY_MS } from "../../../core/contract/time-units.ts";
import type { XApiSpend } from "../../../core/contract/x-api-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { xApiSpend } from "../../../core/kernel/schema.ts";
import { type Resources, microsOf } from "./x-api-plan.ts";

const DAY_LENGTH = "YYYY-MM-DD".length;

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

export async function reserved(
  db: Database,
  {
    day,
    worstMicros,
    dayLimitMicros,
  }: Readonly<{ day: string; worstMicros: number; dayLimitMicros: number }>,
): Promise<boolean> {
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

  return rows.length > 0;
}

export async function settled(
  db: Database,
  {
    day,
    worstMicros,
    counted,
  }: Readonly<{ day: string; worstMicros: number; counted: Readonly<Resources> }>,
): Promise<void> {
  await db
    .update(xApiSpend)
    .set({
      micros: sql`max(0, ${xApiSpend.micros} - ${worstMicros} + ${microsOf(counted)})`,
      posts: sql`${xApiSpend.posts} + ${counted.posts}`,
      users: sql`${xApiSpend.users} + ${counted.users}`,
    })
    .where(eq(xApiSpend.day, day));
}

export async function recordXPosts(db: Database, day: string, xPosts: number): Promise<void> {
  await db
    .insert(xApiSpend)
    .values({ day, xPosts })
    .onConflictDoUpdate({ target: xApiSpend.day, set: { xPosts } });
}

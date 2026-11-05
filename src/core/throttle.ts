import { eq, sql } from "drizzle-orm";

import type { ThrottleKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { throttles } from "./schema.ts";

const LOCK_AFTER_FAILURES = 10;
const FIRST_LOCK_MS = 60_000;
const LONGEST_LOCK_MS = 3_600_000;
const LAST_DOUBLING = 6;

export type Gate =
  | { readonly locked: false }
  | { readonly locked: true; readonly retryAfter: number };

export async function gateOf(db: Database, kind: ThrottleKind, now: number): Promise<Gate> {
  const [row] = await db.select().from(throttles).where(eq(throttles.kind, kind));

  if (row === undefined || row.lockedUntil <= now) {
    return { locked: false };
  }

  return { locked: true, retryAfter: Math.ceil((row.lockedUntil - now) / 1000) };
}

export async function recordFailure(db: Database, kind: ThrottleKind, now: number): Promise<void> {
  const failures = sql`${throttles.failures} + 1`;
  const doublings = sql`min(${failures} - ${LOCK_AFTER_FAILURES}, ${LAST_DOUBLING})`;

  await db
    .insert(throttles)
    .values({ kind, failures: 1, lockedUntil: 0 })
    .onConflictDoUpdate({
      target: throttles.kind,
      set: {
        failures,
        lockedUntil: sql`CASE WHEN ${failures} >= ${LOCK_AFTER_FAILURES} THEN ${now} + min(${LONGEST_LOCK_MS}, ${FIRST_LOCK_MS} << ${doublings}) ELSE 0 END`,
      },
    });
}

export async function recordSuccess(db: Database, kind: ThrottleKind): Promise<void> {
  await db.delete(throttles).where(eq(throttles.kind, kind));
}

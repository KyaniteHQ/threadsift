import { eq, sql } from "drizzle-orm";

import type { ThrottleKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { throttles } from "./schema.ts";

const LOCK_AFTER_FAILURES = 10;
const FIRST_LOCK_MS = 60_000;
const LONGEST_LOCK_MS = 3_600_000;
const LAST_DOUBLING = 6;

export type Gate =
  | { readonly locked: false; readonly tracked: boolean }
  | { readonly locked: true; readonly retryAfter: number };

export type Attempt =
  | { readonly kind: "ok" }
  | { readonly kind: "wrong" }
  | { readonly kind: "locked"; readonly retryAfter: number };

export async function gateOf(db: Database, kind: ThrottleKind, now: number): Promise<Gate> {
  const [row] = await db.select().from(throttles).where(eq(throttles.kind, kind));

  if (row === undefined) {
    return { locked: false, tracked: false };
  }

  if (row.lockedUntil <= now) {
    return { locked: false, tracked: true };
  }

  return { locked: true, retryAfter: Math.ceil((row.lockedUntil - now) / 1000) };
}

async function recordFailure(db: Database, kind: ThrottleKind, now: number): Promise<void> {
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

async function recordSuccess(db: Database, kind: ThrottleKind): Promise<void> {
  await db.delete(throttles).where(eq(throttles.kind, kind));
}

export async function settleAttempt(
  db: Database,
  kind: ThrottleKind,
  gate: Gate,
  verify: () => Promise<boolean>,
): Promise<Attempt> {
  if (gate.locked) {
    return { kind: "locked", retryAfter: gate.retryAfter };
  }

  if (!(await verify())) {
    await recordFailure(db, kind, Date.now());

    return { kind: "wrong" };
  }

  if (gate.tracked) {
    await recordSuccess(db, kind);
  }

  return { kind: "ok" };
}

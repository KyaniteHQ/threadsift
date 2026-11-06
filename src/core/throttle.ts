import { and, eq, lte, sql } from "drizzle-orm";

import type { ThrottleKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { throttles } from "./schema.ts";

const LOCK_AFTER_FAILURES = 10;
const FIRST_LOCK_MS = 60_000;
const LONGEST_LOCK_MS = 3_600_000;
const LAST_DOUBLING = 6;

export type Attempt<Proof> =
  | { readonly kind: "ok"; readonly proof: Proof }
  | { readonly kind: "wrong" }
  | { readonly kind: "locked"; readonly retryAfter: number };

type Admission =
  | { readonly admitted: true; readonly number: number }
  | { readonly admitted: false; readonly retryAfter: number };

async function admit(db: Database, kind: ThrottleKind, now: number): Promise<Admission> {
  const number = sql`${throttles.failures} + 1`;
  const doublings = sql`min(${number} - ${LOCK_AFTER_FAILURES}, ${LAST_DOUBLING})`;

  const [counted] = await db
    .insert(throttles)
    .values({ kind, failures: 1, lockedUntil: 0 })
    .onConflictDoUpdate({
      target: throttles.kind,
      set: {
        failures: number,
        lockedUntil: sql`CASE WHEN ${number} >= ${LOCK_AFTER_FAILURES} THEN ${now} + min(${LONGEST_LOCK_MS}, ${FIRST_LOCK_MS} << ${doublings}) ELSE 0 END`,
      },
      setWhere: lte(throttles.lockedUntil, now),
    })
    .returning({ number: throttles.failures });

  if (counted !== undefined) {
    return { admitted: true, number: counted.number };
  }

  const [row] = await db.select().from(throttles).where(eq(throttles.kind, kind));

  return row !== undefined && row.lockedUntil > now
    ? { admitted: false, retryAfter: Math.ceil((row.lockedUntil - now) / 1000) }
    : admit(db, kind, now);
}

export async function settleAttempt<Proof>(
  db: Database,
  kind: ThrottleKind,
  verify: () => Promise<Proof | null>,
): Promise<Attempt<Proof>> {
  const admission = await admit(db, kind, Date.now());

  if (!admission.admitted) {
    return { kind: "locked", retryAfter: admission.retryAfter };
  }

  const proof = await verify();

  if (proof === null) {
    return { kind: "wrong" };
  }

  await db
    .delete(throttles)
    .where(and(eq(throttles.kind, kind), eq(throttles.failures, admission.number)));

  return { kind: "ok", proof };
}

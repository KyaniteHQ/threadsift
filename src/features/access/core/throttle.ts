import { and, eq, lte, sql } from "drizzle-orm";

import type { ThrottleKind } from "../../../core/kernel/access-tables.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { throttles } from "../../../core/kernel/schema.ts";
import { type LockedOut, type Refused, lockedOut, refused } from "./access-refusal.ts";

const LOCK_AFTER_FAILURES = 10;
const FIRST_LOCK_MS = 60_000;
const LONGEST_LOCK_MS = 3_600_000;
const LAST_DOUBLING = 6;

type WrongAnswer =
  | "wrong-setup-code"
  | "wrong-password"
  | "wrong-current-password"
  | "wrong-reset-code";

export type Attempt<Proof, Wrong extends WrongAnswer> =
  | { readonly kind: "ok"; readonly proof: Proof }
  | Refused<Wrong>
  | LockedOut;

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

export async function settleAttempt<Proof, Wrong extends WrongAnswer>(
  db: Database,
  kind: ThrottleKind,
  verify: () => Promise<Proof | null> | Proof | null,
  wrong: Wrong,
): Promise<Attempt<Proof, Wrong>> {
  const admission = await admit(db, kind, Date.now());

  if (!admission.admitted) {
    return lockedOut(admission.retryAfter);
  }

  const proof = await verify();

  if (proof === null) {
    return refused(wrong);
  }

  await db
    .delete(throttles)
    .where(and(eq(throttles.kind, kind), eq(throttles.failures, admission.number)));

  return { kind: "ok", proof };
}

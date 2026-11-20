import { eq, sql } from "drizzle-orm";

import { digestOf } from "../contract/encoding.ts";
import { hashPassword, passwordLength } from "../contract/passwords.ts";
import { RESET_CODE_MIN, checkConfiguredCode, codeProof } from "../contract/setup-code.ts";
import type { Database } from "../kernel/database.ts";
import { guardHolds, guardedBatch } from "../kernel/guards.ts";
import type { Ports } from "../kernel/ports.ts";
import { owner, spentResetCodes, throttles } from "../kernel/schema.ts";
import { type LockedOut, type Refused, badPassword, refused } from "./access-refusal.ts";
import { passwordHashIs, passwordHashOf, verifyOwnerPassword } from "./owner.ts";
import {
  type StartedSession,
  endAllSessions,
  prepareSession,
  sessionIsLive,
  sessionWrites,
} from "./sessions.ts";
import { settleAttempt } from "./throttle.ts";

type ChangeResult =
  | { readonly kind: "changed"; readonly session: StartedSession }
  | ReturnType<typeof badPassword>
  | Refused<"wrong-current-password" | "password-changed">
  | LockedOut;

type ResetResult =
  | { readonly kind: "reset" }
  | Refused<
      | "no-owner"
      | "reset-missing"
      | "reset-short"
      | "wrong-reset-code"
      | "reset-used"
      | "password-changed"
    >
  | ReturnType<typeof badPassword>
  | LockedOut;

function setHash(db: Database, passwordHash: string) {
  return db.update(owner).set({ passwordHash }).where(eq(owner.id, 1));
}

export async function changePassword(
  ports: Ports,
  sessionId: string,
  current: string,
  next: string,
): Promise<ChangeResult> {
  const length = passwordLength(next);

  if (length !== "ok") {
    return badPassword(length);
  }

  const verified = await verifyOwnerPassword(ports, current, "wrong-current-password");

  if (verified.kind !== "ok") {
    return verified;
  }

  const { db, crypto } = ports;
  const passwordHash = await hashPassword(crypto, next);
  const session = prepareSession(crypto);

  const committed = await guardedBatch(
    db,
    sql`${passwordHashIs(verified.proof)} and ${sessionIsLive(crypto, sessionId)}`,
    [setHash(db, passwordHash), endAllSessions(db), ...sessionWrites(db, session)],
  );

  return committed ? { kind: "changed", session } : refused("password-changed");
}

function codeIsSpent(digest: string) {
  return sql`exists (select 1 from ${spentResetCodes} where ${spentResetCodes.digest} = ${digest})`;
}

async function commitReset(
  ports: Ports,
  observed: string,
  code: string,
  password: string,
): Promise<ResetResult> {
  const { db, crypto } = ports;
  const digest = digestOf(crypto, code);
  const passwordHash = await hashPassword(crypto, password);

  const committed = await guardedBatch(
    db,
    sql`${passwordHashIs(observed)} and not ${codeIsSpent(digest)}`,
    [
      db.insert(spentResetCodes).values({ digest, spentAt: Date.now() }),
      setHash(db, passwordHash),
      endAllSessions(db),
      db.delete(throttles).where(eq(throttles.kind, "login")),
    ],
  );

  if (committed) {
    return { kind: "reset" };
  }

  return refused((await guardHolds(db, codeIsSpent(digest))) ? "reset-used" : "password-changed");
}

export async function resetPassword(
  ports: Ports,
  code: string,
  password: string,
): Promise<ResetResult> {
  const { db, crypto } = ports;

  const observed = await passwordHashOf(db);

  if (observed === undefined) {
    return refused("no-owner");
  }

  const configured = checkConfiguredCode(ports.config.resetCode, RESET_CODE_MIN);

  if (configured.status !== "set") {
    return refused(`reset-${configured.status}`);
  }

  const length = passwordLength(password);

  if (length !== "ok") {
    return badPassword(length);
  }

  const attempt = await settleAttempt(
    db,
    "reset",
    () => codeProof(crypto, code, configured.code),
    "wrong-reset-code",
  );

  if (attempt.kind !== "ok") {
    return attempt;
  }

  return commitReset(ports, observed, configured.code, password);
}

import { eq, sql } from "drizzle-orm";

import { digestOf } from "./encoding.ts";
import { hasOwner, passwordHashIs, verifyOwnerPassword } from "./owner.ts";
import { type PasswordProblem, hashPassword, passwordLength } from "./passwords.ts";
import type { Database, Ports } from "./ports.ts";
import { guardedBatch, owner, spentResetCodes, throttles } from "./schema.ts";
import {
  type StartedSession,
  endAllSessions,
  prepareSession,
  sessionIsLive,
  sessionWrites,
} from "./sessions.ts";
import { RESET_CODE_MIN, type SetupCodeProblem, checkConfiguredCode } from "./setup-code.ts";
import { settleAttempt } from "./throttle.ts";

export type ChangeResult =
  | { readonly kind: "changed"; readonly session: StartedSession }
  | { readonly kind: "password"; readonly length: PasswordProblem }
  | { readonly kind: "locked"; readonly retryAfter: number }
  | { readonly kind: "wrong" }
  | { readonly kind: "superseded" };

export type ResetResult =
  | { readonly kind: "reset" }
  | { readonly kind: "no-owner" }
  | { readonly kind: "unavailable"; readonly reason: SetupCodeProblem }
  | { readonly kind: "password"; readonly length: PasswordProblem }
  | { readonly kind: "locked"; readonly retryAfter: number }
  | { readonly kind: "wrong" }
  | { readonly kind: "used" };

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
    return { kind: "password", length };
  }

  const verified = await verifyOwnerPassword(ports, current);

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

  return committed ? { kind: "changed", session } : { kind: "superseded" };
}

function codeIsSpent(digest: string) {
  return sql`exists (select 1 from ${spentResetCodes} where ${spentResetCodes.digest} = ${digest})`;
}

export async function resetPassword(
  ports: Ports,
  code: string,
  password: string,
): Promise<ResetResult> {
  const { db, crypto } = ports;

  if (!(await hasOwner(db))) {
    return { kind: "no-owner" };
  }

  const configured = checkConfiguredCode(ports.resetCode, RESET_CODE_MIN);

  if (configured.status !== "set") {
    return { kind: "unavailable", reason: configured.status };
  }

  const length = passwordLength(password);

  if (length !== "ok") {
    return { kind: "password", length };
  }

  const attempt = await settleAttempt(db, "reset", () =>
    Promise.resolve(
      crypto.equal(crypto.sha256(code), crypto.sha256(configured.code)) ? true : null,
    ),
  );

  if (attempt.kind !== "ok") {
    return attempt;
  }

  const digest = digestOf(crypto, configured.code);

  const passwordHash = await hashPassword(crypto, password);

  const committed = await guardedBatch(db, sql`not ${codeIsSpent(digest)}`, [
    db.insert(spentResetCodes).values({ digest, spentAt: Date.now() }),
    setHash(db, passwordHash),
    endAllSessions(db),
    db.delete(throttles).where(eq(throttles.kind, "login")),
  ]);

  return committed ? { kind: "reset" } : { kind: "used" };
}

import { sql } from "drizzle-orm";

import { guardedBatch } from "./guards.ts";
import {
  type PasswordProblem,
  hashPassword,
  passwordLength,
  passwordMatches,
} from "./passwords.ts";
import type { Database, Ports } from "./ports.ts";
import { owner } from "./schema.ts";
import { type StartedSession, prepareSession, sessionWrites } from "./sessions.ts";
import {
  SETUP_CODE_MIN,
  type SetupCodeProblem,
  checkConfiguredCode,
  codeProof,
} from "./setup-code.ts";
import { type Attempt, settleAttempt } from "./throttle.ts";

export type SetupBlock =
  | { readonly kind: "owner-exists" }
  | { readonly kind: "unavailable"; readonly reason: SetupCodeProblem }
  | { readonly kind: "locked"; readonly retryAfter: number }
  | { readonly kind: "wrong" };

export type SetupResult =
  | SetupBlock
  | { readonly kind: "password"; readonly length: PasswordProblem }
  | { readonly kind: "created"; readonly session: StartedSession }
  | { readonly kind: "superseded" };

export type LoginResult =
  | { readonly kind: "signed-in"; readonly session: StartedSession }
  | { readonly kind: "locked"; readonly retryAfter: number }
  | { readonly kind: "wrong" }
  | { readonly kind: "superseded" };

export async function passwordHashOf(db: Database): Promise<string | undefined> {
  const [row] = await db.select({ hash: owner.passwordHash }).from(owner).limit(1);

  return row?.hash;
}

export function passwordHashIs(hash: string) {
  return sql`exists (select 1 from ${owner} where ${owner.id} = 1 and ${owner.passwordHash} = ${hash})`;
}

export async function hasOwner(db: Database): Promise<boolean> {
  return (await passwordHashOf(db)) !== undefined;
}

export async function checkSetupCode(ports: Ports, code: string): Promise<SetupBlock | null> {
  if (await hasOwner(ports.db)) {
    return { kind: "owner-exists" };
  }

  const configured = checkConfiguredCode(ports.setupCode, SETUP_CODE_MIN);

  if (configured.status !== "set") {
    return { kind: "unavailable", reason: configured.status };
  }

  const outcome = await settleAttempt(ports.db, "setup", () =>
    codeProof(ports.crypto, code, configured.code),
  );

  return outcome.kind === "ok" ? null : outcome;
}

export async function setUpOwner(
  ports: Ports,
  code: string,
  password: string,
): Promise<SetupResult> {
  const block = await checkSetupCode(ports, code);

  if (block !== null) {
    return block;
  }

  const length = passwordLength(password);

  if (length !== "ok") {
    return { kind: "password", length };
  }

  const passwordHash = await hashPassword(ports.crypto, password);

  const created = await ports.db
    .insert(owner)
    .values({ id: 1, passwordHash, createdAt: Date.now() })
    .onConflictDoNothing()
    .returning({ id: owner.id });

  if (created.length === 0) {
    return { kind: "owner-exists" };
  }

  const session = prepareSession(ports.crypto);

  const committed = await guardedBatch(
    ports.db,
    passwordHashIs(passwordHash),
    sessionWrites(ports.db, session),
  );

  return committed ? { kind: "created", session } : { kind: "superseded" };
}

export function verifyOwnerPassword(ports: Ports, password: string): Promise<Attempt<string>> {
  return settleAttempt(ports.db, "login", async () => {
    const stored = await passwordHashOf(ports.db);

    return stored !== undefined && (await passwordMatches(ports.crypto, password, stored))
      ? stored
      : null;
  });
}

export async function login(ports: Ports, password: string): Promise<LoginResult> {
  const verified = await verifyOwnerPassword(ports, password);

  if (verified.kind !== "ok") {
    return verified;
  }

  const session = prepareSession(ports.crypto);

  const committed = await guardedBatch(
    ports.db,
    passwordHashIs(verified.proof),
    sessionWrites(ports.db, session),
  );

  return committed ? { kind: "signed-in", session } : { kind: "superseded" };
}

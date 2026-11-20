import { sql } from "drizzle-orm";

import type { SetupCodeStatus } from "../contract/access-contract.ts";
import { hashPassword, passwordLength, passwordMatches } from "../contract/passwords.ts";
import { SETUP_CODE_MIN, checkConfiguredCode, codeProof } from "../contract/setup-code.ts";
import type { Database } from "../kernel/database.ts";
import { guardedBatch } from "../kernel/guards.ts";
import type { Ports } from "../kernel/ports.ts";
import { owner } from "../kernel/schema.ts";
import { type LockedOut, type Refused, badPassword, refused } from "./access-refusal.ts";
import { type StartedSession, prepareSession, sessionWrites } from "./sessions.ts";
import { type Attempt, settleAttempt } from "./throttle.ts";

type SetupRefusal =
  | Refused<"owner-exists" | "setup-missing" | "setup-short" | "wrong-setup-code">
  | LockedOut;

type SetupResult =
  | { readonly kind: "created"; readonly session: StartedSession }
  | SetupRefusal
  | ReturnType<typeof badPassword>
  | Refused<"password-changed">;

type LoginResult =
  | { readonly kind: "signed-in"; readonly session: StartedSession }
  | Refused<"wrong-password" | "password-changed">
  | LockedOut;

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

export async function anonymousState(
  ports: Ports,
): Promise<
  { readonly state: "signed-out" } | { readonly state: "setup"; readonly code: SetupCodeStatus }
> {
  return (await hasOwner(ports.db))
    ? { state: "signed-out" }
    : { state: "setup", code: checkConfiguredCode(ports.config.setupCode, SETUP_CODE_MIN).status };
}

export async function checkSetupCode(ports: Ports, code: string): Promise<SetupRefusal | null> {
  if (await hasOwner(ports.db)) {
    return refused("owner-exists");
  }

  const configured = checkConfiguredCode(ports.config.setupCode, SETUP_CODE_MIN);

  if (configured.status !== "set") {
    return refused(`setup-${configured.status}`);
  }

  const outcome = await settleAttempt(
    ports.db,
    "setup",
    () => codeProof(ports.crypto, code, configured.code),
    "wrong-setup-code",
  );

  return outcome.kind === "ok" ? null : outcome;
}

async function startedWhile(ports: Ports, passwordHash: string): Promise<StartedSession | null> {
  const session = prepareSession(ports.crypto);

  const committed = await guardedBatch(
    ports.db,
    passwordHashIs(passwordHash),
    sessionWrites(ports.db, session),
  );

  return committed ? session : null;
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
    return badPassword(length);
  }

  const passwordHash = await hashPassword(ports.crypto, password);

  const created = await ports.db
    .insert(owner)
    .values({ id: 1, passwordHash, createdAt: Date.now() })
    .onConflictDoNothing()
    .returning({ id: owner.id });

  if (created.length === 0) {
    return refused("owner-exists");
  }

  const session = await startedWhile(ports, passwordHash);

  return session === null ? refused("password-changed") : { kind: "created", session };
}

export function verifyOwnerPassword<Wrong extends "wrong-password" | "wrong-current-password">(
  ports: Ports,
  password: string,
  wrong: Wrong,
): Promise<Attempt<string, Wrong>> {
  return settleAttempt(
    ports.db,
    "login",
    async () => {
      const stored = await passwordHashOf(ports.db);

      return stored !== undefined && (await passwordMatches(ports.crypto, password, stored))
        ? stored
        : null;
    },
    wrong,
  );
}

export async function login(ports: Ports, password: string): Promise<LoginResult> {
  const verified = await verifyOwnerPassword(ports, password, "wrong-password");

  if (verified.kind !== "ok") {
    return verified;
  }

  const session = await startedWhile(ports, verified.proof);

  return session === null ? refused("password-changed") : { kind: "signed-in", session };
}

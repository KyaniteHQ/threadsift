import { type PasswordLength, hashPassword, passwordLength, passwordMatches } from "./passwords.ts";
import type { Database, Ports } from "./ports.ts";
import { owner } from "./schema.ts";
import { type StartedSession, startSession } from "./sessions.ts";
import { gateOf, recordFailure, recordSuccess } from "./throttle.ts";

export const SETUP_CODE_MIN = 16;

export type SetupBlock =
  | { readonly kind: "owner-exists" }
  | { readonly kind: "unavailable"; readonly reason: "missing" | "short" }
  | { readonly kind: "locked"; readonly retryAfter: number }
  | { readonly kind: "wrong" };

export type SetupResult =
  | SetupBlock
  | { readonly kind: "password"; readonly length: Exclude<PasswordLength, "ok"> }
  | { readonly kind: "created"; readonly session: StartedSession };

export type LoginResult =
  | { readonly kind: "signed-in"; readonly session: StartedSession }
  | { readonly kind: "locked"; readonly retryAfter: number }
  | { readonly kind: "wrong" };

export async function hasOwner(db: Database): Promise<boolean> {
  const rows = await db.select({ id: owner.id }).from(owner).limit(1);

  return rows.length > 0;
}

async function passwordHashOf(db: Database): Promise<string | undefined> {
  const [row] = await db.select({ hash: owner.passwordHash }).from(owner).limit(1);

  return row?.hash;
}

export async function checkSetupCode(ports: Ports, code: string): Promise<SetupBlock | null> {
  if (await hasOwner(ports.db)) {
    return { kind: "owner-exists" };
  }

  const configured = ports.setupCode ?? "";

  if (configured === "") {
    return { kind: "unavailable", reason: "missing" };
  }

  if (configured.length < SETUP_CODE_MIN) {
    return { kind: "unavailable", reason: "short" };
  }

  const gate = await gateOf(ports.db, "setup", Date.now());

  if (gate.locked) {
    return { kind: "locked", retryAfter: gate.retryAfter };
  }

  const { crypto } = ports;

  if (!crypto.equal(crypto.sha256(code), crypto.sha256(configured))) {
    await recordFailure(ports.db, "setup", Date.now());

    return { kind: "wrong" };
  }

  await recordSuccess(ports.db, "setup");

  return null;
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

  return { kind: "created", session: await startSession(ports) };
}

export async function login(ports: Ports, password: string): Promise<LoginResult> {
  const gate = await gateOf(ports.db, "login", Date.now());

  if (gate.locked) {
    return { kind: "locked", retryAfter: gate.retryAfter };
  }

  const stored = await passwordHashOf(ports.db);

  if (stored === undefined || !(await passwordMatches(ports.crypto, password, stored))) {
    await recordFailure(ports.db, "login", Date.now());

    return { kind: "wrong" };
  }

  await recordSuccess(ports.db, "login");

  return { kind: "signed-in", session: await startSession(ports) };
}

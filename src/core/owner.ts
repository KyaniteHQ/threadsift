import {
  type PasswordProblem,
  hashPassword,
  passwordLength,
  passwordMatches,
} from "./passwords.ts";
import type { Database, Ports } from "./ports.ts";
import { owner } from "./schema.ts";
import { type StartedSession, startSession } from "./sessions.ts";
import { type SetupCodeProblem, checkConfiguredCode } from "./setup-code.ts";
import { gateOf, settleAttempt } from "./throttle.ts";

export type SetupBlock =
  | { readonly kind: "owner-exists" }
  | { readonly kind: "unavailable"; readonly reason: SetupCodeProblem }
  | { readonly kind: "locked"; readonly retryAfter: number }
  | { readonly kind: "wrong" };

export type SetupResult =
  | SetupBlock
  | { readonly kind: "password"; readonly length: PasswordProblem }
  | { readonly kind: "created"; readonly session: StartedSession };

export type LoginResult =
  | { readonly kind: "signed-in"; readonly session: StartedSession }
  | { readonly kind: "locked"; readonly retryAfter: number }
  | { readonly kind: "wrong" };

async function passwordHashOf(db: Database): Promise<string | undefined> {
  const [row] = await db.select({ hash: owner.passwordHash }).from(owner).limit(1);

  return row?.hash;
}

export async function hasOwner(db: Database): Promise<boolean> {
  return (await passwordHashOf(db)) !== undefined;
}

export async function checkSetupCode(ports: Ports, code: string): Promise<SetupBlock | null> {
  if (await hasOwner(ports.db)) {
    return { kind: "owner-exists" };
  }

  const configured = checkConfiguredCode(ports.setupCode);

  if (configured.status !== "set") {
    return { kind: "unavailable", reason: configured.status };
  }

  const { crypto } = ports;
  const gate = await gateOf(ports.db, "setup", Date.now());

  const outcome = await settleAttempt(ports.db, "setup", gate, () =>
    Promise.resolve(crypto.equal(crypto.sha256(code), crypto.sha256(configured.code))),
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

  return { kind: "created", session: await startSession(ports) };
}

export async function login(ports: Ports, password: string): Promise<LoginResult> {
  const [gate, stored] = await Promise.all([
    gateOf(ports.db, "login", Date.now()),
    passwordHashOf(ports.db),
  ]);

  const outcome = await settleAttempt(
    ports.db,
    "login",
    gate,
    async () => stored !== undefined && (await passwordMatches(ports.crypto, password, stored)),
  );

  return outcome.kind === "ok"
    ? { kind: "signed-in", session: await startSession(ports) }
    : outcome;
}

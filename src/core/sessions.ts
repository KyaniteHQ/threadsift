import { eq, lt, sql } from "drizzle-orm";

import { digestOf, randomSecret } from "./encoding.ts";
import type { Crypto, Database, Ports } from "./ports.ts";
import { sessions } from "./schema.ts";

const SESSION_BYTES = 32;
export const DAY_MS = 86_400_000;
export const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * DAY_MS;
export const SESSION_MAX_AGE_SECONDS = SESSION_MS / 1000;

export interface StartedSession {
  readonly id: string;
  readonly maxAge: number;
}

export interface PreparedSession extends StartedSession {
  readonly digest: string;
  readonly expiresAt: number;
}

export type SessionCheck =
  | { readonly valid: false }
  | { readonly valid: true; readonly renewed: boolean };

export function prepareSession(crypto: Crypto): PreparedSession {
  const id = randomSecret(crypto, SESSION_BYTES);

  return {
    id,
    maxAge: SESSION_MAX_AGE_SECONDS,
    digest: digestOf(crypto, id),
    expiresAt: Date.now() + SESSION_MS,
  };
}

export function sessionWrites(db: Database, session: Readonly<PreparedSession>) {
  return [
    db.delete(sessions).where(lt(sessions.expiresAt, Date.now())),
    db.insert(sessions).values({ digest: session.digest, expiresAt: session.expiresAt }),
  ] as const;
}

export function sessionIsLive(crypto: Crypto, id: string) {
  return sql`exists (select 1 from ${sessions} where ${sessions.digest} = ${digestOf(crypto, id)} and ${sessions.expiresAt} > ${Date.now()})`;
}

export function endAllSessions(db: Database) {
  return db.delete(sessions);
}

export async function startSession(ports: Ports): Promise<StartedSession> {
  const session = prepareSession(ports.crypto);

  await ports.db.batch(sessionWrites(ports.db, session));

  return { id: session.id, maxAge: session.maxAge };
}

export async function checkSession(ports: Ports, id: string): Promise<SessionCheck> {
  const now = Date.now();
  const digest = digestOf(ports.crypto, id);
  const [row] = await ports.db.select().from(sessions).where(eq(sessions.digest, digest));

  if (row === undefined) {
    return { valid: false };
  }

  if (row.expiresAt <= now) {
    await ports.db.delete(sessions).where(eq(sessions.digest, digest));

    return { valid: false };
  }

  if (row.expiresAt - now >= SESSION_MS - DAY_MS) {
    return { valid: true, renewed: false };
  }

  await ports.db
    .update(sessions)
    .set({ expiresAt: now + SESSION_MS })
    .where(eq(sessions.digest, digest));

  return { valid: true, renewed: true };
}

export async function endSession(ports: Ports, id: string): Promise<void> {
  await ports.db.delete(sessions).where(eq(sessions.digest, digestOf(ports.crypto, id)));
}

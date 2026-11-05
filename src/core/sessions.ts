import { eq, lt } from "drizzle-orm";

import { base64url, hex } from "./encoding.ts";
import type { Ports } from "./ports.ts";
import { sessions } from "./schema.ts";

const SESSION_BYTES = 32;
const DAY_MS = 86_400_000;
export const SESSION_DAYS = 30;
export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 86_400;

export interface StartedSession {
  readonly id: string;
  readonly maxAge: number;
}

export type SessionCheck =
  | { readonly valid: false }
  | { readonly valid: true; readonly renewed: boolean };

export async function startSession(ports: Ports): Promise<StartedSession> {
  const now = Date.now();
  const id = base64url(ports.crypto.randomBytes(SESSION_BYTES));

  await ports.db.delete(sessions).where(lt(sessions.expiresAt, now));
  await ports.db
    .insert(sessions)
    .values({ digest: hex(ports.crypto.sha256(id)), expiresAt: now + SESSION_DAYS * DAY_MS });

  return { id, maxAge: SESSION_MAX_AGE_SECONDS };
}

export async function checkSession(ports: Ports, id: string): Promise<SessionCheck> {
  const now = Date.now();
  const digest = hex(ports.crypto.sha256(id));
  const [row] = await ports.db.select().from(sessions).where(eq(sessions.digest, digest));

  if (row === undefined) {
    return { valid: false };
  }

  if (row.expiresAt <= now) {
    await ports.db.delete(sessions).where(eq(sessions.digest, digest));

    return { valid: false };
  }

  if (row.expiresAt - now >= (SESSION_DAYS - 1) * DAY_MS) {
    return { valid: true, renewed: false };
  }

  await ports.db
    .update(sessions)
    .set({ expiresAt: now + SESSION_DAYS * DAY_MS })
    .where(eq(sessions.digest, digest));

  return { valid: true, renewed: true };
}

export async function endSession(ports: Ports, id: string): Promise<void> {
  await ports.db.delete(sessions).where(eq(sessions.digest, hex(ports.crypto.sha256(id))));
}

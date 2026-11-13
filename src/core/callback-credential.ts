import { and, eq } from "drizzle-orm";

import { type BotTaskRow } from "./bot-task-states.ts";
import { digestOf, randomSecret } from "./encoding.ts";
import type { Crypto, Database } from "./ports.ts";
import { aiTasks } from "./schema.ts";

const CALLBACK_PREFIX = "tst_";

const CALLBACK_BYTES = 32;

export const BEARER_CALLBACK = /^Bearer (tst_[A-Za-z0-9_-]+)$/u;

interface CallbackCredential {
  readonly value: string;
  readonly hash: string;
}

export function newCallbackCredential(crypto: Crypto): CallbackCredential {
  const value = `${CALLBACK_PREFIX}${randomSecret(crypto, CALLBACK_BYTES)}`;

  return { value, hash: digestOf(crypto, value) };
}

export async function callbackTaskOf(
  { db, crypto }: Readonly<{ db: Database; crypto: Crypto }>,
  { id, value }: Readonly<{ id: number; value: string }>,
): Promise<BotTaskRow | null> {
  const [task] = await db
    .select()
    .from(aiTasks)
    .where(and(eq(aiTasks.id, id), eq(aiTasks.callbackHash, digestOf(crypto, value))));

  return task ?? null;
}

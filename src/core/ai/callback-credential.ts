import { and, eq } from "drizzle-orm";

import { bearerOf } from "../access/bearer.ts";
import type { Crypto } from "../contract/crypto.ts";
import { digestOf, randomSecret } from "../contract/encoding.ts";
import type { AiTaskRow } from "../kernel/ai-task-state.ts";
import type { Database } from "../kernel/database.ts";
import { aiTasks } from "../kernel/schema.ts";

const CALLBACK_PREFIX = "tst_";

const CALLBACK_BYTES = 32;

const CREDENTIAL = /^tst_[A-Za-z0-9_-]+$/u;

const TASK_ID = /^[1-9][0-9]{0,15}$/u;

interface CallbackCredential {
  readonly value: string;
  readonly hash: string;
}

interface Presented {
  readonly id: string | undefined;
  readonly authorization: string | undefined;
}

export function newCallbackCredential(crypto: Crypto): CallbackCredential {
  const value = `${CALLBACK_PREFIX}${randomSecret(crypto, CALLBACK_BYTES)}`;

  return { value, hash: digestOf(crypto, value) };
}

export async function callbackTaskOf(
  { db, crypto }: Readonly<{ db: Database; crypto: Crypto }>,
  { id, authorization }: Readonly<Presented>,
): Promise<AiTaskRow | null> {
  const bearer = authorization === undefined ? null : bearerOf(authorization, "callback");

  if (bearer?.kind !== "token" || !CREDENTIAL.test(bearer.value)) return null;

  if (id === undefined || !TASK_ID.test(id)) return null;

  const [task] = await db
    .select()
    .from(aiTasks)
    .where(
      and(eq(aiTasks.id, Number(id)), eq(aiTasks.callbackHash, digestOf(crypto, bearer.value))),
    );

  return task ?? null;
}

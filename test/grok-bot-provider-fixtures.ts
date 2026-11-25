import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";

import { z } from "zod";

import { HOUR_MS, MINUTE_MS } from "../src/core/contract/time-units.ts";
import { awaitVerifiedDigest } from "../src/features/bot/core/bot-verify-wait.ts";
import { DIGEST_ANSWER } from "./bot-kinds-cases.ts";
import { acceptedByBot, botInstance, selectGrokBot } from "./bot-task-fixtures.ts";
import type { Instance } from "./instance.ts";

export function assertDueBeyondHalfHour(what: string, due: number): void {
  assert.ok(due > Date.now() + 30 * MINUTE_MS, `${what} is due at ${String(due)}`);
}

export const VERIFY_PATH = "/api/settings/ai/verify";

export const VERIFY_ANSWER = { ...DIGEST_ANSWER, keptComments: [] };

export async function botProviderInstance(): Promise<Instance> {
  const instance = await botInstance();

  await selectGrokBot(instance);

  return instance;
}

const StoredSettings = z.object({
  provider: z.string(),
  base_url: z.string().nullable(),
  model: z.string(),
  sealed_key: z.string().nullable(),
});

export const storedSettings = (instance: Instance) =>
  instance.database.rows(
    StoredSettings,
    "select provider, base_url, model, sealed_key from settings",
  );

const Revision = z.object({ revision: z.number() });

export function revisionOf(instance: Instance): number {
  const [row] = instance.database.rows(Revision, "select revision from ai_settings_revision");

  assert.ok(row !== undefined);

  return row.revision;
}

export function generationOf(instance: Instance, itemId: number): number {
  return instance.database.count("select generation as n from items where id = ?", itemId);
}

const VerifyTask = z.object({ id: z.number() });

export async function sentVerifyTask(instance: Instance) {
  await selectGrokBot(instance);

  const previous = instance.database.count("select coalesce(max(id), 0) as n from ai_tasks");
  const verified = await instance.send("POST", VERIFY_PATH);

  assert.equal(verified.status, 200, verified.body);

  const [started, ...others] = instance.database.rows(
    VerifyTask,
    "select id from ai_tasks where id > ? and kind = 'digest' and executor = 'grok-bot' and job_id is null",
    previous,
  );

  assert.ok(
    started !== undefined && others.length === 0,
    "Verify must start exactly one Grok Bot Digest task",
  );

  return acceptedByBot(instance, started.id);
}

export async function verifyingTask(
  t: TestContext,
  instance: Instance,
  { id }: Readonly<{ id: number }>,
) {
  const caller = new AbortController();
  const result = awaitVerifiedDigest(instance.core.db, { taskId: id, signal: caller.signal });

  t.after(async () => {
    caller.abort();
    await result;
  });
  await setImmediate();

  return { result, caller };
}

export function occupyBot(instance: Instance, places: number): void {
  instance.database.exec(
    "update ai_tasks set state = 'failed', refusal = 'timeout' where state = 'running'",
  );

  for (const slot of Array.from({ length: places }, (_, index) => index)) {
    instance.database.exec(
      "insert into ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state, callback_hash, sent_at) values ('digest', '{}', 0, 'grok-bot', 1, ?, 'running', ?, 1)",
      Date.now() + HOUR_MS,
      `occupied-${String(slot)}`,
    );
  }
}

const Flag = z.object({ use_as_provider: z.number() });

export function usedAsProvider(instance: Instance): boolean {
  const [row] = instance.database.rows(Flag, "select use_as_provider from grok_bot_settings");

  return row?.use_as_provider === 1;
}

export function unreadableBotKey(instance: Instance): void {
  instance.database.exec(
    "insert into grok_bot_settings (id, webhook_url, sealed_key, updated_at) values (1, 'https://example.com/hook', 'not-sealed-by-this-instance', 1) on conflict (id) do update set sealed_key = excluded.sealed_key",
  );
}

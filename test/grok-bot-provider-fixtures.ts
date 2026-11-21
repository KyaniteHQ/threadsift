import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/sqlite-proxy";
import { z } from "zod";

import { awaitVerifiedDigest } from "../src/features/bot/core/bot-verify-wait.ts";
import { proxyTo } from "../src/targets/node/database.ts";
import { acceptedByBot, botInstance, selectGrokBot } from "./bot-task-fixtures.ts";
import type { Instance } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";
import { sentIntake } from "./x-intake-fixtures.ts";

export const VERIFY_PATH = "/api/settings/ai/verify";

export { AI_PATH, GROK_BOT_IN_FLIGHT, chooseGrokBot, selectGrokBot } from "./bot-task-fixtures.ts";

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
  rows(instance, StoredSettings, "select provider, base_url, model, sealed_key from settings");

const Revision = z.object({ revision: z.number() });

export function revisionOf(instance: Instance): number {
  const [row] = rows(instance, Revision, "select revision from ai_settings_revision");

  assert.ok(row !== undefined);

  return row.revision;
}

export function generationOf(instance: Instance, itemId: number): number {
  const [item] = rows(
    instance,
    z.object({ generation: z.number() }),
    "select generation from items where id = ?",
    itemId,
  );

  return item?.generation ?? 0;
}

const VerifyTask = z.object({ id: z.number() });

export async function sentVerifyTask(instance: Instance) {
  await selectGrokBot(instance);

  const verified = await instance.send("POST", VERIFY_PATH);

  assert.equal(verified.status, 200, verified.body);

  const [started] = rows(
    instance,
    VerifyTask,
    `select id from ai_tasks where kind = 'digest' and context = '{"verify":true}' order by id desc limit 1`,
  );

  assert.ok(started !== undefined, "Verify started no task");

  return acceptedByBot(instance, started.id);
}

export async function verifyingTask(
  instance: Instance,
  { id }: Readonly<{ id: number }>,
  signal: AbortSignal = new AbortController().signal,
) {
  const firstQuery = Promise.withResolvers<void>();
  const sqlite = new DatabaseSync(instance.databaseFile);
  const db = drizzle(proxyTo(sqlite), {
    logger: {
      logQuery: () => {
        firstQuery.resolve();
      },
    },
  });
  const result = awaitVerifiedDigest(db, { taskId: id, signal }).finally(() => {
    sqlite.close();
  });

  assert.equal(
    await Promise.race([firstQuery.promise, result]),
    undefined,
    "Verify finished before its first query",
  );

  return { result };
}

export function occupyBot(instance: Instance, places: number): void {
  exec(
    instance,
    "update ai_tasks set state = 'failed', refusal = 'timeout' where state = 'running'",
  );

  for (const slot of Array.from({ length: places }, (_, index) => index)) {
    exec(
      instance,
      "insert into ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state, callback_hash, sent_at) values ('digest', '{}', 0, 'grok-bot', 1, ?, 'running', ?, 1)",
      Date.now() + 3_600_000,
      `occupied-${String(slot)}`,
    );
  }
}

const Flag = z.object({ use_as_provider: z.number() });

export function usedAsProvider(instance: Instance): boolean {
  const [row] = rows(instance, Flag, "select use_as_provider from grok_bot_settings");

  return row?.use_as_provider === 1;
}

export function unreadableBotKey(instance: Instance): void {
  exec(
    instance,
    "insert into grok_bot_settings (id, webhook_url, sealed_key, updated_at) values (1, 'https://example.com/hook', 'not-sealed-by-this-instance', 1) on conflict (id) do update set sealed_key = excluded.sealed_key",
  );
}

const HOUR_MS = 3_600_000;

export async function waitingIntake(instance: Instance) {
  const intake = await sentIntake(instance);

  exec(
    instance,
    "update jobs set state = 'queued', wait_reason = 'grok-bot', claim_expires = null, next_attempt_at = ? where id = ?",
    Date.now() + HOUR_MS,
    intake.job.id,
  );

  return intake;
}

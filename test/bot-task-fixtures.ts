import assert from "node:assert/strict";

import { z } from "zod";

import { claimNextDue } from "../src/core/compose/jobs.ts";
import type { JobKind } from "../src/core/contract/job-contract.ts";
import { bestEffort } from "../src/core/kernel/failure-log.ts";
import type { ClaimedJob } from "../src/core/kernel/job-outcome.ts";
import { type JobRow, jobs } from "../src/core/kernel/schema.ts";
import { newCallbackCredential } from "../src/features/ai/core/callback-credential.ts";
import { KEY, PATH } from "./grok-bot-fixtures.ts";
import { type Answer, Instance, type Json, SECRET_KEY } from "./instance.ts";
import { paste, inOrder } from "./library-fixtures.ts";
import { pairsOf } from "./related-fixtures.ts";

export const GROK_BOT_IN_FLIGHT = 10;

const UNREACHABLE_ADDRESS = "https://no-such-host.invalid/automations/webhook/none";

export interface BotLibrary {
  readonly source: number;
  readonly candidates: readonly [number, number];
}

export async function saveBot(instance: Instance): Promise<void> {
  const saved = await instance.send("PUT", PATH, { webhookUrl: UNREACHABLE_ADDRESS, key: KEY });

  if (saved.status !== 200) throw new Error("the Grok Bot address was not saved");
}

export const AI_PATH = "/api/settings/ai";

export function chooseGrokBot(instance: Instance): Promise<Answer> {
  return instance.send("PUT", AI_PATH, { provider: "grok-bot" });
}

export async function selectGrokBot(instance: Instance): Promise<void> {
  const chosen = await chooseGrokBot(instance);

  assert.equal(chosen.status, 200, chosen.body);
}

export async function relatedLibrary(instance: Instance): Promise<BotLibrary> {
  const first = await paste(instance, "near-one", { title: "Quasar lattice", tags: ["quasar"] });
  const second = await paste(instance, "near-two", { title: "Quasar notes", tags: ["quasar"] });

  const source = await paste(instance, "source", {
    title: "Quasar lattice decoder",
    tags: ["quasar"],
  });

  await claimedNew(instance, { kind: "digest", itemId: source });

  return { source, candidates: [first, second] };
}

export const pickedFor = (instance: Instance, library: Readonly<BotLibrary>): readonly number[] =>
  pairsOf(instance, library.source).map(({ related_id: id }) => id);

export function unblock(instance: Instance, itemId: number): void {
  instance.database.exec(
    "update jobs set state = 'done', claim_expires = null where kind = 'digest' and item_id = ? and state = 'running'",
    itemId,
  );
}

export async function claimedBotJob(instance: Instance, id: number): Promise<ClaimedJob> {
  const claimed = await claimNextDue(instance.core.db);

  assert.ok(
    claimed !== null && claimed.kind !== "export" && claimed.kind !== "restore",
    `the claim found ${claimed === null ? "no job" : claimed.kind}, not job ${String(id)}`,
  );
  assert.equal(claimed.id, id);

  return claimed;
}

export function reclaimedJob(
  instance: Instance,
  job: Readonly<Pick<JobRow, "id">>,
): Promise<ClaimedJob> {
  instance.database.exec(
    "update jobs set next_attempt_at = 0, claim_expires = null where id = ?",
    job.id,
  );

  return claimedBotJob(instance, job.id);
}

export function acceptedByBot(instance: Instance, taskId: number) {
  const credential = newCallbackCredential(instance.core.crypto);

  instance.database.exec(
    "update ai_tasks set state = 'running', refusal = null, status = null, sent_at = ?, callback_hash = ? where id = ?",
    Date.now(),
    credential.hash,
    taskId,
  );

  return { id: taskId, token: credential.value };
}

interface QueuedJob {
  readonly kind: JobKind;
  readonly itemId: number;
  readonly address?: string;
  readonly attempts?: number;
  readonly staleRequeues?: number;
  readonly attemptGeneration?: number | null;
}

function topicOf(instance: Instance, itemId: number): number | null {
  const [row] = instance.database.rows(
    z.object({ topic_id: z.number().nullable() }),
    "select topic_id from items where id = ?",
    itemId,
  );

  return row?.topic_id ?? null;
}

async function queuedJob(
  instance: Instance,
  {
    kind,
    itemId,
    address = "https://example.com/x",
    attempts = 0,
    staleRequeues = 0,
    attemptGeneration = null,
  }: Readonly<QueuedJob>,
): Promise<number> {
  const [inserted] = await instance.core.db
    .insert(jobs)
    .values({
      kind,
      itemId,
      address,
      state: "queued",
      attempts,
      staleRequeues,
      attemptGeneration,
      nextAttemptAt: 0,
      topicId: kind === "topic_overview" ? topicOf(instance, itemId) : null,
    })
    .returning({ id: jobs.id });

  if (inserted === undefined) throw new Error("the job was not stored");

  return inserted.id;
}

export async function bulkJobs(
  instance: Instance,
  jobCount: number,
  kind: JobKind = "related_pick",
): Promise<readonly ClaimedJob[]> {
  const first =
    (instance.database.rows(
      z.object({ id: z.number().nullable() }),
      "select max(id) as id from items",
    )[0]?.id ?? 0) + 1;

  const claims: ClaimedJob[] = [];

  await inOrder(
    Array.from({ length: jobCount }, (_, offset) => first + offset),
    async (id) => {
      instance.database.exec(
        "insert into items (id, source, kind, normalized_url, original_url, saved_at) values (?, 'article', 'article', ?, ?, 1)",
        id,
        `https://example.com/bulk/${String(id)}`,
        `https://example.com/bulk/${String(id)}`,
      );

      claims.push(await claimedNew(instance, { kind, itemId: id }));
    },
  );

  return claims;
}

export async function claimedNew(
  instance: Instance,
  options: Readonly<QueuedJob>,
): Promise<ClaimedJob> {
  return claimedBotJob(instance, await queuedJob(instance, options));
}

export function openJobOfKind(
  instance: Instance,
  options: Readonly<QueuedJob>,
): Promise<ClaimedJob> {
  const { kind, itemId } = options;

  instance.database.exec(
    "update jobs set state = 'done', claim_expires = null where kind = ? and item_id = ?",
    kind,
    itemId,
  );

  return claimedNew(instance, options);
}

export async function openJob(
  instance: Instance,
  itemId: number,
  attempts = 0,
): Promise<ClaimedJob> {
  const held = instance.database.count(
    "select count(*) as n from jobs where kind = 'digest' and item_id = ? and state = 'running'",
    itemId,
  );

  unblock(instance, itemId);

  const job = await openJobOfKind(instance, { kind: "related_pick", itemId, attempts });

  if (held === 1) await claimedNew(instance, { kind: "digest", itemId });

  return job;
}

export async function botInstance(): Promise<Instance> {
  const instance = await Instance.start({ secretKey: SECRET_KEY });

  try {
    await instance.setUp();
    await saveBot(instance);
    return instance;
  } catch (error) {
    await bestEffort({ event: "test-setup-cleanup-failed", fields: {} }, () => instance.close());
    throw error;
  }
}

export function pastDeadline(instance: Instance, taskId: number): void {
  instance.database.exec(
    "update ai_tasks set deadline = ? where id = ?",
    Date.now() - 1000,
    taskId,
  );
}

export function picksFor(candidate: number, reason = "Both cover the same lattice."): Json {
  return { picks: [{ item: candidate, reason }] };
}

export function answerOf(result: Json): Json {
  return { result };
}

export function retireTasks(instance: Instance): void {
  instance.database.exec(
    "update ai_tasks set state = 'failed', refusal = 'timeout' where state = 'running' and executor = 'grok-bot'",
  );
}

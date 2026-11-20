import assert from "node:assert/strict";

import { z } from "zod";

import { claimNextDue } from "../src/core/compose/jobs.ts";
import type { JobKind } from "../src/core/contract/job-contract.ts";
import type { ClaimedJob } from "../src/core/kernel/job-outcome.ts";
import { type JobRow, jobs } from "../src/core/kernel/schema.ts";
import { newCallbackCredential } from "../src/features/ai/core/callback-credential.ts";
import { KEY, PATH, SECRET_KEY, inOrder } from "./grok-bot-fixtures.ts";
import { type Answer, Instance, type Json } from "./instance.ts";
import { exec, paste, rows } from "./related-fixtures.ts";

export { SECRET_KEY };

export const GROK_BOT_IN_FLIGHT = 10;

export const UNREACHABLE_ADDRESS = "https://no-such-host.invalid/automations/webhook/none";

export interface BotLibrary {
  readonly source: number;
  readonly candidates: readonly number[];
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

export function unblock(instance: Instance, itemId: number): void {
  exec(
    instance,
    "update jobs set state = 'done', claim_expires = null where kind = 'digest' and item_id = ? and state = 'running'",
    itemId,
  );
}

export async function claimedJob(instance: Instance, id: number): Promise<ClaimedJob> {
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
  exec(instance, "update jobs set next_attempt_at = 0, claim_expires = null where id = ?", job.id);

  return claimedJob(instance, job.id);
}

export function acceptedByBot(instance: Instance, taskId: number) {
  const credential = newCallbackCredential(instance.core.crypto);

  exec(
    instance,
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
    })
    .returning({ id: jobs.id });

  if (inserted === undefined) throw new Error("the job was not stored");

  return inserted.id;
}

export async function bulkJobs(
  instance: Instance,
  count: number,
  kind: JobKind = "related_pick",
): Promise<readonly ClaimedJob[]> {
  const first =
    (rows(instance, z.object({ id: z.number().nullable() }), "select max(id) as id from items")[0]
      ?.id ?? 0) + 1;

  const claims: ClaimedJob[] = [];

  await inOrder(
    Array.from({ length: count }, (_, offset) => first + offset),
    async (id) => {
      exec(
        instance,
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
  return claimedJob(instance, await queuedJob(instance, options));
}

export function openJobOfKind(
  instance: Instance,
  options: Readonly<QueuedJob>,
): Promise<ClaimedJob> {
  const { kind, itemId } = options;

  exec(
    instance,
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
  const [held] = rows(
    instance,
    z.object({ n: z.number() }),
    "select count(*) as n from jobs where kind = 'digest' and item_id = ? and state = 'running'",
    itemId,
  );

  unblock(instance, itemId);

  const job = await openJobOfKind(instance, { kind: "related_pick", itemId, attempts });

  if (held?.n === 1) await claimedNew(instance, { kind: "digest", itemId });

  return job;
}

export async function botInstance(): Promise<Instance> {
  const instance = await Instance.start({ secretKey: SECRET_KEY });

  await instance.setUp();
  await saveBot(instance);

  return instance;
}

export function pastDeadline(instance: Instance, taskId: number): void {
  exec(instance, "update ai_tasks set deadline = ? where id = ?", Date.now() - 1000, taskId);
}

export function picksFor(candidate: number, reason = "Both cover the same lattice."): Json {
  return { picks: [{ item: candidate, reason }] };
}

export function answerOf(result: Json): Json {
  return { result };
}

export function retireTasks(instance: Instance): void {
  exec(
    instance,
    "update ai_tasks set state = 'failed', refusal = 'timeout' where state = 'running' and executor = 'grok-bot'",
  );
}

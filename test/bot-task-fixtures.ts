import assert from "node:assert/strict";

import { asc, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import type { ClaimedJob } from "../src/core/job-outcome.ts";
import { type JobRow, jobs } from "../src/core/schema.ts";
import { KEY, PATH, SECRET_KEY } from "./grok-bot-fixtures.ts";
import { type Answer, Instance, type Json } from "./instance.ts";
import { exec, paste, rows } from "./related-fixtures.ts";

export { SECRET_KEY };

export const UNREACHABLE_ADDRESS = "https://no-such-host.invalid/automations/webhook/none";

const YEAR_MS = 365 * 24 * 3_600_000;

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

  exec(
    instance,
    "insert into jobs (kind, item_id, address, state, attempts, stale_requeues, next_attempt_at, claim_expires) values ('digest', ?, 'https://example.com/x', 'running', 0, 0, 0, ?)",
    source,
    Date.now() + YEAR_MS,
  );

  return { source, candidates: [first, second] };
}

export function unblock(instance: Instance, itemId: number): void {
  exec(instance, "delete from jobs where kind = 'digest' and item_id = ?", itemId);
}

function claimedOf(job: Readonly<JobRow>): ClaimedJob {
  return Object.assign({ attemptKey: "", imagePrefix: "" }, job);
}

export async function bulkJobs(
  instance: Instance,
  count: number,
  kind = "related_pick",
): Promise<readonly ClaimedJob[]> {
  const first =
    (rows(instance, z.object({ id: z.number().nullable() }), "select max(id) as id from items")[0]
      ?.id ?? 0) + 1;

  for (const offset of Array.from({ length: count }, (_, index) => index)) {
    const id = first + offset;

    exec(
      instance,
      "insert into items (id, source, kind, normalized_url, original_url, saved_at) values (?, 'article', 'article', ?, ?, 1)",
      id,
      `https://example.com/bulk/${String(id)}`,
      `https://example.com/bulk/${String(id)}`,
    );
    exec(
      instance,
      "insert into jobs (kind, item_id, address, state, attempts, stale_requeues, next_attempt_at, claim_expires) values (?, ?, 'https://example.com/x', 'running', 0, 0, 0, ?)",
      kind,
      id,
      Date.now() + YEAR_MS,
    );
  }

  const found = await instance.core.db
    .select()
    .from(jobs)
    .where(gte(jobs.itemId, first))
    .orderBy(asc(jobs.id));

  return found.map((job) =>
    Object.assign(job, {
      attemptKey: "",
      imagePrefix: "",
    }),
  );
}

export async function openJobOfKind(
  instance: Instance,
  {
    kind,
    itemId,
    attempts = 0,
    staleRequeues = 0,
    attemptGeneration = null,
  }: Readonly<{
    kind: string;
    itemId: number;
    attempts?: number;
    staleRequeues?: number;
    attemptGeneration?: number | null;
  }>,
): Promise<ClaimedJob> {
  exec(
    instance,
    "update jobs set state = 'done', claim_expires = null where kind = ? and item_id = ?",
    kind,
    itemId,
  );
  exec(
    instance,
    "insert into jobs (kind, item_id, address, state, attempts, stale_requeues, attempt_generation, next_attempt_at, claim_expires) values (?, ?, 'https://example.com/x', 'running', ?, ?, ?, 0, ?)",
    kind,
    itemId,
    attempts,
    staleRequeues,
    attemptGeneration,
    Date.now() + 3_600_000,
  );

  const [job] = await instance.core.db
    .select()
    .from(jobs)
    .where(eq(jobs.itemId, itemId))
    .orderBy(desc(jobs.id))
    .limit(1);

  if (job === undefined) throw new Error("the job was not stored");

  return claimedOf(job);
}

export function openJob(instance: Instance, itemId: number, attempts = 0): Promise<ClaimedJob> {
  return openJobOfKind(instance, { kind: "related_pick", itemId, attempts });
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

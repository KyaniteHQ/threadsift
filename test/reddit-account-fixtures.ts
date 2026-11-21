import { z } from "zod";

import { claimNextDue } from "../src/core/compose/jobs.ts";
import { parseLink } from "../src/core/contract/links.ts";
import {
  RedditAccountSaveResponseSchema,
  RedditAccountViewSchema,
  RedditVerifySchema,
} from "../src/core/contract/reddit-account-contract.ts";
import type { ClaimedRow } from "../src/core/kernel/job-outcome.ts";
import { Instance } from "./instance.ts";
import { SECRET_KEY, exec, rows } from "./related-fixtures.ts";

export const PATH = "/api/settings/reddit-account";

export const SESSION = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0Ml9hYmMifQ.c2lnbmF0dXJl-A_B.c~d+e/f=g%3D";

export async function accountInstance(): Promise<Instance> {
  const instance = await Instance.start({ secretKey: SECRET_KEY });
  await instance.setUp();
  return instance;
}

const FAR = 4_000_000_000_000;

const AccountRowSchema = z.object({
  sealed_session: z.string(),
  state: z.string(),
  busy_until: z.number().nullable(),
  busy_job: z.number().nullable(),
  queue_head: z.number().nullable(),
  last_request_at: z.number().nullable(),
  refused_count: z.number(),
  limited_until: z.number().nullable(),
  window_remaining: z.number().nullable(),
  window_resets_at: z.number().nullable(),
});

const JobRowSchema = z.object({
  id: z.number(),
  state: z.string(),
  wait_reason: z.string().nullable(),
  next_attempt_at: z.number(),
  attempts: z.number(),
});

export const view = (instance: Instance) => instance.read("GET", PATH, RedditAccountViewSchema);

export const connect = (instance: Instance, session: string) =>
  instance.read("PUT", PATH, RedditAccountSaveResponseSchema, { session });

export const verified = async (instance: Instance) =>
  (await instance.read("POST", `${PATH}/verify`, RedditVerifySchema)).result;

export const account = (instance: Instance) =>
  rows(
    instance,
    AccountRowSchema,
    "select sealed_session, state, busy_until, busy_job, queue_head, last_request_at, refused_count, limited_until, window_remaining, window_resets_at from reddit_account",
  );

export const jobs = (instance: Instance) =>
  rows(
    instance,
    JobRowSchema,
    "select id, state, wait_reason, next_attempt_at, attempts from jobs order by id",
  );

export function fetchJob(
  instance: Instance,
  id: number,
  {
    state,
    waitReason,
    dueAt,
    address = waitReason === "reddit-limit"
      ? `https://www.reddit.com/comments/job${String(id)}/`
      : `http://127.0.0.1:9/${String(id)}`,
    attempts = 0,
  }: Readonly<{
    state: string;
    waitReason: string | null;
    dueAt: number;
    address?: string;
    attempts?: number;
  }>,
): void {
  const link = parseLink(address);
  exec(
    instance,
    "insert into items (id, source, kind, normalized_url, original_url, saved_at) values (?, ?, ?, ?, ?, 1)",
    id,
    link.source,
    link.kind,
    link.normalizedUrl,
    address,
  );
  exec(
    instance,
    "insert into jobs (id, kind, item_id, address, state, attempts, stale_requeues, next_attempt_at, claim_expires, wait_reason) values (?, 'fetch', ?, ?, ?, ?, 0, ?, ?, ?)",
    id,
    id,
    address,
    state,
    attempts,
    dueAt,
    state === "running" ? FAR : null,
    waitReason,
  );
}

export const LATER = FAR;

export async function claimedJob(instance: Instance, id: number): Promise<ClaimedRow> {
  const dueAt = jobs(instance).find((row) => row.id === id)?.next_attempt_at;

  exec(instance, "update jobs set next_attempt_at = 0 where id = ? and state = 'queued'", id);

  const job = await claimNextDue(instance.core.db);

  if (job?.id !== id || dueAt === undefined) throw new Error(`job ${String(id)} was not claimed`);

  exec(instance, "update jobs set next_attempt_at = ? where id = ?", dueAt, id);

  return job;
}

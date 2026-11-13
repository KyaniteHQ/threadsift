import { z } from "zod";

import {
  RedditAccountSaveResponseSchema,
  RedditAccountViewSchema,
  RedditVerifySchema,
} from "../src/core/reddit-account-contract.ts";
import type { Instance } from "./instance.ts";
import { exec, rows } from "./related-fixtures.ts";

export const PATH = "/api/settings/reddit-account";

export const SESSION = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ0Ml9hYmMifQ.c2lnbmF0dXJl-A_B.c~d+e/f=g%3D";

export const SECRET_KEY = "ab".repeat(32);

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
  }: Readonly<{ state: string; waitReason: string | null; dueAt: number }>,
): void {
  exec(
    instance,
    "insert into items (id, source, kind, normalized_url, original_url, saved_at) values (?, 'article', 'article', ?, ?, 1)",
    id,
    `http://127.0.0.1:9/${String(id)}`,
    `http://127.0.0.1:9/${String(id)}`,
  );
  exec(
    instance,
    "insert into jobs (id, kind, item_id, address, state, attempts, stale_requeues, next_attempt_at, claim_expires, wait_reason) values (?, 'fetch', ?, ?, ?, 0, 0, ?, ?, ?)",
    id,
    id,
    `http://127.0.0.1:9/${String(id)}`,
    state,
    dueAt,
    state === "running" ? FAR : null,
    waitReason,
  );
}

export const LATER = FAR;

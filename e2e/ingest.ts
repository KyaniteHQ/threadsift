import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { z } from "zod";

import { createToken } from "./access-helpers.ts";
import { type Instance, bearer, mainInstance } from "./access.ts";
import type { FreshScreen } from "./fresh-screen.ts";
import { isContainerTarget } from "./target.ts";

export const STALLED = "http://example.com:81/";

export const HOP_DEADLINE_MS = 8000;

const JobRows = z.array(
  z.object({
    id: z.number(),
    kind: z.enum(["fetch", "digest"]),
    state: z.enum(["queued", "running", "done"]),
    attempts: z.number(),
    next_attempt_at: z.number(),
    claim_expires: z.number().nullable(),
  }),
);

const Ids = z.array(z.object({ id: z.number() }));

function jobsWhere(condition: string, instance: Instance = mainInstance()) {
  return instance.query(
    `SELECT j.id, j.kind, j.state, j.attempts, j.next_attempt_at, j.claim_expires FROM jobs j JOIN items i ON i.id = j.item_id WHERE ${condition} ORDER BY j.id`,
    JobRows,
  );
}

export function jobsOf(
  itemId: number,
  instance: Instance = mainInstance(),
  kind?: "fetch" | "digest",
) {
  return jobsWhere(
    `i.id = ${itemId}${kind === undefined ? "" : ` AND j.kind = '${kind}'`}`,
    instance,
  );
}

export function jobsAt(normalizedUrl: string) {
  return jobsWhere(`i.normalized_url = '${normalizedUrl}'`);
}

export function itemIdAt(normalizedUrl: string): number {
  const [row] = mainInstance().query(
    `SELECT id FROM items WHERE normalized_url = '${normalizedUrl}'`,
    Ids,
  );

  if (row === undefined) {
    throw new Error(`no Item at ${normalizedUrl}`);
  }

  return row.id;
}

type Column = string | number | null;

const TextSchema = z.string();

function literal(value: Column): string {
  const text = TextSchema.safeParse(value);

  return text.success ? `'${text.data.replaceAll("'", "''")}'` : String(value);
}

export function forgetItem(normalizedUrl: string): void {
  const instance = mainInstance();

  instance.sql(
    `DELETE FROM jobs WHERE item_id IN (SELECT id FROM items WHERE normalized_url = '${normalizedUrl}')`,
  );
  instance.sql(`DELETE FROM items WHERE normalized_url = '${normalizedUrl}'`);
}

export function storeItem(
  fields: Readonly<Record<string, Column>> & { readonly normalized_url: string },
): number {
  const row = {
    source: "other",
    kind: "link",
    original_url: fields.normalized_url,
    saved_at: Date.now(),
    status: "ready",
    ...fields,
  };

  mainInstance().sql(
    `INSERT INTO items (${Object.keys(row).join(", ")}) VALUES (${Object.values(row)
      .map((value) => literal(value))
      .join(", ")})`,
  );

  return itemIdAt(fields.normalized_url);
}

export function storeProcessingItemWithDueJob(
  url: string,
  address = url,
  dueAt = Date.now() - 1000,
): number {
  const id = storeItem({ normalized_url: url, status: "processing" });

  mainInstance().sql(
    `INSERT INTO jobs (kind, item_id, address, state, attempts, next_attempt_at) VALUES ('fetch', ${id}, '${address}', 'queued', 0, ${dueAt})`,
  );

  return id;
}

export async function sweepNow(
  request: APIRequestContext,
  instance: Instance = mainInstance(),
): Promise<void> {
  if (isContainerTarget()) {
    instance.restart();

    return;
  }

  instance.sql("DELETE FROM scheduled_runs");
  const response = await request.get("/cdn-cgi/local/scheduled");
  expect(response.status(), "the local scheduled endpoint").toBe(200);
}

export async function waitForRunning(id: number): Promise<void> {
  await expect
    .poll(() => jobsOf(id).map((job) => job.state), { timeout: 30_000 })
    .toEqual(["running"]);
}

export function expireClaim(id: number): void {
  mainInstance().sql(`UPDATE jobs SET claim_expires = 1 WHERE item_id = ${id}`);
}

export function deferJobs(instance: Instance, kind: "fetch" | "digest"): () => void {
  const trigger = `defer_${kind}`;
  instance.sql(
    `CREATE TRIGGER ${trigger} AFTER INSERT ON jobs WHEN NEW.kind = '${kind}' BEGIN UPDATE jobs SET next_attempt_at = 9007199254740991 WHERE id = NEW.id; END`,
  );

  return () => {
    instance.sql(`DROP TRIGGER ${trigger}`);
  };
}

export function makeJobDue(id: number, instance: Instance): void {
  instance.sql(`UPDATE jobs SET next_attempt_at = 0 WHERE id = ${id}`);
}

export function makeDue(itemId: number): void {
  mainInstance().sql(`UPDATE jobs SET next_attempt_at = 0 WHERE item_id = ${itemId}`);
}

export async function unchangedOpenDigest(screen: FreshScreen, id: number): Promise<void> {
  const before = jobsOf(id, screen.fresh);

  const { value } = await createToken(screen.context.request, "Digest retry proof");

  const response = await screen.context.request.post(`/api/items/${id}/digest`, {
    headers: bearer(value),
  });

  expect(response.status()).toBe(200);
  expect(jobsOf(id, screen.fresh)).toEqual(before);
}

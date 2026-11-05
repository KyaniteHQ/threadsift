import { expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { z } from "zod";

import { mainInstance } from "./access.ts";
import { isContainerTarget } from "./target.ts";

export const STALLED = "http://example.com:81/";

export const FETCH_DEADLINE_MS = 8000;

const JobRows = z.array(
  z.object({
    id: z.number(),
    state: z.enum(["queued", "running", "done"]),
    attempts: z.number(),
    next_attempt_at: z.number(),
    claim_expires: z.number().nullable(),
  }),
);

const Ids = z.array(z.object({ id: z.number() }));

export function jobsOf(itemId: number) {
  return mainInstance().query(
    `SELECT id, state, attempts, next_attempt_at, claim_expires FROM jobs WHERE item_id = ${itemId} ORDER BY id`,
    JobRows,
  );
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

export function storeProcessingItemWithDueJob(url: string, address = url): number {
  const now = Date.now();
  const instance = mainInstance();

  instance.sql(
    `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, status) VALUES ('other', 'link', '${url}', '${url}', ${now}, 'processing')`,
  );

  const id = itemIdAt(url);

  instance.sql(
    `INSERT INTO jobs (kind, item_id, address, state, attempts, next_attempt_at) VALUES ('fetch', ${id}, '${address}', 'queued', 0, ${now - 1000})`,
  );

  return id;
}

export async function sweepNow(request: APIRequestContext): Promise<void> {
  if (isContainerTarget()) {
    mainInstance().restart();

    return;
  }

  mainInstance().sql("DELETE FROM scheduled_runs");
  const response = await request.get("/cdn-cgi/local/scheduled");
  expect(response.status(), "the local scheduled endpoint").toBe(200);
}

export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

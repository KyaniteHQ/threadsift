import type { Page } from "@playwright/test";
import { z } from "zod";

import type { Instance } from "./access.ts";
import { eventLines } from "./ingest.ts";

export const WAIT_REASON = "github-rate-limit";

export const WAIT_MS = 50 * 60_000;

const FetchJobs = z.array(
  z.object({
    id: z.number(),
    state: z.enum(["queued", "running", "done"]),
    attempts: z.number(),
    next_attempt_at: z.number(),
    wait_reason: z.string().nullable(),
  }),
);

export function startCooldown(instance: Instance, until: number): void {
  instance.sql(
    `INSERT INTO github_cooldown (id, until) VALUES (1, ${until}) ON CONFLICT (id) DO UPDATE SET until = ${until}`,
  );
}

const Cooldowns = z.array(z.object({ until: z.number() }));

export function cooldownRows(instance: Instance): readonly number[] {
  return instance.query("SELECT until FROM github_cooldown", Cooldowns).map(({ until }) => until);
}

export function endCooldown(instance: Instance): void {
  instance.sql("DELETE FROM github_cooldown");
}

export function fetchJobOf(instance: Instance, itemId: number) {
  const [job] = instance.query(
    `SELECT id, state, attempts, next_attempt_at, wait_reason FROM jobs WHERE item_id = ${itemId} AND kind = 'fetch' ORDER BY id DESC LIMIT 1`,
    FetchJobs,
  );

  return job;
}

export function whenAt(page: Page, until: number): Promise<string> {
  return page.evaluate((at) => {
    const date = new Date(at);
    const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    if (date.toDateString() === new Date().toDateString()) return `at ${time}`;

    return `on ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${time}`;
  }, until);
}

export function queueRefusals(instance: Instance, jobId: number): string[] {
  return eventLines(instance, "jobs-not-queued", `"jobIds":"${jobId}"`);
}

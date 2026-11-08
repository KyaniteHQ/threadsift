import type { Page } from "@playwright/test";
import { z } from "zod";

import type { Instance } from "./access.ts";

export const WAIT_REASON = "github-rate-limit";

const HOUR_MS = 3_600_000;

export const LONG_WAIT_MS = 26 * HOUR_MS;

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
  return instance
    .logs()
    .split("\n")
    .filter(
      (line) => line.includes('"event":"jobs-not-queued"') && line.includes(`"jobIds":"${jobId}"`),
    );
}

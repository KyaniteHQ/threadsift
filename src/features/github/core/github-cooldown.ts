import { and, eq, gt, not, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "../../../core/kernel/database.ts";
import { githubCooldown } from "../../../core/kernel/github-tables.ts";
import { guardedBatch } from "../../../core/kernel/guards.ts";
import type { Closing, JobPorts } from "../../../core/kernel/job-outcome.ts";
import { enqueueWoken, waitingFor, wokenJobs } from "../../../core/kernel/job-waiting.ts";
import { type JobRow, jobs } from "../../../core/kernel/schema.ts";
import { type GithubAuth, CredentialChanged, credentialCurrent } from "./github-credential.ts";
import { MAX_COOLDOWN_MS } from "./github-rate-limit.ts";

const COOLDOWN_ROW = 1;

export async function cooldownUntil(db: Database, now: number): Promise<number | null> {
  const [row] = await db
    .select({ until: githubCooldown.until })
    .from(githubCooldown)
    .where(and(eq(githubCooldown.id, COOLDOWN_ROW), gt(githubCooldown.until, now)));

  if (row === undefined) return null;

  const ceiling = now + MAX_COOLDOWN_MS;

  if (row.until <= ceiling) return row.until;

  await db
    .update(githubCooldown)
    .set({ until: ceiling })
    .where(and(eq(githubCooldown.id, COOLDOWN_ROW), eq(githubCooldown.until, row.until)));

  return ceiling;
}

const WAITING = sql`(${eq(jobs.kind, "fetch")} and ${waitingFor("github-rate-limit")})`;

export async function tokenChanged(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  write: BatchItem<"sqlite">,
): Promise<void> {
  const { db } = ports;
  const now = Date.now();

  await db.batch([
    write,
    db.delete(githubCooldown).where(eq(githubCooldown.id, COOLDOWN_ROW)),
    wokenJobs(db, now, WAITING),
  ]);

  await enqueueWoken(ports, now, WAITING, "all");
}

export function githubClosing(
  db: Database,
  job: Readonly<Pick<JobRow, "id">>,
  how: Closing,
): readonly BatchItem<"sqlite">[] {
  if (how.kind !== "deferred" || how.wait !== "github-rate-limit") return [];

  const now = Date.now();

  const cooldownHolds = sql`exists (select 1 from ${githubCooldown} where ${githubCooldown.id} = ${COOLDOWN_ROW} and ${githubCooldown.until} > ${now})`;

  return [wokenJobs(db, now, eq(jobs.id, job.id), WAITING, not(cooldownHolds))];
}

export async function startCooldown(
  db: Database,
  until: number,
  auth: Readonly<GithubAuth>,
): Promise<void> {
  const stored = await guardedBatch(db, credentialCurrent(auth), [
    db
      .insert(githubCooldown)
      .values({ id: COOLDOWN_ROW, until })
      .onConflictDoUpdate({
        target: githubCooldown.id,
        set: { until: sql`max(${githubCooldown.until}, excluded.until)` },
      }),
  ]);

  if (!stored) throw new CredentialChanged();
}

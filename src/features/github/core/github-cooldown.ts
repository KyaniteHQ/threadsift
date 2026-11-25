import { type SQL, and, eq, gt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { GITHUB_WAIT } from "../../../core/contract/job-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { githubCooldown } from "../../../core/kernel/github-tables.ts";
import { guardedBatch, holdsNoRow } from "../../../core/kernel/guards.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { waitingFor, wakeWaitingFetches, wokenJob } from "../../../core/kernel/job-waiting.ts";
import type { JobRow } from "../../../core/kernel/schema.ts";
import { type GithubAuth, CredentialChanged, credentialCurrent } from "./github-credential.ts";
import { MAX_COOLDOWN_MS } from "./github-rate-limit.ts";

const COOLDOWN_ROW = 1;

function cooldownActive(now: number): SQL {
  return and(eq(githubCooldown.id, COOLDOWN_ROW), gt(githubCooldown.until, now)) ?? sql`0`;
}

export async function cooldownUntil(db: Database, now: number): Promise<number | null> {
  const [row] = await db
    .select({ until: githubCooldown.until })
    .from(githubCooldown)
    .where(cooldownActive(now));

  if (row === undefined) return null;

  const ceiling = now + MAX_COOLDOWN_MS;

  if (row.until <= ceiling) return row.until;

  await db
    .update(githubCooldown)
    .set({ until: ceiling })
    .where(and(eq(githubCooldown.id, COOLDOWN_ROW), eq(githubCooldown.until, row.until)));

  return ceiling;
}

export function writeEndingCooldown(
  ports: Readonly<Pick<JobPorts, "db" | "jobs">>,
  write: BatchItem<"sqlite">,
  held?: SQL,
): Promise<void> {
  return wakeWaitingFetches(ports, GITHUB_WAIT, {
    writes: [write, ports.db.delete(githubCooldown).where(eq(githubCooldown.id, COOLDOWN_ROW))],
    held,
    now: Date.now(),
  });
}

export function githubClosing(
  db: Database,
  job: Readonly<Pick<JobRow, "id">>,
): BatchItem<"sqlite"> {
  const now = Date.now();

  return wokenJob(
    db,
    job.id,
    now,
    and(waitingFor(GITHUB_WAIT), holdsNoRow(db, githubCooldown, cooldownActive(now))),
  );
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

import { and, eq, gt, sql } from "drizzle-orm";

import { type GithubAuth, CredentialChanged, credentialCurrent } from "./github-credential.ts";
import { MAX_COOLDOWN_MS } from "./github-rate-limit.ts";
import { githubCooldown } from "./github-tables.ts";
import { guardedBatch } from "./guards.ts";
import type { Database } from "./ports.ts";

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

export function endCooldown(db: Database) {
  return db.delete(githubCooldown).where(eq(githubCooldown.id, COOLDOWN_ROW));
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

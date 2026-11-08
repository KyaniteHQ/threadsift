import { and, eq, gt, sql } from "drizzle-orm";

import { githubCooldown } from "./github-tables.ts";
import type { Database } from "./ports.ts";

const COOLDOWN_ROW = 1;

export async function cooldownUntil(db: Database, now: number): Promise<number | null> {
  const [row] = await db
    .select({ until: githubCooldown.until })
    .from(githubCooldown)
    .where(and(eq(githubCooldown.id, COOLDOWN_ROW), gt(githubCooldown.until, now)));

  return row?.until ?? null;
}

export async function startCooldown(db: Database, until: number): Promise<void> {
  await db
    .insert(githubCooldown)
    .values({ id: COOLDOWN_ROW, until })
    .onConflictDoUpdate({
      target: githubCooldown.id,
      set: { until: sql`max(${githubCooldown.until}, excluded.until)` },
    });
}

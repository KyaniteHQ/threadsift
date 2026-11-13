import { and, eq, sql } from "drizzle-orm";

import type { JobPorts } from "./job-outcome.ts";
import { startOverview } from "./overview-start.ts";
import { removedOpen } from "./proposal-lifecycle.ts";
import { proposals } from "./schema.ts";
import { hasUncovered, overviewGap } from "./topic-coverage.ts";

type OverviewGapAcceptance = "done" | "unknown" | "not-open" | "no-provider" | "not-current";

function stillOpen(id: number, topicId: number) {
  return sql`exists (select 1 from ${proposals} where ${proposals.id} = ${id} and ${proposals.kind} = 'overview-gap' and ${proposals.state} = 'open' and ${proposals.topicId} = ${topicId}) and ${hasUncovered(topicId)}`;
}

export async function acceptOverviewGap(
  ports: JobPorts,
  id: number,
): Promise<OverviewGapAcceptance> {
  const { db } = ports;

  const [row] = await db
    .select({ state: proposals.state, topicId: proposals.topicId })
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.kind, "overview-gap")));

  if (row === undefined || row.topicId === null) return "unknown";

  if (row.state !== "open") return "not-open";

  const started = await startOverview(ports, row.topicId, {
    when: stillOpen(id, row.topicId),
    after: [removedOpen(db, eq(proposals.id, id), sql`changes() > 0`)],
  });

  if (started.kind === "started") return "done";

  const [now] = await db
    .select({ state: proposals.state, current: sql<number>`${overviewGap(proposals.topicId)}` })
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.kind, "overview-gap")));

  if (now === undefined) return "unknown";

  if (now.state !== "open") return "not-open";

  if (started.kind === "no-provider") return "no-provider";

  return started.kind === "stale" && now.current === 1
    ? acceptOverviewGap(ports, id)
    : "not-current";
}

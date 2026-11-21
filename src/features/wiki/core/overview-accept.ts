import { eq, sql } from "drizzle-orm";

import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { overviewGapProposals, proposals } from "../../../core/kernel/schema.ts";
import { startOverview } from "./overview-start.ts";
import { removedOpen } from "./proposal-lifecycle.ts";
import { hasUncovered, overviewGap } from "./topic-coverage.ts";

type OverviewGapAcceptance = "done" | "unknown" | "not-open" | "no-provider" | "not-current";

function stillOpen(id: number, topicId: number) {
  return sql`exists (select 1 from ${proposals} join ${overviewGapProposals} on ${overviewGapProposals.proposalId} = ${proposals.id} where ${proposals.id} = ${id} and ${proposals.state} = 'open' and ${overviewGapProposals.topicId} = ${topicId}) and ${hasUncovered(topicId)}`;
}

export async function acceptOverviewGap(
  ports: JobPorts,
  id: number,
): Promise<OverviewGapAcceptance> {
  const { db } = ports;

  const [row] = await db
    .select({ state: proposals.state, topicId: overviewGapProposals.topicId })
    .from(proposals)
    .innerJoin(overviewGapProposals, eq(overviewGapProposals.proposalId, proposals.id))
    .where(eq(proposals.id, id));

  if (row === undefined) return "unknown";

  if (row.state !== "open") return "not-open";

  const started = await startOverview(ports, row.topicId, {
    when: stillOpen(id, row.topicId),
    after: [removedOpen(db, "overview-gap", eq(proposals.id, id), sql`changes() > 0`)],
  });

  if (started.kind === "started") return "done";

  const [now] = await db
    .select({
      state: proposals.state,
      current: sql<number>`${overviewGap(overviewGapProposals.topicId)}`,
    })
    .from(proposals)
    .innerJoin(overviewGapProposals, eq(overviewGapProposals.proposalId, proposals.id))
    .where(eq(proposals.id, id));

  if (now === undefined) return "unknown";

  if (now.state !== "open") return "not-open";

  if (started.kind === "no-provider") return "no-provider";

  return started.kind === "stale" && now.current === 1
    ? acceptOverviewGap(ports, id)
    : "not-current";
}

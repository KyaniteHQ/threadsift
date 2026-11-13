import { and, eq } from "drizzle-orm";

import { acceptDisagreement } from "./disagreement-accept.ts";
import { acceptLostHighlight } from "./highlight-proposals.ts";
import type { JobPorts } from "./job-outcome.ts";
import { type MergeAcceptance, acceptMerge } from "./merge-accept.ts";
import { acceptOverviewGap } from "./overview-accept.ts";
import type { Database } from "./ports.ts";
import { rejection } from "./proposal-lifecycle.ts";
import { knownProposal, proposals } from "./schema.ts";

export type Acceptance = MergeAcceptance | "not-current" | "no-provider";

type Accepting = (ports: JobPorts, id: number) => Promise<Acceptance>;

const ACCEPT = {
  "tag-merge": acceptMerge,
  "topic-merge": acceptMerge,
  "highlight-lost": ({ db }, id) => acceptLostHighlight(db, id),
  "overview-gap": acceptOverviewGap,
  "items-disagree": ({ db }, id) => acceptDisagreement(db, id),
} as const satisfies Readonly<Record<(typeof proposals.$inferSelect)["kind"], Accepting>>;

export async function acceptProposal(ports: JobPorts, id: number): Promise<Acceptance> {
  const [found] = await ports.db
    .select({ kind: proposals.kind })
    .from(proposals)
    .where(and(eq(proposals.id, id), knownProposal));

  return found === undefined ? "unknown" : ACCEPT[found.kind](ports, id);
}

export type Rejection = "rejected" | "unknown" | "not-open";

export async function rejectProposal(db: Database, id: number): Promise<Rejection> {
  const moved = await rejection(db, id);

  if (moved.length > 0) return "rejected";

  const [found] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(and(eq(proposals.id, id), knownProposal));

  return found === undefined ? "unknown" : "not-open";
}

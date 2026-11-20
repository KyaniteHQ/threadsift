import { eq } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { proposals } from "../../../core/kernel/schema.ts";
import type { Acceptance } from "./proposal-kind.ts";
import { PROPOSAL } from "./proposal-kinds.ts";
import { rejection } from "./proposal-lifecycle.ts";

export async function acceptProposal(ports: JobPorts, id: number): Promise<Acceptance> {
  const [found] = await ports.db
    .select({ kind: proposals.kind })
    .from(proposals)
    .where(eq(proposals.id, id));

  return found === undefined ? "unknown" : PROPOSAL[found.kind].accept(ports, id);
}

type Rejection = "rejected" | "unknown" | "not-open";

export async function rejectProposal(db: Database, id: number): Promise<Rejection> {
  const moved = await rejection(db, id);

  if (moved.length > 0) return "rejected";

  const [found] = await db.select({ id: proposals.id }).from(proposals).where(eq(proposals.id, id));

  return found === undefined ? "unknown" : "not-open";
}

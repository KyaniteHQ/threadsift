import { sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { guardHolds, guardedWrite } from "./guards.ts";
import { publishSupplied } from "./item-publish.ts";
import type { AnchoredOutcome } from "./job-outcome.ts";
import type { StoredThread } from "./stored-thread.ts";
import { type ThreadPlace, threadItemInsert } from "./thread-publish.ts";
import { type Refusal, type Requirement, requirementOf } from "./thread-requirements.ts";

export type Published = { readonly kind: "published"; readonly created: boolean } | Refusal;

async function commit(
  db: Database,
  place: Readonly<ThreadPlace>,
  requirement: Readonly<Requirement> | undefined,
  { writes, precondition }: Readonly<AnchoredOutcome>,
): Promise<Published> {
  const holds =
    requirement === undefined
      ? precondition.holds
      : sql`(${precondition.holds}) and (${requirement.holds})`;

  const inserted = await guardedWrite(db, holds, threadItemInsert(db, place), writes);

  if (inserted !== null) return { kind: "published", created: inserted.length > 0 };

  if (requirement !== undefined && !(await guardHolds(db, requirement.holds))) {
    return requirement.refusal;
  }

  return commit(db, place, requirement, await precondition.rebuild());
}

export async function publishThread(
  db: Database,
  place: Readonly<ThreadPlace>,
  thread: Readonly<StoredThread>,
  { pendingDigest, fillOnly }: Readonly<{ pendingDigest: string | null; fillOnly: boolean }>,
): Promise<Published> {
  const publication = await publishSupplied(db, place, thread, pendingDigest);

  return commit(db, place, requirementOf(place, thread, fillOnly), publication);
}

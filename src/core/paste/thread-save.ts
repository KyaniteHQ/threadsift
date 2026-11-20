import { sql } from "drizzle-orm";

import { publishSupplied } from "../item/item-publish.ts";
import { itemInsert } from "../item/item-rows.ts";
import type { Database } from "../kernel/database.ts";
import { guardHolds, guardedWrite } from "../kernel/guards.ts";
import type { AnchoredOutcome } from "../kernel/job-outcome.ts";
import type { StoredThread } from "../thread/stored-thread.ts";
import {
  type Refusal,
  type Requirement,
  type ThreadPlace,
  requirementOf,
} from "./thread-requirements.ts";

type Published = { readonly kind: "published"; readonly created: boolean } | Refusal;

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

  const inserted = await guardedWrite(
    db,
    holds,
    itemInsert(db, {
      link: place,
      originalUrl: place.address,
      savedAt: Date.now(),
      addedByToken: place.addedByToken,
    }),
    writes,
  );

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

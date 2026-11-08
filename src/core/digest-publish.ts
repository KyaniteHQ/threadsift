import { eq, sql } from "drizzle-orm";

import { type Digest, DigestSchema } from "./ai-contract.ts";
import { completedAiTask } from "./ai-tasks.ts";
import { catalogCurrent, catalogEntries, linkingDigest } from "./catalog.ts";
import {
  type DigestInput,
  currency,
  generationCurrent,
  setDigestFailure,
} from "./digest-source.ts";
import { MAX_STALE_REQUEUES, type JobOutcome } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { selectedBodies, selectionWrites, submittedAmong } from "./reddit-thread.ts";
import { digests, insertGuard, items } from "./schema.ts";
import { commentPartWrites, digestPartWrites } from "./search.ts";

type DigestSource =
  | { readonly executor: "caller" }
  | {
      readonly executor: "model";
      readonly provider: string;
      readonly model: string | null;
      readonly version: number;
      readonly staleRequeues: number;
      readonly submitted: readonly string[];
    };

export async function publishing(
  db: Database,
  item: Readonly<DigestInput>,
  digest: Readonly<Digest>,
  taskId: number,
  source: DigestSource,
): Promise<JobOutcome> {
  const entries = catalogEntries(digest);
  const { catalog, provider, model, published } = digestOrigin(source, digest, entries);
  const generation = generationCurrent(item);
  const kept = published.keptComments ?? [];
  const snapshot = { itemId: item.id, generation: item.generation };
  const bodies = kept.length === 0 ? [] : await selectedBodies(db, snapshot, kept);

  const stored = {
    itemId: item.id,
    digest: JSON.stringify(published),
    title: digest.title,
    topic: digest.topic,
    taskId,
    provider,
    model,
    generation: item.generation,
    createdAt: Date.now(),
  };

  return {
    currency: currency(db, sql`${generation} and ${catalog}`, taskId),
    writes: [
      insertGuard(db, generation),
      insertGuard(db, catalog),
      ...linkingDigest(db, item.id, entries),
      db.insert(digests).values(stored).onConflictDoUpdate({ target: digests.itemId, set: stored }),
      ...selectionWrites(db, snapshot, kept),
      ...digestPartWrites(db, eq(items.id, item.id)),
      ...commentPartWrites(db, eq(items.id, item.id), bodies),
      completedAiTask(db, { taskId, result: published }),
      db.update(items).set({ pendingDigest: null }).where(eq(items.id, item.id)),
      setDigestFailure(db, item.id, false),
    ],
  };
}

function digestOrigin(
  source: DigestSource,
  digest: Readonly<Digest>,
  entries: Readonly<ReturnType<typeof catalogEntries>>,
) {
  switch (source.executor) {
    case "caller":
      return { catalog: sql`1`, provider: null, model: null, published: digest };
    case "model":
      return {
        published: DigestSchema.parse({
          ...digest,
          keptComments: submittedAmong(digest.keptComments ?? [], source.submitted),
        }),
        catalog:
          source.staleRequeues >= MAX_STALE_REQUEUES
            ? sql`1`
            : catalogCurrent(source.version, entries),
        provider: source.provider,
        model: source.model,
      };
    default: {
      const exhaustive: never = source;

      return exhaustive;
    }
  }
}

import { eq, sql } from "drizzle-orm";

import { type Digest, DigestSchema } from "./ai-contract.ts";
import { aiTaskRunning, completedAiTask } from "./ai-tasks.ts";
import { catalogCurrent, pinnedCatalog, publishedLinks } from "./catalog.ts";
import {
  type DigestInput,
  currency,
  digestInput,
  generationCurrent,
  markDigest,
  openingPick,
} from "./digest-source.ts";
import {
  type AnchorSnapshot,
  anchorReads,
  anchoredOutcome,
  type Publication,
  commentIdsOf,
  snapshotOf,
} from "./highlight-publish.ts";
import { MAX_STALE_REQUEUES, type JobOutcome, type JobPorts } from "./job-outcome.ts";
import {
  eligibleAmong,
  highlightedComments,
  selectedBodies,
  selectionWrites,
  submittedAmong,
} from "./reddit-thread.ts";
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

export async function readForPublishing(db: JobPorts["db"], itemId: number) {
  const [[item], ...reads] = await db.batch([
    digestInput(db, itemId),
    ...anchorReads(db, eq(items.id, itemId)),
  ]);

  return { item, anchors: snapshotOf(reads) };
}

function storedDigest(
  item: Readonly<DigestInput>,
  digest: Readonly<Digest>,
  taskId: number,
  {
    provider,
    model,
    published,
  }: Readonly<{
    provider: string | null;
    model: string | null;
    published: Readonly<Digest>;
  }>,
  { tags, topic }: Readonly<{ tags: readonly string[]; topic: string }>,
) {
  return {
    itemId: item.id,
    digest: JSON.stringify({ ...published, tags, topic }),
    title: digest.title,
    topic,
    taskId,
    provider,
    model,
    generation: item.generation,
    createdAt: Date.now(),
  };
}

function keptCommentsPublication(
  db: JobPorts["db"],
  snapshot: Readonly<{ itemId: number; generation: number }>,
): Publication {
  return {
    owner: eq(items.id, snapshot.itemId),
    displayed: async (current) => ({
      comments: await highlightedComments(db, snapshot, commentIdsOf(current)),
    }),
  };
}

export async function publishing(
  db: JobPorts["db"],
  item: Readonly<DigestInput>,
  digest: Readonly<Digest>,
  taskId: number,
  source: DigestSource,
  anchors?: Readonly<AnchorSnapshot>,
): Promise<JobOutcome> {
  const { pinned, entries } = await pinnedCatalog(db, digest);
  const snapshot = { itemId: item.id, generation: item.generation };

  const submitted =
    source.executor === "model"
      ? source.submitted
      : await eligibleAmong(db, snapshot, digest.keptComments ?? []);

  const origin = digestOrigin(source, digest, entries, submitted);
  const { published } = origin;
  const generation = sql`${generationCurrent(item)} and ${aiTaskRunning(taskId)}`;
  const catalog = sql`${origin.catalog} and ${pinned.current}`;
  const kept = published.keptComments ?? [];
  const bodies = kept.length === 0 ? [] : await selectedBodies(db, snapshot, kept);

  const stored = storedDigest(item, digest, taskId, origin, pinned);

  return anchoredOutcome(
    db,
    {
      currency: currency(db, sql`${generation} and ${catalog}`, taskId),
      writes: [
        insertGuard(db, generation),
        insertGuard(db, catalog),
        ...publishedLinks(db, item.id, entries, digest.title),
        db
          .insert(digests)
          .values(stored)
          .onConflictDoUpdate({ target: digests.itemId, set: stored }),
        openingPick(db, item.id),
        ...selectionWrites(db, snapshot, kept),
        ...digestPartWrites(db, eq(items.id, item.id)),
        ...commentPartWrites(db, eq(items.id, item.id), bodies),
        completedAiTask(db, { taskId, result: published }),
        db.update(items).set({ pendingDigest: null }).where(eq(items.id, item.id)),
        ...markDigest(db, item.id, { kind: "cleared" }),
      ],
    },
    keptCommentsPublication(db, snapshot),
    anchors,
  );
}

function digestOrigin(
  source: DigestSource,
  digest: Readonly<Digest>,
  entries: Parameters<typeof catalogCurrent>[1],
  submitted: readonly string[],
) {
  const published = DigestSchema.parse({
    ...digest,
    keptComments: submittedAmong(digest.keptComments ?? [], submitted),
  });

  switch (source.executor) {
    case "caller":
      return { catalog: sql`1`, provider: null, model: null, published };
    case "model":
      return {
        published,
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

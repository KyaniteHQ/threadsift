import { eq, sql } from "drizzle-orm";

import type { Digest, ModelDigest } from "./ai-contract.ts";
import { storedOutcome } from "./ai-kind-publish.ts";
import type { Stored } from "./ai-kind-types.ts";
import { catalogCurrent, pinnedCatalog } from "./catalog.ts";
import type { Database } from "./database.ts";
import { type DigestInput, digestInput, generationCurrent } from "./digest-source.ts";
import { digestWrites } from "./digest-writes.ts";
import {
  type AnchorSnapshot,
  anchorReads,
  anchoredOutcome,
  type Publication,
  commentIdsOf,
  snapshotOf,
} from "./highlight-publish.ts";
import type { JobOutcome } from "./job-outcome.ts";
import { MAX_STALE_REQUEUES } from "./job-retry.ts";
import {
  eligibleAmong,
  highlightedComments,
  selectedBodies,
  submittedAmong,
} from "./reddit-thread.ts";
import { items } from "./schema.ts";

type CatalogRule =
  | { readonly kind: "checked"; readonly version: number; readonly staleRequeues: number }
  | { readonly kind: "unchecked" };

type DigestSource =
  | { readonly executor: "caller" }
  | {
      readonly executor: "model";
      readonly provider: string;
      readonly model: string | null;
      readonly catalog: CatalogRule;
      readonly submitted: readonly string[];
    };

export async function readForPublishing(db: Database, itemId: number) {
  const [[item], ...reads] = await db.batch([
    digestInput(db, itemId),
    ...anchorReads(db, eq(items.id, itemId)),
  ]);

  return { item, anchors: snapshotOf(reads) };
}

type PublishedItem = Readonly<Pick<DigestInput, "id" | "generation" | "pendingDigest">>;

function storedDigest(
  item: PublishedItem,
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
  db: Database,
  snapshot: Readonly<{ itemId: number; generation: number }>,
): Publication {
  return {
    owner: eq(items.id, snapshot.itemId),
    displayed: async (current) => ({
      comments: await highlightedComments(db, snapshot, commentIdsOf(current)),
    }),
  };
}

export async function digestStored(
  db: Database,
  item: PublishedItem,
  digest: Readonly<Digest>,
  {
    taskId,
    source,
    anchors,
  }: Readonly<{ taskId: number; source: DigestSource; anchors?: Readonly<AnchorSnapshot> }>,
): Promise<Stored<ModelDigest>> {
  const { pinned, entries } = await pinnedCatalog(db, digest);
  const snapshot = { itemId: item.id, generation: item.generation };

  const submitted =
    source.executor === "model"
      ? source.submitted
      : await eligibleAmong(db, snapshot, digest.keptComments ?? []);

  const origin = digestOrigin(source, digest, entries, submitted);
  const { published } = origin;
  const ids = published.keptComments ?? [];
  const kept = { ids, bodies: ids.length === 0 ? [] : await selectedBodies(db, snapshot, ids) };

  const stored = storedDigest(item, digest, taskId, origin, pinned);

  return {
    also: sql`${origin.catalog} and ${pinned.current}`,
    writes: digestWrites(db, { stored, entries, kept }),
    result: published,
    settle: (outcome) =>
      anchoredOutcome(db, outcome, keptCommentsPublication(db, snapshot), anchors),
  };
}

export async function publishedByCaller(
  db: Database,
  item: PublishedItem,
  digest: Readonly<Digest>,
  { taskId, anchors }: Readonly<{ taskId: number; anchors: Readonly<AnchorSnapshot> }>,
): Promise<JobOutcome> {
  const stored = await digestStored(db, item, digest, {
    taskId,
    source: { executor: "caller" },
    anchors,
  });

  return storedOutcome(db, { current: generationCurrent(item), taskId, answer: digest }, stored);
}

function catalogGuard(rule: CatalogRule, entries: Parameters<typeof catalogCurrent>[1]) {
  switch (rule.kind) {
    case "checked":
      return rule.staleRequeues >= MAX_STALE_REQUEUES
        ? sql`1`
        : catalogCurrent(rule.version, entries);
    case "unchecked":
      return sql`1`;
    default: {
      const exhaustive: never = rule;

      return exhaustive;
    }
  }
}

function digestOrigin(
  source: DigestSource,
  digest: Readonly<Digest>,
  entries: Parameters<typeof catalogCurrent>[1],
  submitted: readonly string[],
) {
  const published = {
    ...digest,
    keptComments: submittedAmong(digest.keptComments ?? [], submitted),
  };

  switch (source.executor) {
    case "caller":
      return { catalog: sql`1`, provider: null, model: null, published };
    case "model":
      return {
        published,
        catalog: catalogGuard(source.catalog, entries),
        provider: source.provider,
        model: source.model,
      };
    default: {
      const exhaustive: never = source;

      return exhaustive;
    }
  }
}

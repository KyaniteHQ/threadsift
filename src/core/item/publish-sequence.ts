import { type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "../kernel/database.ts";
import { digestAfterFetch } from "../kernel/digest-opening.ts";
import type { AnchoredOutcome, JobFiles, SettledOutcome } from "../kernel/job-outcome.ts";
import { type ItemRow, items } from "../kernel/schema.ts";
import { STALE } from "../kernel/vault-stale.ts";
import type { StoredThread } from "../thread/stored-thread.ts";
import type { Owner } from "../thread/thread-store.ts";
import { anchoredOutcome, displayedBesideThread } from "./highlight-publish.ts";
import { fetchedPartWrites } from "./search.ts";
import type { Settled } from "./settle.ts";

export interface ItemAt {
  readonly where: SQL;
  readonly owner: Owner;
  readonly address: string;
}

interface Sequence {
  readonly fields: Readonly<Settled> & Readonly<Partial<Pick<ItemRow, "postTextKey">>>;
  readonly postText: string | null | undefined;
  readonly pendingDigest: typeof items.pendingDigest | string | null;
  readonly nodes: StoredThread["nodes"] | undefined;
  readonly closing: readonly BatchItem<"sqlite">[];
  readonly beforeParts: readonly BatchItem<"sqlite">[];
  readonly afterParts: readonly BatchItem<"sqlite">[];
  readonly files: JobFiles;
}

function sequenced(
  db: Database,
  { where, owner, address }: Readonly<ItemAt>,
  { fields, postText, pendingDigest, closing, beforeParts, afterParts, files }: Readonly<Sequence>,
): SettledOutcome {
  const { title } = fields;
  const replaces = postText !== undefined;

  return {
    writes: [
      ...(title === undefined ? [] : STALE.fetchedTitle(db, where, title)),
      ...closing,
      db
        .update(items)
        .set({
          ...fields,
          pendingDigest,
          generation: replaces ? sql`${items.generation} + 1` : items.generation,
        })
        .where(where),
      ...beforeParts,
      ...(title === undefined ? [] : fetchedPartWrites(db, where, postText)),
      ...afterParts,
      ...(replaces ? digestAfterFetch(db, { itemId: owner.id, address }) : []),
      ...(fields.fetch === "ok" ? STALE.itemChanged(db, where) : []),
    ],
    files,
  };
}

export function anchoredSequence(
  db: Database,
  at: Readonly<ItemAt>,
  sequence: Readonly<Sequence & { readonly postText: string | null }>,
): Promise<AnchoredOutcome> {
  return anchoredOutcome(db, sequenced(db, at, sequence), {
    owner: at.where,
    displayed: displayedBesideThread({ post: sequence.postText, comments: sequence.nodes }),
  });
}

export function settledSequence(
  db: Database,
  at: Readonly<ItemAt>,
  sequence: Readonly<Sequence>,
): Promise<SettledOutcome> | SettledOutcome {
  return sequence.postText === undefined
    ? sequenced(db, at, sequence)
    : anchoredSequence(db, at, { ...sequence, postText: sequence.postText });
}

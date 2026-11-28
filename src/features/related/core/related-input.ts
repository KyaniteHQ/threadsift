import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";

import { fitsAiInput } from "../../../core/contract/ai-contract.ts";
import type { Digest } from "../../../core/contract/digest-schema.ts";
import type { Database } from "../../../core/kernel/database.ts";
import {
  type StoredDigest,
  providerDigests,
  readStoredDigest,
  unchangedDigests,
} from "../../../core/kernel/digest-stored.ts";
import { logFailure } from "../../../core/kernel/failure-log.ts";
import { candidateIds, relatedTerms } from "./related-candidates.ts";

export interface PickItem {
  readonly id: number;
  readonly digest: number;
  readonly title: string;
  readonly topic: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly storedTags: string | null;
  readonly storedTopic: string;
}

export const VersionSchema = z
  .object({
    id: z.number().int().positive(),
    digest: z.number().int().positive(),
    storedTags: z.string().nullable(),
    storedTopic: z.string(),
  })
  .readonly();

export type Version = z.output<typeof VersionSchema>;

interface Versions {
  readonly source: Version;
  readonly sent: readonly Version[];
}

export function versionOf(item: Readonly<PickItem>): Version {
  return {
    id: item.id,
    digest: item.digest,
    storedTags: item.storedTags,
    storedTopic: item.storedTopic,
  };
}

export function versionsHold({ source, sent }: Readonly<Versions>): SQL {
  const reads = [source, ...sent].map(({ id, digest, storedTags: tags, storedTopic: topic }) => ({
    id,
    task: digest,
    tags,
    topic,
  }));

  return sql`(select count(*) from (${unchangedDigests(reads)})) = ${reads.length}`;
}

export type PickRead =
  | { readonly kind: "absent" }
  | {
      readonly kind: "unreadable";
      readonly source: Version;
    }
  | {
      readonly kind: "read";
      readonly source: PickItem;
      readonly candidates: readonly PickItem[];
    };

type PickPrompt =
  | { readonly kind: "empty" }
  | { readonly kind: "refused"; readonly reason: "source-over-cap" | "none-fit" }
  | { readonly kind: "ask"; readonly input: string; readonly sent: readonly PickItem[] };

function pickItem(row: Readonly<StoredDigest>, digest: Readonly<Digest>): PickItem {
  const { title, topic, summary, tags } = digest;

  return {
    id: row.itemId,
    digest: row.taskId,
    title,
    topic,
    summary,
    tags,
    storedTags: row.tags,
    storedTopic: row.topic,
  };
}

function readableCandidate(row: Readonly<StoredDigest>) {
  const read = readStoredDigest(row.digest);

  if (read.kind === "readable") return [pickItem(row, read.digest)];

  logFailure("related-candidate-unreadable", { itemId: row.itemId }, read.cause);

  return [];
}

export async function readPick(db: Database, itemId: number): Promise<PickRead> {
  const [row] = await providerDigests(db, [itemId]);

  if (row === undefined) return { kind: "absent" };

  const read = readStoredDigest(row.digest);

  if (read.kind === "unreadable") {
    logFailure("related-digest-unreadable", { itemId }, read.cause);

    return {
      kind: "unreadable",
      source: { id: itemId, digest: row.taskId, storedTags: row.tags, storedTopic: row.topic },
    };
  }

  const source = pickItem(row, read.digest);

  const ids = await candidateIds(db, itemId, relatedTerms(source));

  const rows = ids.length === 0 ? [] : await providerDigests(db, ids);

  const byId = new Map(rows.map((each) => [each.itemId, each]));

  return {
    kind: "read",
    source,
    candidates: ids.flatMap((id) => {
      const found = byId.get(id);

      return found === undefined ? [] : readableCandidate(found);
    }),
  };
}

function promptJson(source: PickItem, candidates: readonly PickItem[]): string {
  return JSON.stringify({
    source: {
      id: source.id,
      title: source.title,
      topic: source.topic,
      tags: source.tags,
      summary: source.summary,
    },
    candidates: candidates.map(({ id, title, topic, summary }) => ({ id, title, topic, summary })),
  });
}

export function pickPrompt({
  source,
  candidates,
}: Readonly<Extract<PickRead, { kind: "read" }>>): PickPrompt {
  if (candidates.length === 0) return { kind: "empty" };

  if (!fitsAiInput(promptJson(source, []))) {
    return { kind: "refused", reason: "source-over-cap" };
  }

  const sent: PickItem[] = [];

  for (const candidate of candidates) {
    if (fitsAiInput(promptJson(source, [...sent, candidate]))) sent.push(candidate);
  }

  return sent.length === 0
    ? { kind: "refused", reason: "none-fit" }
    : { kind: "ask", input: promptJson(source, sent), sent };
}

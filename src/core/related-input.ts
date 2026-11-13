import { type SQL, type SQLWrapper, eq, inArray, sql } from "drizzle-orm";

import { parseStoredDigest } from "./ai-contract.ts";
import { utf8Length } from "./digest-prompt.ts";
import { storedTags, unchangedDigests } from "./digest-state.ts";
import { logFailure } from "./failure-log.ts";
import type { Database } from "./ports.ts";
import { candidateIds, relatedTerms } from "./related-candidates.ts";
import { RELATED_INPUT_BYTES } from "./related-task.ts";
import { digests } from "./schema.ts";

export interface PickItem {
  readonly id: number;
  readonly digest: number;
  readonly title: string;
  readonly topic: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly storedTags: string | null;
}

export type Version = Readonly<Pick<PickItem, "id" | "digest" | "storedTags">>;

export interface Versions {
  readonly source: Version;
  readonly sent: readonly Version[];
}

export function versionsHold({ source, sent }: Readonly<Versions>): SQL {
  const reads = [source, ...sent].map(({ id, digest, storedTags: tags }) => ({
    id,
    task: digest,
    tags,
  }));

  return sql`(select count(*) from (${unchangedDigests(reads)})) = ${reads.length}`;
}

function digestRows(db: Database, where: Readonly<SQLWrapper>) {
  return db
    .select({
      id: digests.itemId,
      digest: digests.taskId,
      stored: digests.digest,
      storedTags,
    })
    .from(digests)
    .where(sql`${where}`);
}

export type PickRead =
  | { readonly kind: "absent" }
  | {
      readonly kind: "unreadable";
      readonly source: Readonly<Pick<PickItem, "id" | "digest" | "storedTags">>;
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

interface DigestRow {
  readonly id: number;
  readonly digest: number;
  readonly stored: string;
  readonly storedTags: string | null;
}

function pickItem(row: Readonly<DigestRow>): PickItem {
  const { title, topic, summary, tags } = parseStoredDigest(row.stored);

  return {
    id: row.id,
    digest: row.digest,
    title,
    topic,
    summary,
    tags,
    storedTags: row.storedTags,
  };
}

function readableCandidate(row: Readonly<DigestRow>) {
  try {
    return [pickItem(row)];
  } catch (error) {
    logFailure("related-candidate-unreadable", { itemId: row.id }, error);

    return [];
  }
}

export async function readPick(db: Database, itemId: number): Promise<PickRead> {
  const [row] = await digestRows(db, eq(digests.itemId, itemId));

  if (row === undefined) return { kind: "absent" };

  let source: PickItem;

  try {
    source = pickItem(row);
  } catch (error) {
    logFailure("related-digest-unreadable", { itemId }, error);

    return {
      kind: "unreadable",
      source: { id: itemId, digest: row.digest, storedTags: row.storedTags },
    };
  }

  const ids = await candidateIds(db, itemId, relatedTerms(source));

  const rows = ids.length === 0 ? [] : await digestRows(db, inArray(digests.itemId, ids));

  const byId = new Map(rows.map((each) => [each.id, each]));

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

  if (utf8Length(promptJson(source, [])) > RELATED_INPUT_BYTES) {
    return { kind: "refused", reason: "source-over-cap" };
  }

  const sent: PickItem[] = [];

  for (const candidate of candidates) {
    if (utf8Length(promptJson(source, [...sent, candidate])) <= RELATED_INPUT_BYTES) {
      sent.push(candidate);
    }
  }

  return sent.length === 0
    ? { kind: "refused", reason: "none-fit" }
    : { kind: "ask", input: promptJson(source, sent), sent };
}

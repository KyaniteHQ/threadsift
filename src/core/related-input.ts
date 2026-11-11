import { eq, inArray } from "drizzle-orm";

import { parseStoredDigest } from "./ai-contract.ts";
import { utf8Length } from "./digest-prompt.ts";
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
}

export type PickRead =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly source: Readonly<Pick<PickItem, "id" | "digest">> }
  | {
      readonly kind: "read";
      readonly source: PickItem;
      readonly candidates: readonly PickItem[];
    };

type PickPrompt =
  | { readonly kind: "empty" }
  | { readonly kind: "refused"; readonly reason: "source-over-cap" | "none-fit" }
  | { readonly kind: "ask"; readonly input: string; readonly sent: readonly PickItem[] };

function pickItem(row: Readonly<{ id: number; digest: number; stored: string }>): PickItem {
  const { title, topic, summary, tags } = parseStoredDigest(row.stored);

  return { id: row.id, digest: row.digest, title, topic, summary, tags };
}

function readableCandidate(row: Readonly<{ id: number; digest: number; stored: string }>) {
  try {
    return [pickItem(row)];
  } catch (error) {
    logFailure("related-candidate-unreadable", { itemId: row.id }, error);

    return [];
  }
}

export async function readPick(db: Database, itemId: number): Promise<PickRead> {
  const [row] = await db
    .select({ id: digests.itemId, digest: digests.taskId, stored: digests.digest })
    .from(digests)
    .where(eq(digests.itemId, itemId));

  if (row === undefined) return { kind: "absent" };

  let source: PickItem;

  try {
    source = pickItem(row);
  } catch (error) {
    logFailure("related-digest-unreadable", { itemId }, error);

    return { kind: "unreadable", source: { id: itemId, digest: row.digest } };
  }

  const ids = await candidateIds(db, itemId, relatedTerms(source));

  const rows =
    ids.length === 0
      ? []
      : await db
          .select({ id: digests.itemId, digest: digests.taskId, stored: digests.digest })
          .from(digests)
          .where(inArray(digests.itemId, ids));

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

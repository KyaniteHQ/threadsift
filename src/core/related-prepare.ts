import { report } from "./failure-log.ts";
import type { SettledOutcome } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { type PickItem, type PickRead, pickPrompt, readPick } from "./related-input.ts";
import { closedOutcome, emptyOutcome, noDigestOutcome } from "./related-write.ts";

type ReadyPick = Extract<PickRead, { kind: "read" }>;

export type RelatedPrepared =
  | { readonly kind: "settled"; readonly outcome: SettledOutcome }
  | {
      readonly kind: "ask";
      readonly source: PickItem;
      readonly input: string;
      readonly sent: readonly PickItem[];
    };

function logRefused(
  { source, candidates }: Readonly<ReadyPick>,
  reason: "source-over-cap" | "none-fit",
): void {
  report("related-input-refused", { itemId: source.id, reason, candidates: candidates.length });
}

function settled(outcome: SettledOutcome): RelatedPrepared {
  return { kind: "settled", outcome };
}

function preparedPick(db: Database, read: Readonly<ReadyPick>): RelatedPrepared {
  const { source } = read;
  const prompt = pickPrompt(read);

  switch (prompt.kind) {
    case "empty":
      return settled(emptyOutcome(db, source));
    case "refused":
      logRefused(read, prompt.reason);

      return settled(closedOutcome(db, source));
    case "ask":
      return { kind: "ask", source, input: prompt.input, sent: prompt.sent };
    default: {
      const exhaustive: never = prompt;

      return exhaustive;
    }
  }
}

export async function preparedRelated(db: Database, itemId: number): Promise<RelatedPrepared> {
  const read = await readPick(db, itemId);

  switch (read.kind) {
    case "absent":
      return settled(noDigestOutcome(db, itemId));
    case "unreadable":
      return settled(closedOutcome(db, read.source));
    case "read":
      return preparedPick(db, read);
    default: {
      const exhaustive: never = read;

      return exhaustive;
    }
  }
}

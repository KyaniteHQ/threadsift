import { nextBatch } from "../../src/core/import-list.ts";
import { type Counts, postBatch } from "./import-api.ts";
import type { FailedEnding } from "./import-text.ts";

export interface Progress {
  readonly done: number;
  readonly counts: Counts;
}

type Ending = "finished" | "stopped" | FailedEnding;

export type Outcome = Progress & { readonly ending: Ending };

function summed(before: Counts, batch: Counts): Counts {
  return {
    added: before.added + batch.added,
    known: before.known + batch.known,
    refused: before.refused + batch.refused,
  };
}

export async function runImport(
  links: readonly string[],
  name: string,
  initial: Progress,
  report: (progress: Progress) => void,
  shouldStop: () => boolean,
): Promise<Outcome> {
  let progress = initial;

  while (progress.done < links.length) {
    if (shouldStop()) return { ...progress, ending: "stopped" };

    const request = nextBatch(links, progress.done, name);
    const cursor = progress.done + request.links.length;

    // oxlint-disable-next-line eslint/no-await-in-loop -- Batches go one after the other, so the saved cursor is the last batch that finished.
    const answer = await postBatch(request);

    if (answer.kind !== "saved") return { ...progress, ending: answer.kind };

    progress = { done: cursor, counts: summed(progress.counts, answer.counts) };
    report(progress);
  }

  return { ...progress, ending: "finished" };
}

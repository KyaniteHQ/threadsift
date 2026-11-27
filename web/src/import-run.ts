import { type Resume, doneOf, nextBatch, resumeOf } from "../../src/core/contract/import-list.ts";
import { type Counts, postBatch, readImportState } from "./import-api.ts";
import { type Landing, batchLanding } from "./import-landing.ts";
import type { FailedEnding } from "./import-text.ts";
import { IMPORT_BATCH_LINKS } from "./write-deadlines.ts";

export interface Progress {
  readonly done: number;
  readonly counts: Counts;
  readonly uncounted: number;
}

type Ending = "finished" | "stopped" | FailedEnding;

export type Outcome = Progress & { readonly ending: Ending };

export interface Run {
  readonly report: (progress: Progress) => void;
  readonly waiting: (waiting: boolean) => void;
  readonly signal: AbortSignal;
}

type Step =
  | { readonly kind: "advanced"; readonly progress: Progress }
  | { readonly kind: "ended"; readonly ending: Ending; readonly done?: number };

export interface Position {
  readonly progress: Readonly<Progress>;
  readonly seen: Resume;
}

interface Place {
  readonly progress: Readonly<Progress>;
  readonly seen: Resume;
  readonly written: string | undefined;
}

const ENDING_OF = {
  stopped: "stopped",
  lost: "unconfirmed",
  unreachable: "network",
} as const satisfies Readonly<Record<Exclude<Landing, "landed">, Ending>>;

function summed(before: Counts, batch: Counts): Counts {
  return {
    added: before.added + batch.added,
    known: before.known + batch.known,
    refused: before.refused + batch.refused,
  };
}

const ended = (ending: Ending): Step => ({ kind: "ended", ending });

function sameResume(saved: Resume, seen: Resume): boolean {
  return saved.kind === "partial" && seen.kind === "partial"
    ? saved.done === seen.done
    : saved.kind === seen.kind;
}

function startOf(
  links: readonly string[],
  saved: string | null,
  { progress, seen }: Place,
): number {
  return sameResume(resumeOf(saved, links.length), seen) ? progress.done : doneOf(saved);
}

async function confirmed(
  attempt: Parameters<typeof batchLanding>[0],
  { waiting, signal }: Readonly<Run>,
): Promise<Landing> {
  waiting(true);

  try {
    return await batchLanding(attempt, signal);
  } finally {
    waiting(false);
  }
}

async function stepOf(
  links: readonly string[],
  name: string,
  place: Readonly<Place>,
  run: Readonly<Run>,
): Promise<Step> {
  const { progress, written } = place;
  const before = await readImportState(name, run.signal).catch(() => "failed" as const);

  if (before === "failed") return ended(run.signal.aborted ? "stopped" : "network");

  const saved = before?.cursor ?? null;

  if (written !== undefined && saved !== written) {
    return { kind: "ended", ending: "stopped", done: doneOf(saved) };
  }

  const from = written === undefined ? startOf(links, saved, place) : progress.done;

  if (from >= links.length) return { kind: "advanced", progress: { ...progress, done: from } };

  const request = nextBatch(links, from, name, saved, IMPORT_BATCH_LINKS);
  const done = from + request.links.length;
  const answer = await postBatch(request);

  if (answer.kind === "saved") {
    return {
      kind: "advanced",
      progress: { ...progress, done, counts: summed(progress.counts, answer.counts) },
    };
  }

  if (answer.kind !== "unanswered") return ended(answer.kind);

  const landing = await confirmed({ name, through: done, before }, run);

  if (landing !== "landed") return ended(ENDING_OF[landing]);

  return {
    kind: "advanced",
    progress: { ...progress, done, uncounted: progress.uncounted + request.links.length },
  };
}

export async function runImport(
  links: readonly string[],
  name: string,
  { progress: initial, seen }: Readonly<Position>,
  run: Readonly<Run>,
): Promise<Outcome> {
  let progress = initial;
  let written: string | undefined;

  while (progress.done < links.length) {
    if (run.signal.aborted) return { ...progress, ending: "stopped" };

    // oxlint-disable-next-line eslint/no-await-in-loop -- Batches go one after the other, so the saved cursor is the last batch that finished.
    const step = await stepOf(links, name, { progress, seen, written }, run);

    if (step.kind === "ended") {
      return { ...progress, done: step.done ?? progress.done, ending: step.ending };
    }

    progress = step.progress;
    written = String(progress.done);
    run.report(progress);
  }

  return { ...progress, ending: "finished" };
}
